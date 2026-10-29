import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { verifyBookingSchedule,bookingScheduleGaps } from '../src/booking.mjs';
import { bodyFor,writingGaps } from '../src/writing.mjs';
import { validateConfig } from '../src/config.mjs';
import { seal,unseal } from '../src/security.mjs';

const canonical='https://calendar.google.com/calendar/u/0/appointments/schedules/fictional-schedule';
const short='https://calendar.app.google/fictional';
function configured(){return fixture({configEdit:c=>{c.integrations.bookingUrl=short;c.policy.booking={strategy:'initial-and-final',canonicalScheduleUrl:canonical,scheduleTitle:'Example Meeting',durationMinutes:30};}});}
function transport({target=canonical,title='Example Meeting'}={}){
  return async url=>url===short?{status:302,headers:{get:name=>name==='location'?target:null}}:{status:200,ok:true,headers:{get:()=>null},text:async()=>`<title>${title}</title>`};
}
async function verify(f,extra={}){return verifyBookingSchedule(f.engine,{token:f.keys.admin,reviewer:'Fictional Reviewer',confirmation:'I verified the displayed appointment duration',fetcher:transport(),simulation:true,...extra});}
function initialWithLink(f){const sections=structuredClone(f.s.draft.sections);sections.at(-1).text='Would a 30-minute call be useful?';return f.engine.draft({...f.s.draft,sections,bookingRequested:true});}

test('opt-in initial needs a signed current schedule proof and an exact human approval',async()=>{
  const f=configured(),m=initialWithLink(f);assert.match(m.body,/30-minute call[\s\S]*https:\/\/calendar\.app\.google\/fictional/);
  f.approve();assert.throws(()=>f.release(),/verified booking schedule/i);await verify(f);f.release();assert.equal((await f.simulate()).status,'simulated');
  assert.deepEqual(bookingScheduleGaps(f.engine,f.now(),true),['Current verified booking schedule and duration review required']);
  f.setTime('2026-10-12T16:00:00Z');assert.match(bookingScheduleGaps(f.engine,f.now(),false).join(' '),/verified/);f.store.close();
});

test('middle follow-ups reject a cold booking link; only the third may contain it',()=>{
  const f=configured();for(const ordinal of [1,2,3]){
    const m={...f.s.draft,kind:'followup',ordinal,bookingRequested:true,sections:[{type:'possibility',text:'A review could clarify the request.'},{type:'fact',claimId:'schedule',text:f.s.prospect.claims[0].text},{type:'question',text:'Would a 30-minute call be useful?'}]};m.body=bodyFor(m,f.s.prospect,f.config);
    const gaps=writingGaps(m,f.s.prospect,f.config,[]);assert.equal(gaps.some(x=>/Booking is interest-gated/.test(x)),ordinal!==3);
  }f.store.close();
});

test('cold booking verification requires exact Google schedule, title and human duration review',async()=>{
  for(const extra of [{confirmation:'yes'},{reviewer:''},{fetcher:transport({target:'https://example.com/not-calendar'})},{fetcher:transport({target:canonical+'-changed'})},{fetcher:transport({title:'Wrong title'})}]){
    const f=configured();await assert.rejects(verify(f,extra));assert.equal(f.store.get('installation','bookingSchedule'),null);f.store.close();
  }
});

test('injected test transports cannot create production schedule proof',async()=>{
  const f=configured();await assert.rejects(verify(f,{simulation:false}),/test transport/);assert.equal(f.store.get('installation','bookingSchedule'),null);f.store.close();
});

test('release is bounded by, and bound to, the verified schedule proof',async()=>{
  const f=configured();initialWithLink(f);await verify(f);
  const proof=unseal(f.store.get('installation','bookingSchedule'),f.keys.preflight);proof.expiresAt='2026-10-12T15:10:00Z';
  f.store.put('installation','bookingSchedule',seal(proof,f.keys.preflight));f.approve();f.release();
  const release=unseal(f.store.get('release',f.s.draft.id).envelope,f.keys.release);assert.equal(Date.parse(release.expiresAt),Date.parse(proof.expiresAt));
  proof.sourceHash='1'.repeat(64);f.store.put('installation','bookingSchedule',seal(proof,f.keys.preflight));
  assert.ok(f.engine.deliveryGaps(f.s.draft.id,f.now()).includes('Booking schedule proof changed'));f.store.close();
});

test('new-initial booking requirement preserves older no-link drafts',()=>{
  const f=configured();f.config.policy.booking.requireInitialLinkSince='2026-10-10T00:00:00Z';
  const newer={...f.s.draft,createdAt:'2026-10-12T15:00:00Z'};newer.body=bodyFor(newer,f.s.prospect,f.config);
  assert.ok(writingGaps(newer,f.s.prospect,f.config).includes('New initial needs the configured booking link'));
  newer.createdAt='2026-10-09T15:00:00Z';assert.ok(!writingGaps(newer,f.s.prospect,f.config).includes('New initial needs the configured booking link'));f.store.close();
});

test('non-Google or incomplete booking configuration fails closed',()=>{
  const f=configured();for(const edit of [c=>c.integrations.bookingUrl='http://calendar.app.google/fictional',c=>c.policy.booking.canonicalScheduleUrl='https://example.com/other',c=>c.policy.booking.durationMinutes=0,c=>c.policy.booking.scheduleTitle='']){
    const c=structuredClone(f.config);edit(c);assert.throws(()=>validateConfig(c));
  }f.store.close();
});

test('a real-style accepted calendar event can be associated with a sent cold booking link, but a click cannot',async()=>{
  const f=configured();initialWithLink(f);await verify(f);f.ready();await f.simulate();
  assert.throws(()=>f.engine.verifyBooking(f.s.draft.id,{id:'clicked',status:'confirmed'},f.keys.inbound),/event required/);
  const event={id:'fictional-event',provider:'mock-calendar',status:'confirmed',organizer:f.config.business.sender,start:'2026-10-15T15:00:00Z',end:'2026-10-15T15:30:00Z',attendees:[{email:f.s.prospect.contact.email,accepted:true}]};
  assert.equal(f.engine.verifyBooking(f.s.draft.id,event,f.keys.inbound).status,'confirmed');f.store.close();
});
