import { authenticate } from './config.mjs';
import { headersOf,addressFrom,mimePart,decodeHeader } from './text.mjs';

export async function reconcileAttempt(engine,id,{mail,token,reviewer,simulation=false}) {
  authenticate(token,engine.keys.admin);
  if(!reviewer?.trim())throw Error('Human reconciliation reviewer required');
  if(!simulation&&mail.mode!=='gmail')throw Error('Actual Gmail readback required');
  const attempt=engine.store.db.prepare('SELECT * FROM attempts WHERE message_id=?').get(id),record=engine.store.get('attemptContext',id);
  if(!attempt||!['uncertain','reserved'].includes(attempt.status)||!record||!attempt.rfc_id)throw Error('Keep hold: original reserved Message-ID and exact context are required');
  const identity=await mail.identity();
  if(identity.sender!==record.business.sender||identity.replyTo!==record.business.replyTo)throw Error('Original sender identity unavailable');
  const messages=await mail.reconcileAttempt(attempt);
  if(messages.length!==1)return {status:'held',reason:messages.length?'Multiple provider matches need investigation':'No matching Sent artifact; absence does not prove unsent'};
  const message=messages[0],h=headersOf(message.payload??{}),body=mimePart(message.payload??{},'text/plain');
  const canonical=text=>text.replace(/\r\n/g,'\n').trim();
  if(!message.id||!message.threadId||!message.labelIds?.includes('SENT')||h['message-id']!==attempt.rfc_id||addressFrom(h.from)!==record.business.sender||addressFrom(h['reply-to']??h.from)!==record.business.replyTo||addressFrom(h.to)!==attempt.recipient||decodeHeader(h.subject)!==record.m.subject||canonical(body)!==canonical(record.m.body))throw Error('Provider Sent readback does not match the exact original attempt');
  engine.store.transaction(()=>{
    const current=engine.store.db.prepare('SELECT status FROM attempts WHERE message_id=?').get(id);
    if(!['uncertain','reserved'].includes(current.status))throw Error('Attempt changed during reconciliation');
    engine.store.db.prepare("UPDATE attempts SET status='sent',provider_id=?,thread_id=? WHERE message_id=?").run(message.id,message.threadId,id);
    const sentTime=Number(message.internalDate),sentAt=Number.isFinite(sentTime)&&sentTime>0&&sentTime<=engine.clock().getTime()?new Date(sentTime).toISOString():null;
    const stored=engine.store.get('message',id);engine.store.put('message',id,{...stored,state:'sent',...(sentAt?{sentAt}:{})});
    if(record.m.kind==='initial')engine.store.put('sequence',id,{stopped:false,sentAt:sentAt??attempt.at,initialDigest:record.digest,configHash:record.configHash});
    engine.store.audit('provider_acceptance_reconciled',id,engine.clock(),{reviewer,providerId:message.id,simulation});
    engine.store.holdSending('Reconciled provider acceptance; review inbound and verification before activation',engine.clock());
  });
  return {status:'provider_accepted',simulation,providerId:message.id,sendingHeld:true};
}
