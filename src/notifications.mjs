import { email,hash } from './config.mjs';
import { localParts } from './time.mjs';
import { activationGaps } from './readiness.mjs';
import { preflightGaps } from './security.mjs';

export function prepareNotification(engine,{id,kind,subject,body}) {
  const recipient=engine.config.integrations.ownerEmail;
  if(!email(recipient)||!['digest','alert','booking'].includes(kind)||/[\r\n]/.test(subject))throw Error('Invalid owner notification');
  const full=`${body}\n\n${engine.config.business.signature}`;
  engine.store.db.prepare('INSERT OR IGNORE INTO notifications(id,kind,recipient,subject,body,created_at) VALUES(?,?,?,?,?,?)').run(id,kind,recipient,subject,full,engine.clock().toISOString());
  return engine.store.db.prepare('SELECT * FROM notifications WHERE id=?').get(id);
}

export function approvalDigest(engine,day) {
  const messages=engine.store.list('message').filter(m=>m.state==='review'&&!engine.store.get('approval',m.id));
  const items=messages.map(m=>{
    const p=engine.store.get('prospect',m.prospectId);
    return `${p.companyName} — ${m.kind}\nRecipient: ${m.recipient}\nSubject: ${m.subject}\nReview: ${engine.config.operations?.consoleUrl??'http://127.0.0.1:3401'}/#message=${encodeURIComponent(m.id)}`;
  });
  const body=`${engine.config.business.name} approval digest\n${day}\n\n${messages.length} exact messages await individual review.\n\n${items.join('\n\n')||'No pending message approvals.'}\n\nOpening a review link does not approve or send any message. Sending remains subject to every verification and suppression gate.`;
  return prepareNotification(engine,{id:`digest:${day}`,kind:'digest',subject:`Message Review For ${day}`,body});
}

export function ownerAlerts(engine) {
  let prepared=0;
  for(const work of engine.store.list('work').filter(w=>w.kind==='owner_alert'&&w.state==='pending')) {
    const detail=engine.store.get('inboundDetail',work.inboundId??''),p=engine.store.get('prospect',work.prospectId);
    const outcome=work.eventId?engine.store.db.prepare('SELECT detail FROM outcomes WHERE id=?').get(`booking:${work.eventId}`):null,booking=outcome?JSON.parse(outcome.detail):null;
    const body=booking?`Calendar outcome: ${work.classification}\nCompany: ${p?.companyName??'Review required'}\nEvent: ${work.eventId}\nStart: ${booking.start??'Cancelled'}\nProvider: ${booking.provider}\n\nReview: ${engine.config.operations?.consoleUrl??'http://127.0.0.1:3401'}`:`Inbound ${work.classification}\nCompany: ${p?.companyName??'Review required'}\nReceived: ${detail?.at??'Unknown'}\n\n${detail?.text?.slice(0,2000)??'Read the associated mailbox event.'}\n\nReview: ${engine.config.operations?.consoleUrl??'http://127.0.0.1:3401'}\nFollow-ups have stopped. Any response needs separate exact-copy human approval.`;
    prepareNotification(engine,{id:`alert:${work.inboundId??`${work.eventId}:${work.classification}`}`,kind:booking?'booking':'alert',subject:`${booking?'Calendar':'Inbound'} ${work.classification} Requires Review`,body});
    engine.store.put('work',work.id,{...work,state:'prepared'});prepared++;
  }
  return prepared;
}

export function mailboxAdmission(engine,now) {
  const attempts=engine.store.db.prepare('SELECT at,local_day FROM attempts').all();
  const notifications=engine.store.db.prepare('SELECT attempted_at FROM notifications WHERE attempted_at IS NOT NULL').all();
  const times=[...attempts.map(a=>({at:a.at,day:a.local_day})),...notifications.map(n=>({at:n.attempted_at,day:localParts(new Date(n.attempted_at),engine.config.policy).day}))];
  const day=localParts(now,engine.config.policy).day,gaps=[];
  if(times.filter(t=>t.day===day).length>=engine.config.policy.dailyMailboxCap)gaps.push('Daily mailbox cap');
  const latest=times.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
  if(latest&&now.getTime()-Date.parse(latest.at)<engine.config.policy.minimumSpacingMinutes*60000)gaps.push('Minimum spacing');
  return gaps;
}

export async function deliverOwnerNotification(engine,id,{enabled=false,simulate=false}={}) {
  if(!simulate&&(!enabled||engine.flags.dryRun||!engine.flags.liveSend||!engine.flags.autonomy))return {status:'dry_run'};
  if(simulate&&(engine.mail.mode!=='mock'||!engine.flags.dryRun||engine.flags.liveSend))throw Error('Notification simulation requires disabled mock mail');
  if(!simulate&&activationGaps(engine).length)throw Error('Owner notification held by installation verification');
  const notification=engine.store.db.prepare('SELECT * FROM notifications WHERE id=?').get(id);
  if(!notification||notification.recipient!==engine.config.integrations.ownerEmail)throw Error('Owner-only notification recipient mismatch');
  if(notification.state!=='pending'||notification.attempted_at)throw Error('Prior notification attempt cannot retry automatically');
  const now=engine.clock();
  if(!simulate) {
    const identity=await engine.mail.identity();if(identity.sender!==engine.config.business.sender||identity.replyTo!==engine.config.business.replyTo)throw Error('Owner notification sender mismatch');
    const proof=engine.store.get('installation','preflight');if(preflightGaps(proof?.envelope,engine.keys.preflight,engine.config,now,true).length)throw Error('Owner notification sender proof missing');
  }
  const message={id,subject:notification.subject,body:notification.body,recipient:notification.recipient,from:engine.config.business.sender,replyTo:engine.config.business.replyTo,displayName:engine.config.business.displayName};
  const prepared=engine.mail.prepare?.(message);
  engine.store.transaction(()=>{
    const gaps=mailboxAdmission(engine,now);if(gaps.length)throw Error(gaps.join('; '));
    const current=engine.store.db.prepare('SELECT * FROM notifications WHERE id=?').get(id);
    if(current.state!=='pending'||current.attempted_at||hash(current)!==hash(notification))throw Error('Notification changed or concurrently reserved');
    engine.store.db.prepare("UPDATE notifications SET state='reserved',attempted_at=? WHERE id=?").run(now.toISOString(),id);
    engine.store.audit('owner_notification_reserved',id,now,{simulation:simulate});
  });
  try {
    if(!simulate&&activationGaps(engine).length)throw Error('Installation hold changed before owner transport');
    const result=await engine.mail.send(message,prepared);if(!result.id)throw Error('Owner transport confirmation missing');
    engine.store.db.prepare("UPDATE notifications SET state='sent',provider_id=? WHERE id=?").run(result.id,id);engine.store.audit('owner_notification_accepted',id,engine.clock(),{simulation:simulate});return {status:simulate?'simulated':'provider_accepted',id:result.id};
  }catch(error){engine.store.db.prepare("UPDATE notifications SET state='uncertain' WHERE id=?").run(id);engine.store.audit('owner_notification_uncertain',id,engine.clock());throw Error('Uncertain owner notification held; no automatic retry',{cause:error});}
}
