import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { dashboard,learning,syncNotion } from '../src/reporting.mjs';
import { ownerAlerts } from '../src/notifications.mjs';
import { MockNotion } from '../src/providers/mock.mjs';
import { followupDue,inWindow,nextWindow,localParts } from '../src/time.mjs';

test('offline vertical slice: research approval release send reply response booking projection audit learning',async()=>{
  const f=fixture();f.ready();const sent=await f.simulate();assert.equal(sent.status,'simulated');
  assert.equal(f.engine.planFollowups(f.s.draft.id).length,3);
  f.setTime('2026-10-12T16:00:00Z');
  const event={id:'fictional-reply',threadId:sent.threadId,recipient:f.s.prospect.contact.email,classification:'interest',at:f.now().toISOString()};
  f.engine.ingest(event,f.keys.inbound);assert.ok(f.engine.planFollowups(f.s.draft.id).every(w=>w.state==='cancelled'));
  const work=f.store.get('work',`response:${event.id}`);
  const response=f.engine.draft({...work,id:'fictional-response',subject:'A Proposed Customer Update Review',bookingRequested:true,sections:[
    {type:'possibility',text:'We could review one proposed update together.'},{type:'fact',claimId:'schedule',text:f.s.prospect.claims[0].text},
    {type:'question',text:`Would a time at ${f.config.integrations.bookingUrl} work for you?`} ]});
  assert.throws(()=>f.release(response.id),/approval/);f.approve(response.id);f.release(response.id);
  assert.equal((await f.simulate(response.id)).status,'simulated');
  const booking=f.engine.verifyBooking(f.s.draft.id,{id:'fictional-event',provider:'mock-calendar',status:'confirmed',organizer:f.config.business.sender,start:'2026-10-15T15:00:00Z',end:'2026-10-15T15:30:00Z',attendees:[{email:f.s.prospect.contact.email,accepted:true}]},f.keys.inbound);
  assert.equal(booking.simulation,true);const notion=new MockNotion();assert.equal((await syncNotion(f.engine,notion)).written,1);assert.equal((await syncNotion(f.engine,notion)).written,0);
  assert.equal(dashboard(f.store).bookings,1);assert.equal(learning(f.store).rulesChanged,false);assert.equal(learning(f.store).sampleSize,1);assert.equal(learning(f.store).positiveReplyRate,1);assert.ok(f.store.db.prepare('SELECT COUNT(*) n FROM audit').get().n>=10);
  const projection=[...notion.pages.values()][0];assert.equal(projection.state,'interest');assert.match(projection.nextAction,/response/i);assert.equal(f.store.get('work',`response:${event.id}`).state,'completed');
  const calendarEvent={id:'another',provider:'mock-calendar',status:'confirmed',organizer:f.config.business.sender,start:'2026-10-15T15:00:00Z',end:'2026-10-15T15:30:00Z',attendees:[{email:f.s.prospect.contact.email,accepted:true}]};
  for(const bad of [{organizer:'other@example.org'},{attendees:[{email:'other@example.com',accepted:true}]},{end:undefined},{start:'invalid'},{end:'2026-10-15T14:00:00Z'}])assert.throws(()=>f.engine.verifyBooking(f.s.draft.id,{...calendarEvent,...bad},f.keys.inbound),/event required/);
  f.engine.verifyBooking(f.s.draft.id,{id:'fictional-event',status:'cancelled',provider:'mock-calendar'},f.keys.inbound);assert.equal(dashboard(f.store).bookings,0);assert.equal(learning(f.store).meetingRate,0);
  assert.equal(ownerAlerts(f.engine),3);assert.equal(ownerAlerts(f.engine),0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM notifications WHERE kind='booking'").get().n,2);
  const auditCount=f.store.db.prepare('SELECT COUNT(*) n FROM audit').get().n;f.engine.verifyBooking(f.s.draft.id,{id:'fictional-event',status:'cancelled',provider:'mock-calendar'},f.keys.inbound);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM audit').get().n,auditCount);f.store.close();
});
test('later inbound revokes an already approved pending response',async()=>{
  const f=fixture();f.ready();const sent=await f.simulate();
  f.engine.ingest({id:'first',threadId:sent.threadId,recipient:f.s.prospect.contact.email,classification:'interest',at:f.now().toISOString()},f.keys.inbound);
  const m=f.engine.draft({...f.store.get('work','response:first'),id:'pending-response',subject:'A Proposed Customer Update Review',sections:[{type:'possibility',text:'We could review one example.'},{type:'fact',claimId:'schedule',text:f.s.prospect.claims[0].text},{type:'question',text:'Would that be useful?'}]});
  f.approve(m.id);f.release(m.id);f.setTime('2026-10-12T15:01:00Z');
  f.engine.ingest({id:'second',threadId:sent.threadId,recipient:f.s.prospect.contact.email,classification:'reply',at:f.now().toISOString()},f.keys.inbound);
  assert.equal(f.store.get('approval',m.id),null);assert.equal(f.store.get('release',m.id),null);assert.ok(f.engine.baseGaps(m.id,f.now()).some(x=>x.includes('superseded')));f.store.close();
});
test('concurrent distinct drafts cannot deliver the same follow-up touch twice',async()=>{
  const f=fixture();f.ready();await f.simulate();const work=f.engine.planFollowups(f.s.draft.id)[0];f.setTime(work.dueAt);f.refresh();
  for(const id of ['touch-one','touch-two']){f.engine.draft({...work,id,subject:'A Small Customer Update Review',sections:[{type:'possibility',text:'A checked handoff could make sharing clearer.'},{type:'fact',claimId:'schedule',text:f.s.prospect.claims[0].text},{type:'question',text:'Would that handoff be useful?'}]});f.release(id);}
  const results=await Promise.allSettled([f.simulate('touch-one'),f.simulate('touch-two')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.mail.sent.length,2);f.store.close();
});
test('missing sequence authorization cannot release a follow-up',async()=>{
  const f=fixture();f.approve(undefined,{allowFollowups:false});f.release();await f.simulate();assert.deepEqual(f.engine.planFollowups(f.s.draft.id),[]);f.store.close();
});
test('follow-up order and maximum are enforced without score thresholds',async()=>{
  const f=fixture();f.ready();const sent=await f.simulate();f.setTime('2026-10-16T15:00:00Z');f.refresh();
  for(const ordinal of [0,2,4]) {const m=f.engine.draft({id:`bad-touch-${ordinal}`,kind:'followup',parentId:f.s.draft.id,prospectId:f.s.prospect.id,threadId:sent.threadId,rfcParentId:sent.rfcId,ordinal,dueAt:f.now().toISOString(),subject:'A Small Customer Update Review',sections:[{type:'possibility',text:'A reviewed handoff could clarify sharing.'},{type:'fact',claimId:'schedule',text:f.s.prospect.claims[0].text},{type:'question',text:'Would that help?'}]});assert.throws(()=>f.release(m.id),/order or limit/);}f.store.close();
});
for(const classification of ['reply','interest','bounce','unsubscribe'])test(`${classification} cancels sequence idempotently`,async()=>{
  const f=fixture();f.ready();const sent=await f.simulate();f.engine.planFollowups(f.s.draft.id);
  const event={id:'event',threadId:sent.threadId,recipient:f.s.prospect.contact.email,classification,at:f.now().toISOString()};
  assert.equal(f.engine.ingest(event,f.keys.inbound).sequenceStopped,true);assert.equal(f.engine.ingest(event,f.keys.inbound).duplicate,true);
  assert.ok(f.engine.planFollowups(f.s.draft.id).every(w=>w.state==='cancelled'));
  assert.equal(f.store.suppressed(event.recipient),['bounce','unsubscribe'].includes(classification));f.store.close();
});
test('wrong inbound authentication recipient thread and timestamp are rejected',async()=>{
  const f=fixture();f.ready();const sent=await f.simulate();const event={id:'event',threadId:sent.threadId,recipient:f.s.prospect.contact.email,classification:'reply',at:f.now().toISOString()};
  assert.throws(()=>f.engine.ingest(event,'wrong'),/Authentication/);
  for(const bad of [{threadId:'other'},{recipient:'other@example.com'},{at:'invalid'},{at:'2027-01-01T00:00:00Z'}])assert.throws(()=>f.engine.ingest({...event,...bad},f.keys.inbound),/mismatch|invalid/);f.store.close();
});
test('personalized follow-up uses initial authorization but new purpose-bound release',async()=>{
  const f=fixture();f.ready();await f.simulate();const work=f.engine.planFollowups(f.s.draft.id)[0];f.setTime(work.dueAt);f.refresh();
  const draft=f.engine.draft({...work,id:work.id,subject:'A Small Customer Update Review',sections:[{type:'possibility',text:'One reviewed handoff could show which dates are ready to share.'},{type:'fact',claimId:'schedule',text:f.s.prospect.claims[0].text},{type:'question',text:'Would reviewing that specific handoff be useful?'}]});
  f.release(draft.id);assert.equal((await f.simulate(draft.id)).status,'simulated');assert.equal(f.mail.sent[1].threadId,f.mail.sent[0].threadId);assert.equal(f.engine.planFollowups(f.s.draft.id)[0].state,'completed');f.store.close();
});
test('inbound poll cancels a drafted due follow-up immediately before dispatch',async()=>{
  const f=fixture();f.ready();const sent=await f.simulate();const work=f.engine.planFollowups(f.s.draft.id)[0];f.setTime(work.dueAt);f.refresh();
  f.engine.draft({...work,id:work.id,subject:'A Small Customer Update Review',sections:[{type:'possibility',text:'A reviewed handoff could make sharing clearer.'},{type:'fact',claimId:'schedule',text:f.s.prospect.claims[0].text},{type:'question',text:'Would that example be useful?'}]});f.release(work.id);
  f.mail.events.push({id:'reply',threadId:sent.threadId,recipient:f.s.prospect.contact.email,classification:'reply',at:f.now().toISOString()});
  await assert.rejects(f.simulate(work.id),/cancelled|authentication|Inbound/);assert.equal(f.mail.sent.length,1);f.store.close();
});
for(const permission of ['initial','uninterested-response'])test(`booking link blocked for ${permission}`,async()=>{
  const f=fixture();
  if(permission==='initial') {f.engine.draft({...f.s.draft,bookingRequested:true});f.approve();assert.throws(()=>f.release(),/Booking|purpose/);}
  else {f.ready();const sent=await f.simulate();f.engine.ingest({id:'reply',threadId:sent.threadId,recipient:f.s.prospect.contact.email,classification:'reply',at:f.now().toISOString()},f.keys.inbound);
    const work=f.store.get('work','response:reply');const m=f.engine.draft({...work,id:'response',subject:'A Proposed Customer Update Review',bookingRequested:true,sections:[{type:'possibility',text:'We could review an example.'},{type:'fact',claimId:'schedule',text:f.s.prospect.claims[0].text},{type:'question',text:`Would ${f.config.integrations.bookingUrl} be useful?`}]});f.approve(m.id);assert.throws(()=>f.release(m.id),/Booking/);
  }f.store.close();
});
test('clicking a booking link never creates a booking',async()=>{const f=fixture();f.ready();await f.simulate();assert.throws(()=>f.engine.verifyBooking(f.s.draft.id,{id:'clicked',status:'confirmed'},f.keys.inbound),/event required/);f.store.close();});
for(const time of ['2026-10-12T13:59:00Z','2026-10-12T20:00:00Z','2026-10-17T15:00:00Z'])test(`outside timezone weekday window ${time}`,async()=>{
  const f=fixture();f.setTime(time);f.refresh();f.ready();await assert.rejects(f.simulate(),/Outside sending window/);f.store.close();
});
test('local-day caps and DST-aware cadence',()=>{
  const f=fixture();assert.equal(inWindow(new Date('2026-10-12T14:00:00Z'),f.config.policy),true);assert.equal(inWindow(new Date('2026-11-02T15:00:00Z'),f.config.policy),true);
  const due=followupDue('2026-10-30T15:00:00Z',4,f.config.policy);assert.equal(due.toISOString(),'2026-11-03T15:00:00.000Z');
  assert.equal(localParts(new Date('2026-10-13T02:00:00Z'),f.config.policy).day,'2026-10-12');
  assert.equal(nextWindow(new Date('2026-10-17T15:00:00Z'),f.config.policy).toISOString(),'2026-10-19T14:00:00.000Z');f.store.close();
});
test('prior thread and duplicate recipient prevention',async()=>{
  const f=fixture();f.ready();f.mail.priorThreads=['old-thread'];await assert.rejects(f.simulate(),/Prior thread/);f.mail.priorThreads=[];await f.simulate();
  await assert.rejects(f.simulate(),/Duplicate|already contacted/);assert.throws(()=>f.engine.draft(f.s.draft),/immutable/);f.store.close();
});
for(const kind of ['initial-cap','mailbox-cap','spacing'])test(`atomic reservation enforces ${kind}`,async()=>{
  const f=fixture({configEdit:c=>{c.policy.dailyInitialCap=1;c.policy.dailyMailboxCap=1;}});f.ready();
  f.store.db.prepare('INSERT INTO attempts(message_id,recipient,kind,local_day,at,status) VALUES(?,?,?,?,?,?)').run('prior','other@example.com',kind==='mailbox-cap'?'response':'initial','2026-10-12',kind==='spacing'?'2026-10-12T14:59:00Z':'2026-10-12T14:00:00Z','uncertain');
  await assert.rejects(f.simulate(),new RegExp(kind==='spacing'?'spacing':kind==='mailbox-cap'?'mailbox cap':'initial cap'));assert.equal(f.mail.sent.length,0);f.store.close();
});
test('uncertain transport never automatically retries',async()=>{const f=fixture();f.ready();f.mail.fail=true;await assert.rejects(f.simulate(),/Uncertain/);f.mail.fail=false;await assert.rejects(f.simulate(),/uncertain|already contacted/);assert.equal(f.mail.sent.length,0);f.store.close();});
test('two concurrent workers can dispatch one message only',async()=>{const f=fixture();f.ready();const results=await Promise.allSettled([f.simulate(),f.simulate()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.mail.sent.length,1);f.store.close();});
