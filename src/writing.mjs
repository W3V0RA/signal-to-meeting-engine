import { hash } from './config.mjs';
export function bodyFor(message,prospect,config) {
  const name=prospect.contact?.name?.trim().split(/\s+/)[0];
  const greeting=name?`Hi ${name},`:'Hello,';
  const main=message.sections.map(s=>s.text).join('\n\n');
  return `${greeting}\n\n${main}\n\n${config.business.signature}\n\n${config.policy.optOut}`;
}
export function writingGaps(m,p,c,previous=[]) {
  const gaps=[],rule=c.policy.writing,main=m.sections?.map(s=>s.text).join('\n\n')??'';
  if(typeof m.subject!=='string'||/[\r\n]/.test(m.subject)||!m.sections?.length) return ['Message structure invalid'];
  if(m.body!==bodyFor(m,p,c))gaps.push('Body differs from reviewed claim structure or signature');
  if(/<[^>]*>|utm_|tracking pixel/i.test(m.body))gaps.push('Plain text only');
  if(m.kind==='initial') {
    const words=m.subject.trim().split(/\s+/);
    if(words.length<rule.subjectWords[0]||words.length>rule.subjectWords[1]||m.subject.length<rule.subjectCharacters[0]||m.subject.length>rule.subjectCharacters[1]||/[^A-Za-z ]/.test(m.subject)||words.some(w=>w[0]!==w[0].toUpperCase())||words.includes(p.contact?.name?.split(' ')[0]))gaps.push('Subject format');
    const count=main.trim().split(/\s+/).length;
    if(count<rule.firstTouchWords[0]||count>rule.firstTouchWords[1])gaps.push('First-touch word count');
    if(!/\b(could|might|may)\b/i.test(m.sections[0].text))gaps.push('Opening needs an honest possible outcome');
  }
  if((main.match(/\?/g)??[]).length!==1||!m.sections.at(-1)?.text.endsWith('?'))gaps.push('One soft closing question required');
  if(/^(re:|fwd:)|quick question/i.test(m.subject))gaps.push('Deceptive or generic subject');
  const claims=new Map(p.claims.map(x=>[x.id,x]));
  if(!m.sections.some(s=>s.type==='fact'))gaps.push('Cited company fact required');
  for(const s of m.sections) {
    if(s.type==='fact') {if(claims.get(s.claimId)?.text!==s.text)gaps.push('Message claim lacks exact source support');}
    else if(s.type==='possibility') {
      if(!/\b(could|might|may|would)\b/i.test(s.text))gaps.push('Hypothesis must be framed as possibility');
    } else if(s.type==='question') {if(!s.text.endsWith('?'))gaps.push('Discovery question invalid');}
    else if(s.type==='offer') {if(s.text!==c.offers.find(o=>o.id===p.offerId)?.description)gaps.push('Offer wording not configured');}
    else gaps.push('Unreviewed sentence type');
    // Do not let a good citation whitewash a different unsupported assertion.
    if(s.type!=='fact'&&/you (?:use|rely on|struggle|are losing)|your (?:manual|broken|slow|outdated)|we (?:saved|increased)|guarantee|\d+%|already built/i.test(s.text))gaps.push('Unsupported pain or performance assertion');
  }
  const permittedLinks=[c.business.website];
  if(m.kind==='response'&&m.bookingRequested)permittedLinks.push(c.integrations.bookingUrl);
  const links=m.body.match(/https?:\/\/[^\s]+/g)??[];
  if(links.some(url=>!permittedLinks.includes(url)))gaps.push('Unapproved link');
  if(m.kind!=='response'&&m.body.includes(c.integrations.bookingUrl))gaps.push('Booking is interest-gated');
  const opening=m.sections[0].text.toLowerCase().split(/\s+/).slice(0,7).join(' ');
  for(const old of previous.filter(x=>x.id!==m.id&&x.prospectId!==m.prospectId).slice(-10)) {
    if(old.subject===m.subject || old.sections[0].text.toLowerCase().split(/\s+/).slice(0,7).join(' ')===opening || old.sections.at(-1).text===m.sections.at(-1).text)gaps.push('Portfolio repetition needs revision');
  }
  return [...new Set(gaps)];
}
export function messageDigest(m,p,config,pages) {
  return hash({tenant:config.tenant,id:m.id,kind:m.kind,parentId:m.parentId??null,ordinal:m.ordinal??null,threadId:m.threadId??null,
    rfcParentId:m.rfcParentId??null,recipient:m.recipient,subject:m.subject,body:m.body,sections:m.sections,
    from:config.business.sender,replyTo:config.business.replyTo,displayName:config.business.displayName,
    prospect:p,config,pages:pages.map(s=>({url:s.url,digest:s.digest,checkedAt:s.checkedAt,mode:s.mode})),bookingRequested:!!m.bookingRequested});
}
