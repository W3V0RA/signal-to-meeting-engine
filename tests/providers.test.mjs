import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { Gmail,rawMessage,classify,inboundFromThread } from '../src/providers/gmail.mjs';
import { Notion } from '../src/providers/notion.mjs';
import { GoogleCalendar } from '../src/providers/calendar.mjs';
import { publicIPv4,allowedUrl,PublicWeb } from '../src/providers/public-web.mjs';
import { fixture } from './helpers.mjs';
import { writingGaps } from '../src/writing.mjs';
import { syncNotion } from '../src/reporting.mjs';
import { unseal,seal } from '../src/security.mjs';
import { Engine } from '../src/engine.mjs';

test('persistent state survives restart and refuses a different business',()=>{
  const dir=mkdtempSync(join(tmpdir(),'engine-')),path=join(dir,'engine.sqlite');
  try {let store=new Store(path,'demo');store.put('message','m',{body:'fictional'});store.suppress('office@example.com','unsubscribe',new Date());store.close();
    store=new Store(path,'demo');assert.equal(store.get('message','m').body,'fictional');assert.equal(store.suppressed('office@example.com'),true);store.close();assert.throws(()=>new Store(path,'other'),/tenant mismatch/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('failed reservation rolls back state',()=>{const f=fixture();assert.throws(()=>f.store.transaction(()=>{f.store.put('work','x',{state:'wrong'});throw Error('rollback');}));assert.equal(f.store.get('work','x'),null);f.store.close();});
test('independent database connections preserve single reservation during concurrent dispatch',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'engine-workers-')),path=join(dir,'engine.sqlite');let second;
  const f=fixture({path});
  try {f.ready();second=new Store(path,f.config.tenant);const other=new Engine({config:f.config,flags:f.engine.flags,store:second,mail:f.mail,keys:f.keys,clock:f.now});
    const results=await Promise.allSettled([f.simulate(),other.deliver(f.s.draft.id,{simulate:true})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.mail.sent.length,1);
  }finally{second?.close();f.store.close();rmSync(dir,{recursive:true,force:true});}
});
test('empty name can remain visible as a research draft but cannot release',()=>{
  const f=fixture();f.s.prospect.contact.name='';f.engine.research(f.s.prospect,f.s.pages);const m=f.engine.draft(f.s.draft);assert.ok(m.body.startsWith('Hello,'));f.approve();assert.throws(()=>f.release(),/Named contact/);f.store.close();
});
for(const mode of ['dryRun','liveSend','autonomy'])test(`missing live gate ${mode} returns before provider reads`,async()=>{
  const f=fixture();f.engine.flags={dryRun:false,liveSend:true,autonomy:true};f.engine.flags[mode]=mode==='dryRun';f.mail.identity=()=>{throw Error('Forbidden read');};assert.equal((await f.engine.deliver(f.s.draft.id)).status,'dry_run');f.store.close();
});
test('simulated release and evidence cannot be promoted to real transport',async()=>{
  const f=fixture();f.ready();f.engine.flags={dryRun:false,liveSend:true,autonomy:true};f.mail.mode='gmail';
  await assert.rejects(f.engine.deliver(f.s.draft.id),/Synthetic|Simulation|Fictional|send hold/);assert.equal(f.mail.sent.length,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM attempts').get().n,0);f.store.close();
});
test('MIME preserves exact UTF-8 body and thread headers without extra footer',()=>{
  const f=fixture(),m=f.store.get('message',f.s.draft.id),wire=rawMessage({...m,from:f.config.business.sender,replyTo:f.config.business.replyTo,displayName:f.config.business.displayName,rfcParentId:'<parent@example.org>'});
  const raw=Buffer.from(wire.raw,'base64url').toString('utf8'),[head,body]=raw.split('\r\n\r\n');
  assert.ok(head.includes('In-Reply-To: <parent@example.org>'));assert.equal(Buffer.from(body.replace(/\r\n/g,''),'base64').toString('utf8'),m.body.replace(/\r?\n/g,'\r\n'));f.store.close();
});
for(const field of ['from','replyTo','recipient','subject','displayName','rfcParentId'])test(`MIME rejects ${field} injection`,()=>{
  const f=fixture(),m={...f.store.get('message',f.s.draft.id),from:f.config.business.sender,replyTo:f.config.business.replyTo,displayName:f.config.business.displayName};m[field]='safe\r\nBcc: other@example.org';assert.throws(()=>rawMessage(m),/header|injection/i);f.store.close();
});
test('Gmail adapter uses OAuth, verifies alias identity, reads full threads and sends one exact MIME payload',async()=>{
  const f=fixture(),calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    const data=url.includes('oauth2')?{access_token:'mock-oauth',expires_in:3600}:url.endsWith('profile')?{emailAddress:f.config.business.sender}:url.endsWith('sendAs')?{sendAs:[{sendAsEmail:f.config.business.sender,replyToAddress:f.config.business.replyTo,verificationStatus:'accepted'}]}:url.includes('threads?')?{threads:[]}:url.includes('messages/send')?{id:'mock-message',threadId:'mock-thread'}:{id:'mock-thread',messages:[]};
    return {ok:true,json:async()=>data};
  };
  const gmail=new Gmail({business:f.config.business,credentials:{clientId:'mock',clientSecret:'mock',refreshToken:'mock'},fetcher});
  assert.equal((await gmail.identity()).sender,f.config.business.sender);assert.deepEqual((await gmail.inspect('office@example.com')).priorThreads,[]);
  const sent=await gmail.send({...f.store.get('message',f.s.draft.id),from:f.config.business.sender,replyTo:f.config.business.replyTo,displayName:f.config.business.displayName});assert.equal(sent.id,'mock-message');
  assert.equal(calls.filter(c=>c.url.includes('messages/send')).length,1);assert.ok(JSON.parse(calls.at(-1).options.body).raw);f.store.close();
});
test('Gmail transport failures are not retried',async()=>{
  const f=fixture();let calls=0;
  const gmail=new Gmail({business:f.config.business,credentials:{clientId:'mock',clientSecret:'mock',refreshToken:'mock'},fetcher:async url=>{if(url.includes('oauth2'))return {ok:true,json:async()=>({access_token:'mock',expires_in:3600})};calls++;return {ok:false,status:503};}});
  await assert.rejects(gmail.send({...f.store.get('message',f.s.draft.id),from:f.config.business.sender,replyTo:f.config.business.replyTo,displayName:f.config.business.displayName}),/no automatic send retry/);assert.equal(calls,1);f.store.close();
});
test('negative interest overrides booking keywords and reply parsing ignores sent mail',()=>{
  assert.equal(classify('Not interested; do not send a booking link'),'unsubscribe');assert.equal(classify('Yes please send the booking link'),'interest');assert.equal(classify('Do you provide support?'),'reply');
  const text=Buffer.from('Yes please send the booking link').toString('base64url');
  const thread={id:'thread',messages:[{id:'reply',internalDate:String(Date.parse('2026-10-12T15:00:00Z')),payload:{mimeType:'text/plain',headers:[{name:'From',value:'Morgan <office@example.com>'}],body:{data:text}}},{id:'own',labelIds:['SENT'],payload:{}}]};
  assert.equal(inboundFromThread(thread,'office@example.com','alex@example.org').length,1);
});
test('structured delivery-status bounce is bound to the exact failed recipient',()=>{
  const thread={id:'t',messages:[{id:'bounce',internalDate:'1791817200000',payload:{mimeType:'multipart/report',headers:[{name:'From',value:'mailer-daemon@example.org'}],parts:[{mimeType:'message/delivery-status',body:{data:Buffer.from('Final-Recipient: rfc822; office@example.com\r\nStatus: 5.1.1').toString('base64url')}}]}}]};
  assert.equal(inboundFromThread(thread,'office@example.com','alex@example.org')[0].classification,'bounce');assert.deepEqual(inboundFromThread(thread,'other@example.com','alex@example.org'),[]);
});
test('Notion projection queries stable ID before create and only changes system properties',async()=>{
  const calls=[],provider=new Notion({token:'mock',dataSourceId:'mock-data-source',fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('query')?{results:[{id:'existing'}]}:{id:'existing'}};}});
  const result=await provider.upsert('engine-id',{company:'Example Company',state:'review',nextAction:'Review exact copy'});
  assert.equal(result.id,'existing');assert.ok(calls[0].url.includes('/data_sources/'));assert.equal(calls[1].options.method,'PATCH');assert.ok(!JSON.parse(calls[1].options.body).properties.Approved);
});
test('live Notion sync returns before writes with defaults',async()=>{const f=fixture();const provider={mode:'notion',upsert:()=>{throw Error('forbidden');}};assert.equal((await syncNotion(f.engine,provider)).written,0);f.store.close();});
test('communication projections are stable separate rows and preserve the parent projection',async()=>{
  const f=fixture({configEdit:c=>{c.operations.projectCommunicationWork=true;}}),notion={mode:'mock',pages:new Map(),async upsert(id,data){this.pages.set(id,structuredClone(data));return {id:`mock:${id}`};}};
  f.ready();await f.simulate();await syncNotion(f.engine,notion);const originalId=f.s.prospect.id,original=structuredClone(notion.pages.get(originalId));
  f.engine.planFollowups(f.s.draft.id);assert.equal((await syncNotion(f.engine,notion)).written,3);assert.deepEqual(notion.pages.get(originalId),original);
  assert.equal(notion.pages.size,4);assert.equal((await syncNotion(f.engine,notion)).written,0);
  const prior=[...notion.pages.keys()].filter(k=>k!==originalId);assert.equal(new Set(prior).size,3);assert.ok(prior.every(k=>k.startsWith('communication:')));f.store.close();
});
test('calendar adapter reads a specified event and maps acceptance without creating events',async()=>{
  let method;const calendar=new GoogleCalendar({gmail:{token:async()=> 'mock'},calendarId:'mock-calendar',fetcher:async(url,options)=>{method=options.method;return {ok:true,json:async()=>({id:'event',status:'confirmed',organizer:{email:'alex@example.org'},start:{dateTime:'2026-10-15T15:00:00Z'},end:{dateTime:'2026-10-15T15:30:00Z'},attendees:[{email:'office@example.com',responseStatus:'accepted'}]})};}});
  assert.equal((await calendar.event('event')).attendees[0].accepted,true);assert.equal(method,undefined);
});
for(const address of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','198.18.0.1','::1'])test(`public research blocks private/reserved address ${address}`,()=>assert.equal(publicIPv4(address),false));
for(const url of ['http://example.com','https://example.org','https://example.com:444','https://user:pass@example.com','https://127.0.0.1'])test(`source allowlist rejects ${url}`,()=>assert.throws(()=>allowedUrl(url,['example.com'])));
test('private DNS lookup is refused before source request',async()=>{let requests=0;const web=new PublicWeb({allowedHosts:['example.com'],resolve:async()=>[{address:'127.0.0.1',family:4}],request:()=>{requests++;}});await assert.rejects(web.fetch('https://example.com'),/reserved/);assert.equal(requests,0);});
test('an unsupported assertion cannot be hidden behind a valid citation',()=>{
  const f=fixture();const draft=f.engine.draft({...f.s.draft,sections:[...f.s.draft.sections.slice(0,3),{type:'possibility',text:'Your broken workflow could cost you money.'},f.s.draft.sections.at(-1)]});assert.ok(writingGaps(draft,f.s.prospect,f.config).some(x=>x.includes('Unsupported')));f.store.close();
});
test('sender artifacts cannot expire later than the exact release',()=>{
  const f=fixture();f.approve();const proof=unseal(f.preflight(),f.keys.preflight);proof.expiresAt='2026-10-12T15:10:00Z';f.engine.release(f.s.draft.id,{token:f.keys.admin,preflight:seal(proof,f.keys.preflight)});const release=unseal(f.store.get('release',f.s.draft.id).envelope,f.keys.release);assert.equal(Date.parse(release.expiresAt),Date.parse(proof.expiresAt));f.store.close();
});
