import { randomUUID } from 'node:crypto';
import { email,normalizeEmail } from '../config.mjs';
export function rawMessage(m) {
  for(const route of [m.from,m.replyTo,m.recipient])if(!email(route))throw Error('Invalid email header');
  for(const field of [m.displayName,m.subject,m.rfcParentId??''])if(typeof field!=='string'||/[\r\n]/.test(field))throw Error('Header injection');
  if(m.rfcParentId&&!/^<[^<>\s]+@[^<>\s]+>$/.test(m.rfcParentId))throw Error('Malformed parent message ID');
  const rfcId=`<${randomUUID()}@${m.from.split('@')[1]}>`;
  const encoded=s=>`=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`;
  const headers=[`From: ${encoded(m.displayName)} <${m.from}>`,`Reply-To: ${m.replyTo}`,`To: ${m.recipient}`,`Subject: ${encoded(m.subject)}`,`Message-ID: ${rfcId}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64'];
  if(m.rfcParentId)headers.push(`In-Reply-To: ${m.rfcParentId}`,`References: ${m.rfcParentId}`);
  const body=Buffer.from(m.body.replace(/\r?\n/g,'\r\n')).toString('base64').match(/.{1,76}/g)?.join('\r\n')??'';
  return {rfcId,raw:Buffer.from(headers.join('\r\n')+'\r\n\r\n'+body).toString('base64url')};
}
export function classify(text) {
  // Negative intent takes priority over positive words embedded in an opt-out.
  if(/\b(unsubscribe|remove me|stop emailing|do not contact|not interested)\b/i.test(text))return 'unsubscribe';
  if(/\b(please send (?:me )?(?:the )?(?:booking|calendar) link|yes[, ]+please (?:share|send) (?:the )?(?:booking|calendar) link)\b/i.test(text))return 'interest';
  return 'reply';
}
const headers=payload=>Object.fromEntries((payload.headers??[]).map(h=>[h.name.toLowerCase(),h.value]));
function plain(payload){return (payload.mimeType==='text/plain'&&payload.body?.data?Buffer.from(payload.body.data,'base64url').toString('utf8'):'')+(payload.parts??[]).map(plain).join('\n');}
function deliveryStatus(payload){return (payload.mimeType==='message/delivery-status'&&payload.body?.data?Buffer.from(payload.body.data,'base64url').toString('utf8'):'')+(payload.parts??[]).map(deliveryStatus).join('\n');}
export function inboundFromThread(thread,recipient,sender) {
  const events=[];
  for(const m of thread.messages??[]) {
    const h=headers(m.payload??{}),from=h.from?.match(/(?:<)?([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?:>)?/)?.[1]?.toLowerCase();
    if(m.labelIds?.includes('SENT')||from===sender.toLowerCase())continue;
    const text=plain(m.payload??{}),status=deliveryStatus(m.payload??{});
    const bounced=status.match(/Final-Recipient:\s*rfc822;\s*([^\s\r\n]+)/i)?.[1]?.toLowerCase()===recipient.toLowerCase()&&/^Status:\s*[45]\./mi.test(status);
    if(from!==recipient.toLowerCase()&&!bounced)continue;
    events.push({id:m.id,threadId:thread.id,recipient,classification:bounced?'bounce':classify(text),at:new Date(Number(m.internalDate)).toISOString()});
  }
  return events;
}
export class Gmail {
  mode='gmail';
  constructor({credentials,business,fetcher=fetch}){this.credentials=credentials;this.business=business;this.fetcher=fetcher;}
  async token() {
    if(this.access&&Date.now()<this.access.expires)return this.access.token;
    const c=this.credentials;
    if(!c.clientId||!c.clientSecret||!c.refreshToken)throw Error('Google OAuth credentials required');
    const r=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:c.refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('OAuth refresh failed');const j=await r.json();if(!j.access_token)throw Error('OAuth response invalid');
    this.access={token:j.access_token,expires:Date.now()+Math.max(0,(j.expires_in??0)-60)*1000};return j.access_token;
  }
  async api(path,options={}) {
    const response=await this.fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{...options,headers:{Authorization:`Bearer ${await this.token()}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`Gmail request failed (${response.status}); no automatic send retry`);
    return response.json();
  }
  async identity() {
    const [profile,aliases]=await Promise.all([this.api('profile'),this.api('settings/sendAs')]);
    const alias=aliases.sendAs?.find(x=>normalizeEmail(x.sendAsEmail)===normalizeEmail(this.business.sender)&&x.verificationStatus==='accepted');
    if(!alias||!profile.emailAddress||normalizeEmail(alias.replyToAddress??alias.sendAsEmail)!==normalizeEmail(this.business.replyTo))throw Error('Configured Gmail From/Reply-To unavailable');
    return {sender:this.business.sender,replyTo:this.business.replyTo,mailbox:profile.emailAddress};
  }
  async inspect(recipient,threadId) {
    if(!email(recipient))throw Error('Invalid recipient');
    const threads=[];let pageToken;
    for(let page=0;page<20;page++) {
      const params=new URLSearchParams({q:`in:anywhere {from:${recipient} to:${recipient}}`,maxResults:'100'});if(pageToken)params.set('pageToken',pageToken);
      const result=await this.api(`threads?${params}`);threads.push(...(result.threads??[]));pageToken=result.nextPageToken;
      if(!pageToken)break;if(page===19)throw Error('History overflow; manual review required');
    }
    let inbound=[];
    if(threadId) {const thread=await this.api(`threads/${encodeURIComponent(threadId)}?format=full`);inbound=inboundFromThread(thread,recipient,this.business.sender);}
    return {priorThreads:threads.map(t=>t.id),inbound};
  }
  async send(message) {
    const {raw,rfcId}=rawMessage(message);
    const body={raw};if(message.threadId)body.threadId=message.threadId;
    const result=await this.api('messages/send',{method:'POST',body:JSON.stringify(body)});
    return {...result,rfcId};
  }
}
