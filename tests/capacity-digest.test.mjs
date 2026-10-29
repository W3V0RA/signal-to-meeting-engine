import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { approvalDigest,deliverOwnerNotification } from '../src/notifications.mjs';
import { validateConfig } from '../src/config.mjs';
import { Notion } from '../src/providers/notion.mjs';
import { Worker } from '../src/worker.mjs';
import { bodyFor } from '../src/writing.mjs';

function attempt(f,id,kind,at,status='sent') {
  f.store.db.prepare('INSERT INTO attempts(message_id,recipient,kind,local_day,at,status) VALUES(?,?,?,?,?,?)')
    .run(id,`${id}@example.com`,kind,'2026-10-12',at,status);
}

test('first-touch spacing is independent of the shared prospect spacing',()=>{
  const f=fixture({configEdit:c=>{c.policy.minimumSpacingMinutes=15;c.policy.minimumFirstTouchSpacingMinutes=30;}});
  attempt(f,'previous','initial','2026-10-12T15:00:00.000Z','uncertain');
  f.setTime('2026-10-12T15:29:59Z');assert.ok(f.engine.deliveryGaps(f.s.draft.id,f.now()).includes('Minimum first-touch spacing'));
  f.setTime('2026-10-12T15:30:00Z');assert.ok(!f.engine.deliveryGaps(f.s.draft.id,f.now()).includes('Minimum first-touch spacing'));
  f.store.close();
});

test('shared prospect cap conservatively counts mixed uncertain attempts',()=>{
  const f=fixture({configEdit:c=>{c.policy.dailyMailboxCap=3;c.policy.includeOwnerNotificationsInMailboxCap=false;}});
  for(const [i,kind] of ['initial','followup','response'].entries())attempt(f,`mixed${i}`,kind,`2026-10-12T14:0${i}:00.000Z`,i===1?'uncertain':'sent');
  assert.ok(f.engine.deliveryGaps(f.s.draft.id,f.now()).includes('Daily mailbox cap'));f.store.close();
});

test('shared prospect pacing applies across message purposes at the boundary',()=>{
  const f=fixture({configEdit:c=>{c.policy.minimumSpacingMinutes=15;c.policy.minimumFirstTouchSpacingMinutes=30;}});
  attempt(f,'previous','response','2026-10-12T15:00:00.000Z','reserved');
  f.setTime('2026-10-12T15:14:59Z');assert.ok(f.engine.deliveryGaps(f.s.draft.id,f.now()).includes('Minimum spacing'));
  f.setTime('2026-10-12T15:15:00Z');assert.ok(!f.engine.deliveryGaps(f.s.draft.id,f.now()).includes('Minimum spacing'));f.store.close();
});

test('owner digest does not consume prospect budget when explicitly configured',async()=>{
  const f=fixture({configEdit:c=>{c.policy.dailyMailboxCap=1;c.policy.includeOwnerNotificationsInMailboxCap=false;}});
  await deliverOwnerNotification(f.engine,approvalDigest(f.engine,'2026-10-12').id,{simulate:true});
  f.setTime('2026-10-12T16:00:00Z');f.ready();assert.equal((await f.simulate()).status,'simulated');f.store.close();
});

test('digest distinguishes individual approvals and inherited follow-ups',()=>{
  const f=fixture();f.engine.draft({...f.s.draft,id:'followup-preview',kind:'followup',parentId:'parent',ordinal:1});
  const n=approvalDigest(f.engine,'2026-10-12');assert.match(n.body,/1 exact message.*individual review/i);
  assert.match(n.body,/1 follow-up.*separate/i);assert.doesNotMatch(n.body,/2 exact messages await individual review/i);
  assert.match(n.body,/review status does not establish send eligibility/i);f.store.close();
});

test('digest counts an approval that no longer matches the current copy as needing review',()=>{
  const f=fixture();f.approve();f.engine.config.business.displayName='Changed Reviewer';
  const n=approvalDigest(f.engine,'2026-10-12');assert.match(n.body,/1 exact message.*individual review/i);f.store.close();
});

