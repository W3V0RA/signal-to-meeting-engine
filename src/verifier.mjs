import { authenticate,hash,normalizeEmail } from './config.mjs';
import { seal } from './security.mjs';
import { headersOf,addressFrom,mimePart,messageText } from './text.mjs';
import { classify } from './providers/gmail.mjs';

const canonical=text=>text.replace(/\r\n/g,'\n').trim();
const proofAge=(message,now,maxAge)=>Number.isFinite(Number(message.internalDate))&&Number(message.internalDate)<=now.getTime()&&now.getTime()-Number(message.internalDate)<=maxAge;
const requireCheck=(condition,message)=>{if(!condition)throw Error(message);};

// Reads existing, explicitly selected owned-inbox artifacts. It has no send or draft method.
export async function collectMailboxProof(engine,{sender,receiver,references,token,reviewer,simulation=false}) {
  authenticate(token,engine.keys.admin);
  requireCheck(reviewer?.trim(),'Human verifier identity required');
  const config=engine.config,now=engine.clock(),owned=config.verification?.ownedInbox;
  requireCheck(owned&&owned!==config.business.sender,'Configure a distinct owned verification inbox');
  if(!simulation)requireCheck(sender.mode==='gmail'&&receiver.mode==='gmail'&&!/example\.(com|org)|Fictional/i.test(JSON.stringify(config.business)+owned),'Only real owned Gmail captures can clear production');
  const names=['sent','received','replySent','replyReceived','optOutSent','optOutReceived'];
  requireCheck(names.every(n=>references[n]&&/^[A-Za-z0-9_-]+$/.test(references[n])),'Six provider message references are required');
  const identity=await sender.identity(),receiverProfile=await receiver.api('profile');
  requireCheck(identity.sender===config.business.sender&&identity.replyTo===config.business.replyTo,'Sender identity mismatch');
  requireCheck(normalizeEmail(receiverProfile.emailAddress)===normalizeEmail(owned),'Owned receiving mailbox mismatch');
  const messages=Object.fromEntries(await Promise.all(names.map(async n=>[n,await (['received','replySent','optOutSent'].includes(n)?receiver:sender).message(references[n])])));
  const maxAge=(config.policy.senderProofHours??1)*3600000;
  requireCheck(names.every(n=>proofAge(messages[n],now,maxAge)),'Mailbox verification artifacts are missing, future dated or too old');
  requireCheck(messages.sent.labelIds?.includes('SENT')&&messages.replySent.labelIds?.includes('SENT')&&messages.optOutSent.labelIds?.includes('SENT'),'Expected owned Sent artifacts missing');
  requireCheck(!messages.received.labelIds?.includes('SENT'),'Received artifact is a sent copy');
  const hs=Object.fromEntries(names.map(n=>[n,headersOf(messages[n].payload??{})]));
  const originalId=hs.sent['message-id'];
  requireCheck(originalId&&hs.received['message-id']===originalId,'Sent and received Message-ID mismatch');
  requireCheck(addressFrom(hs.sent.from)===config.business.sender&&addressFrom(hs.received.from)===config.business.sender&&addressFrom(hs.sent.to)===normalizeEmail(owned)&&addressFrom(hs.received.to)===normalizeEmail(owned),'Actual sent/received route mismatch');
  requireCheck(addressFrom(hs.sent['reply-to']??hs.sent.from)===config.business.replyTo&&addressFrom(hs.received['reply-to']??hs.received.from)===config.business.replyTo,'Actual Reply-To mismatch');
  const sentBody=mimePart(messages.sent.payload??{},'text/plain'),receivedBody=mimePart(messages.received.payload??{},'text/plain');
  requireCheck(sentBody&&canonical(sentBody)===canonical(receivedBody)&&hs.sent.subject===hs.received.subject,'Delivered exact subject/body differs from Sent');
  const domain=config.business.sender.split('@')[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const auth=(messages.received.payload?.headers??[]).find(h=>h.name.toLowerCase()==='authentication-results'&&/^mx\.google\.com\s*;/i.test(h.value))?.value??'';
  requireCheck(new RegExp(`spf=pass[^;]*smtp\\.mailfrom=(?:[^@; ]+@)?${domain}(?:[; ]|$)`,'i').test(auth)&&new RegExp(`dkim=pass[^;]*header\\.(?:d=${domain}|i=(?:[^@; ]*)@${domain})(?:[; ]|$)`,'i').test(auth)&&new RegExp(`dmarc=pass[^;]*header\\.from=${domain}(?:[; ]|$)`,'i').test(auth),'Receiving gateway SPF DKIM DMARC proof missing or mismatched');
  const received=(messages.received.payload?.headers??[]).filter(h=>h.name.toLowerCase()==='received').map(h=>h.value);
  const gateway=received.find(value=>/\bby\s+mx\.google\.com\b/i.test(value))??'';
  requireCheck(/\bwith\s+(?:ESMTPS|SMTPS)\b|version=TLS/i.test(gateway),'Receiving gateway TLS transport proof missing');
  for(const pair of [['replySent','replyReceived'],['optOutSent','optOutReceived']]) {
    const [out,incoming]=pair;
    requireCheck(hs[out]['message-id']&&hs[out]['message-id']===hs[incoming]['message-id']&&addressFrom(hs[out].from)===normalizeEmail(owned)&&addressFrom(hs[incoming].from)===normalizeEmail(owned),'Owned reply capture mismatch');
    requireCheck(addressFrom(hs[out].to)===config.business.replyTo&&messages[incoming].threadId===messages.sent.threadId&&hs[incoming]['in-reply-to']===originalId,'Reply routing or original thread mismatch');
    requireCheck(canonical(mimePart(messages[out].payload,'text/plain'))===canonical(mimePart(messages[incoming].payload,'text/plain')),'Owned sent and received reply body mismatch');
    requireCheck(Number(messages[incoming].internalDate)>=Number(messages.sent.internalDate),'Reply predates verified send');
  }
  requireCheck(classify(messageText(messages.replyReceived.payload))!=='unsubscribe','Normal reply artifact is an opt-out');
  requireCheck(classify(messageText(messages.optOutReceived.payload))==='unsubscribe','Actual owned unsubscribe reply missing');
  const expire=Math.min(...names.map(n=>Number(messages[n].internalDate)+maxAge),now.getTime()+maxAge);
  requireCheck(expire>now.getTime(),'Verification artifacts already expired');
  const mode=simulation?'simulation':'verified-production';
  const artifact={tenant:config.tenant,configHash:hash(config),mode,ownedInbox:owned,reviewer,checkedAt:now.toISOString(),expiresAt:new Date(expire).toISOString(),references,hashes:Object.fromEntries(names.map(n=>[n,hash(messages[n])])),scope:'Existing actual mailbox artifacts plus local suppression enforcement; no new message sent'};
  // Observe a genuine opt-out on the controlled route; never clear suppression automatically.
  engine.store.transaction(()=>{
    engine.store.suppress(owned,'Observed owned verification unsubscribe',now);
    requireCheck(engine.store.suppressed(owned),'Suppression persistence or refusal failed');
    engine.store.put('verificationArtifact',hash(artifact),artifact);
    engine.store.db.prepare('INSERT OR IGNORE INTO verification_events VALUES(?,?,?,?,?,?,?)').run(hash(artifact),'mailbox-proof',hash(artifact),mode,artifact.checkedAt,artifact.expiresAt,JSON.stringify({reviewer,scope:artifact.scope,references}));
    const checks=Object.fromEntries(['receivedAuthentication','tls','replyRouting','suppression','optOut','inboundHealthy','exactMessage'].map(k=>[k,{artifactHash:hash({kind:k,artifact})}]));
    const envelope=seal({kind:'sender-preflight',mode,tenant:config.tenant,sender:config.business.sender,replyTo:config.business.replyTo,checkedAt:artifact.checkedAt,expiresAt:artifact.expiresAt,checks},engine.keys.preflight);
    engine.store.put('installation','preflight',{envelope,artifactId:hash(artifact)});
    engine.store.audit('mailbox_proof_collected','installation',now,{mode,artifactId:hash(artifact),reviewer});
  });
  return artifact;
}

export async function verifyIntegrations(engine,{mail,research,calendar,notion,token,reviewer,simulation=false}) {
  authenticate(token,engine.keys.admin);
  requireCheck(reviewer?.trim(),'Human verifier identity required');
  const config=engine.config,now=engine.clock();
  const identity=await mail.identity();requireCheck(identity.sender===config.business.sender&&identity.replyTo===config.business.replyTo,'Gmail identity mismatch');
  const sources=await Promise.all(config.discovery.sources.map(url=>research.fetch(url,now)));
  requireCheck(sources.length>0,'At least one approved research source is required');
  let calendarRead=!config.integrations.calendarId,notionRead=!config.integrations.notionDataSourceId;
  if(!calendarRead){await calendar.check();calendarRead=true;}
  if(!notionRead){await notion.check();notionRead=true;}
  const worker=engine.store.get('installation','workerHealth');
  requireCheck(worker&&worker.configHash===hash(config)&&now.getTime()-Date.parse(worker.at)<config.policy.inboundFreshMinutes*60000&&worker.ok===true,'Fresh successful worker verification is required');
  if(!simulation)requireCheck(mail.mode==='gmail'&&sources.every(p=>p.mode==='public-web')&&worker.mode==='production','Mock integrations cannot clear production');
  const checks={kind:'integration-checks',mode:simulation?'simulation':'production',tenant:config.tenant,configHash:hash(config),reviewer,
    gmailIdentity:true,sourceCapture:true,workerHealth:true,calendarRead,notionRead,sourceHashes:sources.map(p=>hash(p)),checkedAt:now.toISOString(),expiresAt:new Date(now.getTime()+3600000).toISOString()};
  engine.store.transaction(()=>{
    engine.store.put('installation','integrationChecks',seal(checks,engine.keys.preflight));
    engine.store.db.prepare('INSERT OR IGNORE INTO verification_events VALUES(?,?,?,?,?,?,?)').run(hash(checks),'integration-checks',hash(checks),checks.mode,checks.checkedAt,checks.expiresAt,JSON.stringify({reviewer,sourceHashes:checks.sourceHashes}));
    engine.store.audit('integrations_verified','installation',now,{mode:checks.mode,reviewer});
  });return checks;
}
