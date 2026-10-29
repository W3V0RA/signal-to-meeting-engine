import { createHmac,timingSafeEqual } from 'node:crypto';
import { hash } from './config.mjs';
export function seal(payload,key) {
  if(typeof key!=='string'||key.length<32)throw Error('Strong signing key required');
  const text=JSON.stringify(payload);
  return {payload:text,signature:createHmac('sha256',key).update(text).digest('hex')};
}
export function unseal(envelope,key) {
  if(typeof key!=='string'||key.length<32||typeof envelope?.payload!=='string'||envelope.payload.length>100000||!/^[a-f0-9]{64}$/.test(envelope.signature??''))throw Error('Release authentication failed');
  const expected=createHmac('sha256',key).update(envelope.payload).digest();
  if(!timingSafeEqual(expected,Buffer.from(envelope.signature,'hex')))throw Error('Release authentication failed');
  return JSON.parse(envelope.payload);
}
export const PREFLIGHT_CHECKS=['receivedAuthentication','tls','replyRouting','suppression','optOut','inboundHealthy','exactMessage'];
export function preflightGaps(envelope,key,config,now,production) {
  try {
    const p=unseal(envelope,key);
    if(p.kind!=='sender-preflight'||p.tenant!==config.tenant||p.sender!==config.business.sender||p.replyTo!==config.business.replyTo) return ['Sender preflight identity mismatch'];
    if(!Number.isFinite(Date.parse(p.checkedAt))||Date.parse(p.checkedAt)>now.getTime()||!Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=now.getTime()||Date.parse(p.expiresAt)>Date.parse(p.checkedAt)+(config.policy.senderProofHours??1)*3600000)return ['Sender preflight expired or malformed'];
    if(production&&p.mode!=='verified-production')return ['Synthetic preflight cannot clear production'];
    if(PREFLIGHT_CHECKS.some(k=>!p.checks?.[k]?.artifactHash||!/^[a-f0-9]{64}$/.test(p.checks[k].artifactHash)))return ['Missing independently verified sender artifacts'];
    return [];
  } catch{return ['Sender preflight authentication failed'];}
}
export function releasePayload(m,p,c,pages,digest,now,preflight) {
  return {kind:'exact-message-release',tenant:c.tenant,messageId:m.id,purpose:m.kind,ordinal:m.ordinal??null,parentId:m.parentId??null,
    threadId:m.threadId??null,recipient:m.recipient,from:c.business.sender,replyTo:c.business.replyTo,
    digest,evidenceHash:hash(pages),preflightHash:hash(preflight),issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+c.policy.releaseMinutes*60000).toISOString()};
}