test('new pacing policy rejects malformed optional values',()=>{
  const f=fixture();for(const bad of [0,-1,1.5,'30']){const c=structuredClone(f.config);c.policy.minimumFirstTouchSpacingMinutes=bad;assert.throws(()=>validateConfig(c),/first.touch/i);}
  const c=structuredClone(f.config);c.policy.includeOwnerNotificationsInMailboxCap='false';assert.throws(()=>validateConfig(c),/owner/i);f.store.close();
});

test('neutral shared inbox greeting is optional and never changes direct routes',()=>{
  const f=fixture(),m=f.s.draft,p=f.s.prospect;
  assert.match(bodyFor(m,p,f.config),/^Hi Morgan,/);
  f.config.policy.sharedInboxGreeting='neutral';assert.match(bodyFor(m,p,f.config),/^Hi there,/);
  p.contact.routeType='personal';assert.match(bodyFor(m,p,f.config),/^Hi Morgan,/);f.store.close();
});

test('Notion saved-view query follows pages and uses the saved view API',async()=>{
  const calls=[],now=new Date('2026-10-12T15:00:00Z');
  const p=new Notion({token:'mock',dataSourceId:'mock',fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>calls.length===1?{id:'query',view_id:'view',total_count:2,expires_at:'2026-10-12T15:10:00Z',results:[{id:'first'}],has_more:true,next_cursor:'next'}:{results:[{id:'second'}],has_more:false}};}});
  const v=await p.savedView('view',now);assert.deepEqual(v.ids,['first','second']);assert.equal(v.total,2);
  assert.match(calls[0].url,/views\/view\/queries$/);assert.match(calls[1].url,/queries\/query\?/);assert.equal(calls[0].options.headers['Notion-Version'],'2026-03-11');
});

for(const result of [
  {id:'query',view_id:'view',total_count:2,expires_at:'2026-10-12T15:10:00Z',results:[{id:'first'}],has_more:false},
  {id:'query',view_id:'view',total_count:1,expires_at:'2026-10-12T14:59:00Z',results:[{id:'first'}],has_more:false},
  {id:'query',view_id:'view',total_count:1,expires_at:'2026-10-12T15:10:00Z',results:[{id:'first'}],has_more:true},
  {id:'query',view_id:'view',total_count:1,expires_at:'2026-10-12T15:10:00Z',results:[{id:'first'}],has_more:false,request_status:{type:'incomplete'}}
])test('incomplete or expired Notion view results fail closed',async()=>{
  const p=new Notion({token:'mock',dataSourceId:'mock',fetcher:async()=>({ok:true,json:async()=>result})});await assert.rejects(p.savedView('view',new Date('2026-10-12T15:00:00Z')));
});

test('configured saved view never falls back to a guessed digest count',async()=>{
  const f=fixture({configEdit:c=>{c.operations.notionApprovalViewId='view';}}),worker=new Worker(f.engine,{readsEnabled:false});
  await assert.rejects(worker.runJob({kind:'digest',payload:{day:'2026-10-12'}}),/saved view/i);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM notifications').get().n,0);f.store.close();
});

test('digest reports the saved-view count separately from local review',async()=>{
  const f=fixture({configEdit:c=>{c.operations.notionApprovalViewId='view';}}),notion={savedView:async()=>({ids:['page-1','page-2'],total:2})};
  const worker=new Worker(f.engine,{readsEnabled:true,notion});await worker.runJob({kind:'digest',payload:{day:'2026-10-12'}});
  const n=f.store.db.prepare('SELECT * FROM notifications WHERE id=?').get('digest:2026-10-12');
  assert.match(n.body,/Saved Notion view: 2 rows/);assert.match(n.body,/1 exact message.*individual review/i);assert.match(n.body,/separate view count/i);f.store.close();
});
