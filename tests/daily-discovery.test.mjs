import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { dailyDiscoveryProgress } from '../src/daily-discovery.mjs';

test('daily progress counts a freshly sourced named initial once, not mock evidence or reruns',()=>{
  const f=fixture({configEdit:c=>{c.policy.dailyDiscoveryTarget=5;}});
  assert.equal(dailyDiscoveryProgress(f.engine).verifiedNewDrafts,0);
  f.engine.research(f.s.prospect,f.s.pages.map(page=>({...page,mode:'public-web'})));
  f.engine.draft(f.s.draft);assert.equal(dailyDiscoveryProgress(f.engine).verifiedNewDrafts,1);
  f.engine.draft(f.s.draft);assert.equal(dailyDiscoveryProgress(f.engine).verifiedNewDrafts,1);
  assert.equal(dailyDiscoveryProgress(f.engine).shortfall,4);assert.equal(dailyDiscoveryProgress(f.engine).automatedDiscovery,false);f.store.close();
});

test('daily progress does not retroactively count an existing contact',()=>{
  const f=fixture();f.engine.config.policy.dailyDiscoveryTarget=5;
  f.engine.research(f.s.prospect,f.s.pages.map(page=>({...page,mode:'public-web'})));f.engine.draft(f.s.draft);
  assert.equal(dailyDiscoveryProgress(f.engine).verifiedNewDrafts,0);f.store.close();
});

test('weekends do not create weekday discovery claims',()=>{
  const f=fixture({configEdit:c=>{c.policy.dailyDiscoveryTarget=5;}});f.setTime('2026-10-17T15:00:00Z');
  f.engine.research(f.s.prospect,f.s.pages.map(page=>({...page,mode:'public-web',checkedAt:f.now().toISOString()})));f.engine.draft(f.s.draft);
  assert.deepEqual({activeDay:dailyDiscoveryProgress(f.engine).activeDay,count:dailyDiscoveryProgress(f.engine).verifiedNewDrafts},{activeDay:false,count:0});f.store.close();
});

test('a discovery target counts sourced drafts independently of send approval',()=>{
  const f=fixture({configEdit:c=>{c.policy.dailyDiscoveryTarget=5;}});
  f.engine.research(f.s.prospect,f.s.pages.map(page=>({...page,mode:'public-web'})));f.engine.draft(f.s.draft);
  assert.equal(f.store.get('approval',f.s.draft.id),null);assert.equal(f.store.get('release',f.s.draft.id),null);assert.equal(f.mail.sent.length,0);f.store.close();
});
