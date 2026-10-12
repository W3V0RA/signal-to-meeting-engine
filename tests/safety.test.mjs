import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { researchGaps,snapshot } from '../src/evidence.mjs';
import { hash,loadConfig } from '../src/config.mjs';
import { seal,unseal } from '../src/security.mjs';
import { REVIEW_CHECKS } from '../src/engine.mjs';

test('default delivery returns before any provider reads, reservation or write',async()=>{
  const f=fixture();f.mail.identity=()=>{throw Error('Forbidden provider read');};
  const before=f.store.db.prepare('SELECT COUNT(*) n FROM audit').get().n;
  assert.equal((await f.engine.deliver(f.s.draft.id)).status,'dry_run');
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM attempts').get().n,0);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM audit').get().n,before);f.store.close();
});
for(const value of [undefined,null,0,2,19,201,100000])test(`headcount ${value} and low scores never veto`,()=>{
  const f=fixture();f.s.prospect.headcount=value;f.s.prospect.score=-999;
  assert.deepEqual(f.engine.research(f.s.prospect,f.s.pages).gaps,[]);f.ready();f.store.close();
});
for(const type of ['shared','official-business','personal'])test(`separately published ${type} business route keeps named greeting`,()=>{
  const f=fixture();f.s.prospect.contact.routeType=type;
  if(type==='official-business') {
    f.s.prospect.contact.email='official@example.org';
    f.s.pages[1]=snapshot('https://example.com/contact','Official business inquiries: official@example.org',f.now());
  }
  assert.deepEqual(researchGaps(f.s.prospect,f.s.pages,f.config,f.now()),[]);
  const m=f.engine.draft({...f.s.draft,id:`${type}-initial`});assert.ok(m.body.startsWith('Hi Morgan,'));f.store.close();
});
for(const mutate of [
  s=>s.pages[0].text='Unsupported facts',s=>s.pages[0].digest='0'.repeat(64),s=>s.pages[0].checkedAt='invalid',
  s=>s.pages[0].checkedAt='2026-10-01T00:00:00Z',s=>s.pages[0].checkedAt='2027-01-01T00:00:00Z',
  s=>s.prospect.claims[0].type='hypothesis',s=>s.prospect.claims[0].sourceUrl='https://example.org/news',
  s=>s.prospect.contact.email='guessed@example.com',s=>s.prospect.contact.personQuote='Invented Owner',
  s=>s.prospect.contact.routeSource='https://example.org/contact',s=>s.prospect.businessVerified=false,
  s=>s.pages[1]=snapshot('https://example.com/contact','not-office@example.com',new Date('2026-10-12T15:00:00Z'))
])test(`invalid evidence fixture ${String(mutate)}`,()=>{
  const f=fixture();mutate(f.s);assert.ok(f.engine.research(f.s.prospect,f.s.pages).gaps.length);f.approve();assert.throws(()=>f.release(),/Release refused/);f.store.close();
});
for(const field of ['subject','body','recipient','sections'])test(`changed ${field} invalidates exact-copy approval and release`,async()=>{
  const f=fixture();f.ready();const m=f.store.get('message',f.s.draft.id);
  if(field==='sections')m.sections[0].text+=' New';else m[field]+=' altered';f.store.put('message',m.id,m);
  await assert.rejects(f.simulate(),/changed|differs|format|mismatch/);assert.equal(f.mail.sent.length,0);f.store.close();
});
test('draft revision actively clears prior approval and release',()=>{
  const f=fixture();f.ready();f.engine.draft({...f.s.draft,subject:'Preparing Job Status For Customer Updates'});
  assert.equal(f.store.get('approval',f.s.draft.id),null);assert.equal(f.store.get('release',f.s.draft.id),null);f.store.close();
});
for(const field of ['sender','replyTo','displayName'])test(`changed ${field} cannot inherit approval`,()=>{
  const f=fixture();f.ready();f.engine.config.business[field]=field==='displayName'?'Different Reviewer':'different@example.org';
  assert.ok(f.engine.baseGaps(f.s.draft.id,f.now()).some(g=>g.includes('changed')));f.store.close();
});
test('failed admin authentication and incomplete checklist cannot approve',()=>{
  const f=fixture();assert.throws(()=>f.approve(undefined,{token:'wrong'}),/Authentication/);
  for(const k of REVIEW_CHECKS)assert.throws(()=>f.approve(undefined,{checks:Object.fromEntries(REVIEW_CHECKS.map(x=>[x,x!==k]))}),/review checks/);f.store.close();
});
for(const change of ['signature','identity','expiry','future','purpose','thread','recipient','tenant','missing'])test(`release rejects ${change}`,async()=>{
  const f=fixture();f.ready();const r=f.store.get('release',f.s.draft.id),p=unseal(r.envelope,f.keys.release);
  if(change==='signature')r.envelope.signature='0'.repeat(64);
  else if(change==='missing')r.envelope=null;
  else {if(change==='identity')p.from='other@example.org';if(change==='expiry')p.expiresAt=f.now().toISOString();if(change==='future')p.issuedAt='2027-01-01T00:00:00Z';if(change==='purpose')p.purpose='response';if(change==='thread')p.threadId='wrong';if(change==='recipient')p.recipient='other@example.com';if(change==='tenant')p.tenant='other';r.envelope=seal(p,f.keys.release);}
  f.store.put('release',f.s.draft.id,r);await assert.rejects(f.simulate(),/Release|release/);assert.equal(f.mail.sent.length,0);f.store.close();
});
test('production release cannot use synthetic sources and sender artifacts',()=>{
  const f=fixture();f.approve();assert.throws(()=>f.release(undefined,{production:true}),/Synthetic|Fictional/);f.store.close();
});
for(const route of ['office@example.com','@example.com'])test(`suppression ${route} blocks all releases`,()=>{
  const f=fixture();f.ready();f.store.suppress(route,'opt-out',f.now());assert.throws(()=>f.release(),/Suppressed/);f.store.close();
});
for(const consent of [null,{allowed:false},{allowed:true,basis:''},{allowed:true,basis:'reviewed',reviewedBy:'Reviewer',expiresAt:'2020-01-01T00:00:00Z'}])test(`missing denied expired consent ${JSON.stringify(consent)}`,()=>{
  const f=fixture();f.store.put('consent',f.s.prospect.contact.email,consent);f.approve();assert.throws(()=>f.release(),/permission/);f.store.close();
});
test('source refresh invalidates unsent approval even when copy is unchanged',()=>{
  const f=fixture();f.ready();f.setTime('2026-10-12T15:01:00Z');f.refresh();assert.ok(f.engine.baseGaps(f.s.draft.id,f.now()).includes('Exact-copy human approval missing or changed'));f.store.close();
});
test('environment defaults fail closed for absent or ambiguous strings',()=>{
  for(const env of [{},{DRY_RUN:'False',LIVE_SEND_ENABLED:'yes'},{DRY_RUN:'0',CONTROLLED_AUTONOMY_ENABLED:'1'}]) {
    const {flags}=loadConfig('config/example.json',env);assert.equal(flags.dryRun,true);assert.equal(flags.liveSend,false);assert.equal(flags.autonomy,false);
  }
});
