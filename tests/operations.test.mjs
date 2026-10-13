import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fixture } from './helpers.mjs';
import { Store } from '../src/store.mjs';
import { Worker } from '../src/worker.mjs';
import { readiness,activationGaps,authorizeActivation } from '../src/readiness.mjs';
import { approvalDigest,ownerAlerts,deliverOwnerNotification } from '../src/notifications.mjs';
import { watchSources,sourceCandidates } from '../src/discovery.mjs';
import { snapshot } from '../src/evidence.mjs';
import { hash } from '../src/config.mjs';

test('checksummed migrations apply once and preserve existing business state',()=>{
  const directory=mkdtempSync(join(tmpdir(),'engine-migrations-')),path=join(directory,'engine.sqlite');
  try {const legacy=new DatabaseSync(path);legacy.exec(readFileSync('schema/001_initial.sql','utf8'));legacy.prepare('INSERT INTO records VALUES(?,?,?)').run('legacy','record',JSON.stringify({preserved:true}));legacy.close();
    let store=new Store(path,'demo');assert.equal(store.get('legacy','record').preserved,true);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n,2);store.close();
    store=new Store(path,'demo');assert.equal(store.db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n,2);store.close();
    const altered=new DatabaseSync(path);altered.prepare('UPDATE schema_migrations SET checksum=? WHERE name=?').run('altered','002_operations.sql');altered.close();assert.throws(()=>new Store(path,'demo'),/migration changed/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('newer database schema refuses a silent downgrade',()=>{const directory=mkdtempSync(join(tmpdir(),'engine-future-')),path=join(directory,'engine.sqlite');try{const store=new Store(path,'demo');store.db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run('999_future.sql','future',new Date().toISOString());store.close();assert.throws(()=>new Store(path,'demo'),/downgrade/);}finally{rmSync(directory,{recursive:true,force:true});}});
test('missing installation hold and simulation proofs block live activation',()=>{
  const f=fixture();assert.match(activationGaps(f.engine).join(' '),/send hold/);assert.equal(readiness(f.engine).verificationComplete,false);
  assert.throws(()=>authorizeActivation(f.engine,{token:f.keys.admin,reviewer:'Reviewer',confirmation:'Authorize verified business sending'}),/complete real verification/);assert.equal(f.mail.sent.length,0);f.store.close();
});
test('changing environment flags cannot bypass installation hold or trigger provider reads',async()=>{
  const f=fixture();f.ready();f.engine.flags={dryRun:false,liveSend:true,autonomy:true};f.mail.mode='gmail';f.mail.identity=()=>{throw Error('Unexpected provider read');};
  await assert.rejects(f.engine.deliver(f.s.draft.id),/send hold/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM attempts').get().n,0);f.store.close();
});
test('operator hold is durable and immediately revokes activation',()=>{const f=fixture();f.store.put('installation','sendHold',{held:false});f.store.holdSending('Operator stop',f.now());assert.equal(f.store.get('installation','sendHold').held,true);assert.match(activationGaps(f.engine).join(' '),/hold/);f.store.close();});
test('worker default cycle performs local work without any provider calls',async()=>{
  const f=fixture();const forbidden=()=>{throw Error('Unexpected network call');};const worker=new Worker(f.engine,{mail:{scan:forbidden},research:{fetch:forbidden},notion:{mode:'notion',upsert:forbidden},calendar:{event:forbidden}});
  const result=await worker.tick();assert.equal(result.failed,0);assert.ok(result.completed>=8);assert.equal(f.mail.sent.length,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM notifications').get().n,1);f.store.close();
});
test('scheduler and owner digest are idempotent across repeated cycles',async()=>{
  const f=fixture(),worker=new Worker(f.engine);await worker.tick();const count=f.store.jobs().length;await worker.tick();assert.equal(f.store.jobs().length,count);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM notifications WHERE kind='digest'").get().n,1);f.store.close();
});
test('two workers cannot claim the same durable job',()=>{
  const f=fixture(),a=new Worker(f.engine),b=new Worker(f.engine);f.store.enqueue('one','lifecycle',{},f.now());assert.equal(a.claim().id,'one');assert.equal(b.claim(),null);f.store.close();
});
test('crashed worker lease is reclaimed after expiry without duplicating the job',()=>{
  const f=fixture(),a=new Worker(f.engine),b=new Worker(f.engine);f.store.enqueue('one','lifecycle',{},f.now());a.claim();f.setTime('2026-10-12T15:06:00Z');const job=b.claim();assert.equal(job.id,'one');assert.equal(f.store.db.prepare('SELECT attempts FROM jobs WHERE id=?').get('one').attempts,2);f.store.close();
});
test('inbound worker ingests genuine-context events and advances cursor only on success',async()=>{
  const f=fixture();f.ready();const sent=await f.simulate();f.engine.planFollowups(f.s.draft.id);f.setTime('2026-10-12T16:00:00Z');
  const worker=new Worker(f.engine,{readsEnabled:true,mail:{mode:'mock',scan:async()=>({warnings:[],events:[{id:'observed',threadId:sent.threadId,recipient:f.s.prospect.contact.email,classification:'interest',at:f.now().toISOString(),text:'Yes please send the booking link',from:f.s.prospect.contact.email}]})}});
  await worker.mailboxSync();assert.equal(f.store.get('sequence',f.s.draft.id).stopped,true);assert.ok(f.store.get('installation','inboundCursor'));assert.equal(f.store.get('installation','workerHealth').mode,'simulation');
  assert.equal(ownerAlerts(f.engine),1);assert.equal(ownerAlerts(f.engine),0);assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM notifications WHERE kind='alert'").get().n,1);f.store.close();
});
test('failed inbound scan does not advance cursor and holds installation sending',async()=>{
  const f=fixture(),worker=new Worker(f.engine,{readsEnabled:true,mail:{scan:async()=>{throw Error('Read failure');}}});worker.schedule=()=>{};f.store.enqueue('scan','mailbox_sync',{},f.now());
  await worker.tick({maxJobs:1});assert.equal(f.store.get('installation','inboundCursor'),null);assert.equal(f.store.get('installation','sendHold').held,true);assert.ok(f.store.jobs().some(j=>j.state==='retry'));f.store.close();
});
test('unmatched mailbox-wide bounce holds sending instead of discarding it',async()=>{
  const f=fixture(),worker=new Worker(f.engine,{readsEnabled:true,mail:{scan:async()=>({events:[],warnings:['Unmatched DSN']})}});await assert.rejects(worker.mailboxSync(),/operator review/);assert.equal(f.store.get('installation','inboundCursor'),null);f.store.close();
});
test('read jobs back off and hold after bounded failed attempts',async()=>{
  const f=fixture(),worker=new Worker(f.engine);worker.runJob=async()=>{throw Error('Fail');};worker.schedule=()=>{};f.store.enqueue('fail','source_watch',{},f.now());
  for(let n=0;n<5;n++){await worker.tick({maxJobs:1});f.setTime(new Date(f.now().getTime()+70*60000));}
  assert.equal(f.store.jobs()[0].state,'held');assert.equal(f.store.jobs()[0].attempts,5);f.store.close();
});
test('digest contains individual review links and cannot approve any copy',()=>{
  const f=fixture(),n=approvalDigest(f.engine,'2026-10-12');assert.match(n.body,/#message=/);assert.match(n.body,/does not approve or send/);assert.equal(f.store.get('approval',f.s.draft.id),null);assert.equal(n.recipient,f.config.integrations.ownerEmail);f.store.close();
});
test('owner notification defaults exit before transport or reservation',async()=>{
  const f=fixture(),n=approvalDigest(f.engine,'2026-10-12');f.mail.identity=()=>{throw Error('Unexpected read');};assert.equal((await deliverOwnerNotification(f.engine,n.id,{enabled:true})).status,'dry_run');assert.equal(f.store.db.prepare('SELECT attempted_at FROM notifications WHERE id=?').get(n.id).attempted_at,null);f.store.close();
});
test('owner-only mock transport delivers one digest and refuses duplicate retries',async()=>{
  const f=fixture(),n=approvalDigest(f.engine,'2026-10-12');assert.equal((await deliverOwnerNotification(f.engine,n.id,{simulate:true})).status,'simulated');assert.equal(f.mail.sent[0].recipient,f.config.integrations.ownerEmail);await assert.rejects(deliverOwnerNotification(f.engine,n.id,{simulate:true}),/cannot retry/);f.store.close();
});
test('uncertain owner transport never retries automatically',async()=>{
  const f=fixture(),n=approvalDigest(f.engine,'2026-10-12');f.mail.fail=true;await assert.rejects(deliverOwnerNotification(f.engine,n.id,{simulate:true}),/Uncertain/);f.mail.fail=false;await assert.rejects(deliverOwnerNotification(f.engine,n.id,{simulate:true}),/cannot retry/);f.store.close();
});
test('combined mailbox cap includes owner notifications for prospect admission',async()=>{
  const f=fixture({configEdit:c=>{c.policy.dailyMailboxCap=1;}}),n=approvalDigest(f.engine,'2026-10-12');await deliverOwnerNotification(f.engine,n.id,{simulate:true});f.setTime('2026-10-12T16:00:00Z');f.ready();await assert.rejects(f.simulate(),/mailbox cap/);f.store.close();
});
test('owner notification recipient changes cannot redirect prepared alerts',async()=>{
  const f=fixture(),n=approvalDigest(f.engine,'2026-10-12');f.engine.config.integrations.ownerEmail='other@example.org';await assert.rejects(deliverOwnerNotification(f.engine,n.id,{simulate:true}),/recipient mismatch/);assert.equal(f.mail.sent.length,0);f.store.close();
});
test('source monitor creates review work on changed evidence without rewriting approved copy',async()=>{
  const f=fixture();f.ready();const original=f.store.get('message',f.s.draft.id),approval=f.store.get('approval',f.s.draft.id);let text='Example source first version';const provider={fetch:async url=>snapshot(url,text,f.now(),'mock')};
  assert.equal((await watchSources(f.engine,provider)).changed,1);assert.equal((await watchSources(f.engine,provider)).changed,0);text='Example source second version';assert.equal((await watchSources(f.engine,provider)).changed,1);
  assert.equal(f.store.list('researchWork').length,2);assert.deepEqual(f.store.get('message',f.s.draft.id),original);assert.deepEqual(f.store.get('approval',f.s.draft.id),approval);f.store.close();
});
test('malformed source capture fails closed',async()=>{const f=fixture();await assert.rejects(watchSources(f.engine,{fetch:async url=>({url,text:'altered',digest:hash('other')})}),/mismatch/);f.store.close();});
test('configured directory discovery yields deduplicated unverified domains without guessing contacts',()=>{
  const page={url:'https://example.com/directory',digest:hash('directory'),links:['https://example.org/company','https://example.org/about','https://example.com/internal']},candidates=sourceCandidates(page);
  assert.equal(candidates.length,1);assert.equal(candidates[0].domain,'example.org');assert.equal(candidates[0].verified,false);assert.equal(candidates[0].email,undefined);
});
test('directory hints cannot cause an unapproved domain fetch or qualification',async()=>{
  const f=fixture();let fetched=0;await watchSources(f.engine,{fetch:async url=>{fetched++;return {...snapshot(url,'Directory link',f.now()),links:['https://example.org/business']};}});
  assert.equal(fetched,1);assert.equal(f.store.list('discoveryCandidate').length,1);assert.equal(f.store.list('prospect').length,1);assert.equal(f.mail.sent.length,0);f.store.close();
});
test('credential URLs and unsupported schemes cannot become directory candidates',()=>assert.deepEqual(sourceCandidates({url:'https://example.com/directory',digest:hash('directory'),links:['http://example.org','https://user:password@example.org','https://example.org:444','invalid']}),[]));
