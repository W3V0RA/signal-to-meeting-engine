import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { REVIEW_CHECKS } from '../src/engine.mjs';

const enabled=()=>fixture({configEdit:c=>{c.policy.requirePreApprovalRelease=true;}});
const baseline=f=>f.engine.release(f.s.draft.id,{token:f.keys.admin,preflight:f.preflight(),preApproval:true});

test('pre-approval release does not approve, queue or send; exact human approval remains required',async()=>{
  const f=enabled();assert.throws(()=>f.approve(),/pre-approval/i);
  const proof=baseline(f);assert.ok(proof.signature);assert.equal(f.store.get('approval',f.s.draft.id),null);assert.equal(f.store.get('release',f.s.draft.id),null);assert.equal(f.mail.sent.length,0);
  assert.equal(f.store.list('sourceReviewHistory').length,1);assert.equal(f.store.list('sourceReviewHistory')[0].message.body,f.store.get('message',f.s.draft.id).body);
  assert.throws(()=>f.release(),/approval/i);f.approve();f.release();assert.equal((await f.simulate()).status,'simulated');f.store.close();
});

test('changed copy invalidates the active pre-approval baseline and preserves history',()=>{
  const f=enabled();baseline(f);f.approve();const history=f.store.list('approvalBaselineHistory').length,old=f.store.get('message',f.s.draft.id).body;
  f.engine.draft({...f.s.draft,subject:'A Changed Customer Update Review'});
  assert.equal(f.store.get('approvalBaseline',f.s.draft.id),null);assert.equal(f.store.list('approvalBaselineHistory').length,history);
  assert.equal(f.store.list('messageRevision')[0].message.body,old);assert.equal(f.store.list('approvalHistory').length,1);
  assert.throws(()=>f.approve(),/pre-approval/i);f.store.close();
});

test('expired or tampered baselines cannot grant a new human approval',()=>{
  const f=enabled();baseline(f);f.setTime('2026-10-12T16:00:00Z');assert.throws(()=>f.approve(),/pre-approval/i);
  f.setTime('2026-10-12T15:00:00Z');const value=f.store.get('approvalBaseline',f.s.draft.id);value.signature='0'.repeat(64);f.store.put('approvalBaseline',f.s.draft.id,value);assert.throws(()=>f.approve(),/pre-approval/i);f.store.close();
});

test('a previously approved initial cannot obtain a new pre-approval baseline',()=>{
  const f=enabled();baseline(f);f.approve();assert.throws(()=>baseline(f),/unapproved/i);f.store.close();
});

test('cancelled or sent work cannot receive an unapproved baseline',()=>{
  for(const state of ['cancelled','sent']){const f=enabled();const m=f.store.get('message',f.s.draft.id);f.store.put('message',m.id,{...m,state});assert.throws(()=>baseline(f),/not in review/i);f.store.close();}
});

test('a real-context response needs its own unapproved release and new human approval',async()=>{
  const f=enabled();baseline(f);f.approve();f.release();const sent=await f.simulate();
  f.engine.ingest({id:'inbound-one',threadId:sent.threadId,recipient:f.s.prospect.contact.email,classification:'reply',at:f.now().toISOString()},f.keys.inbound);
  const work=f.store.get('work','response:inbound-one');const m=f.engine.draft({...work,id:'response-one',subject:'A Proposed Customer Update Review',sections:[{type:'possibility',text:'We could review one example.'},{type:'question',text:'Would that be useful?'}]});
  assert.throws(()=>f.approve(m.id),/pre-approval/i);
  f.engine.release(m.id,{token:f.keys.admin,preflight:f.preflight(),preApproval:true});assert.equal(f.store.get('approval',m.id),null);
  f.approve(m.id);f.release(m.id);f.setTime('2026-10-12T15:01:00Z');
  f.engine.ingest({id:'inbound-two',threadId:sent.threadId,recipient:f.s.prospect.contact.email,classification:'reply',at:f.now().toISOString()},f.keys.inbound);
  assert.equal(f.store.get('approval',m.id),null);assert.equal(f.store.get('approvalBaseline',m.id),null);assert.equal(f.store.get('release',m.id),null);f.store.close();
});

test('an invented response event cannot obtain a pre-approval release',async()=>{
  const f=enabled();baseline(f);f.approve();f.release();const sent=await f.simulate();
  const m=f.engine.draft({id:'invented',kind:'response',prospectId:f.s.prospect.id,parentId:f.s.draft.id,inboundId:'missing',threadId:sent.threadId,rfcParentId:sent.rfcId,subject:'A Proposed Customer Update Review',sections:[{type:'possibility',text:'We could review one example.'},{type:'question',text:'Would that be useful?'}]});
  assert.throws(()=>f.engine.release(m.id,{token:f.keys.admin,preflight:f.preflight(),preApproval:true}),/verified inbound context/i);f.store.close();
});

test('optional authoring policy requires a three-part brief and a human comparison',()=>{
  const f=fixture({configEdit:c=>{c.policy.requireAuthoringBrief=true;c.policy.requirePreApprovalRelease=true;}});
  assert.throws(()=>f.engine.release(f.s.draft.id,{token:f.keys.admin,preflight:f.preflight(),preApproval:true}),/brief and framework/i);
  f.engine.draft({...f.s.draft,brief:['A published service.','A possible workflow.','One small next step.'],framework:'Context and question'});
  baseline(f);assert.throws(()=>f.approve(),/portfolio comparison/i);
  const checks=Object.fromEntries(REVIEW_CHECKS.map(k=>[k,true]));checks.portfolioReviewed=true;
  const approved=f.engine.approve(f.s.draft.id,{token:f.keys.admin,reviewer:'Fictional Reviewer',checks});assert.deepEqual(approved.portfolioReviewed,[]);
  assert.equal(f.store.list('approvalHistory').length,1);f.store.close();
});

test('configured comparison minimum is enforced rather than manufacturing ten drafts',()=>{
  const f=fixture({configEdit:c=>{c.policy.minimumPortfolioComparisons=10;}});
  f.approve();assert.throws(()=>f.release(),/Insufficient current drafts/);f.store.close();
});
