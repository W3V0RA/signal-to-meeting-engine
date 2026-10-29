import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fixture } from './helpers.mjs';
import { createInterview } from '../src/interview.mjs';
import { createConsole } from '../src/console.mjs';

function setup(){
  const root=mkdtempSync(join(tmpdir(),'engine-interview-'));mkdirSync(join(root,'config'));mkdirSync(join(root,'runtime'));
  const f=fixture(),config=JSON.parse(readFileSync('config/example.json','utf8'));config.tenant=f.engine.config.tenant;f.engine.config=config;
  writeFileSync(join(root,'config','local.json'),JSON.stringify(config));writeFileSync(join(root,'.env'),'DRY_RUN=true\nGOOGLE_CLIENT_SECRET=old\n');
  const application={engine:f.engine,worker:{running:false,readsEnabled:true,researchEnabled:true,ownerEmailEnabled:true}},interview=createInterview(application,{root});application.interview=interview;
  const v=interview.view(),input={version:v.version,business:{...v.business,name:'Example Business',displayName:'Example Person',website:'https://business.example.com',sender:'owner@example.com',replyTo:'owner@example.com',postalAddress:'123 Sample Road'},primaryOffer:{description:'Review an intake workflow',tags:['intake']},markets:['Midwest'],sectors:['Services'],sources:['https://business.example.com/about'],allowedHosts:[],policy:{...v.policy,bookingEnabled:false},integrations:{...v.integrations,ownerEmail:'owner@example.com',bookingUrl:'',ownedInbox:'verify@example.org'},writing:{...v.writing,subjectCase:'sentence'},credentials:{GOOGLE_CLIENT_SECRET:'fake_test_secret'}};
  return {root,f,application,interview,input,close(){f.store.close();rmSync(root,{recursive:true,force:true});}};
}
test('interview previews without secret disclosure, saves behind hold and preserves other configuration',()=>{const t=setup();try{
  const before=t.f.engine.context(t.f.s.draft.id).digest,plan=t.interview.preview(t.input);assert.ok(!JSON.stringify(plan).includes('fake_test_secret'));
  const result=t.interview.save({...t.input,planHash:plan.planHash,confirmation:'Save configuration and keep sending held'},{reviewer:'Reviewer'});
  assert.deepEqual(result,{saved:true,restartRequired:true});assert.equal(t.f.store.get('installation','sendHold').held,true);assert.equal(t.application.worker.readsEnabled,false);assert.equal(t.f.engine.flags.integrationWrites,false);
  const saved=JSON.parse(readFileSync(join(t.root,'config','local.json')));assert.equal(saved.tenant,t.f.engine.config.tenant);assert.equal(saved.business.name,'Example Business');assert.equal(saved.policy.dailyMailboxCap,t.f.engine.config.policy.dailyMailboxCap);assert.equal(saved.icp.headcountAdvisory,true);assert.deepEqual(saved.discovery.allowedHosts,['business.example.com']);
  assert.ok(!JSON.stringify(t.f.store.db.prepare('SELECT detail FROM audit').all()).includes('fake_test_secret'));
  const parsed=spawnSync(process.execPath,['--env-file='+join(t.root,'.env'),'-e','process.exit(process.env.GOOGLE_CLIENT_SECRET === "fake_test_secret" ? 0 : 1)'],{env:{PATH:process.env.PATH},encoding:'utf8'});assert.equal(parsed.status,0,parsed.stderr);
  t.f.engine.config=saved;assert.notEqual(t.f.engine.context(t.f.s.draft.id).digest,before);
}finally{t.close();}});
test('stale review, busy worker and malformed settings cannot save',()=>{const t=setup();try{
  const plan=t.interview.preview(t.input),changed=structuredClone(t.input);changed.business.name='Changed after review';assert.throws(()=>t.interview.save({...changed,planHash:plan.planHash,confirmation:'Save configuration and keep sending held'},{reviewer:'Reviewer'}),/changed since preview/);
  t.application.worker.running=true;assert.throws(()=>t.interview.save({...t.input,planHash:plan.planHash,confirmation:'Save configuration and keep sending held'},{reviewer:'Reviewer'}),/in progress/);t.application.worker.running=false;
  const bad=structuredClone(t.input);bad.policy.followupDays=[7,4];bad.policy.followupMinGapDays=[0,1];assert.throws(()=>t.interview.preview(bad),/cadence/);
  assert.equal(JSON.parse(readFileSync(join(t.root,'config','local.json'))).business.name,'Example Workflow Studio');
}finally{t.close();}});
test('concurrent disk changes, header injection and unverifiable booking settings fail closed',()=>{const t=setup();try{
  const invalid=structuredClone(t.input);invalid.credentials.GOOGLE_CLIENT_SECRET='abc\nLIVE_SEND_ENABLED=true';assert.throws(()=>t.interview.preview(invalid),/single-line/);
  invalid.credentials={};invalid.policy.bookingEnabled=true;invalid.policy.booking={canonicalScheduleUrl:'https://example.com/fake',scheduleTitle:'Call',durationMinutes:30};invalid.integrations.bookingUrl='https://example.com/fake';assert.throws(()=>t.interview.preview(invalid),/Google appointment/);
  writeFileSync(join(t.root,'config','local.json'),'{}');assert.throws(()=>t.interview.preview(t.input),/changed on disk/);
}finally{t.close();}});
test('setup API requires authenticated session and a CSRF token',async()=>{const t=setup();try{
  const handle=createConsole(t.application);async function req(path,{method='GET',input,cookie='',csrf=''}={}){const request={method,url:path,headers:{host:'127.0.0.1:3401',origin:'http://127.0.0.1:3401','content-type':'application/json',cookie,'x-csrf-token':csrf},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){if(input!==undefined)yield Buffer.from(JSON.stringify(input));}},r={};await handle(request,{writeHead:(s,h)=>{r.status=s;r.headers=h;},end:body=>{r.body=JSON.parse(body);}});return r;}
  assert.equal((await req('/api/setup')).status,401);const login=await req('/api/login',{method:'POST',input:{token:t.f.keys.admin,reviewer:'Reviewer'}}),cookie=login.headers['Set-Cookie'].split(';')[0];assert.equal((await req('/api/setup',{cookie})).status,200);assert.equal((await req('/api/setup/preview',{method:'POST',cookie,input:t.input})).status,403);
  const preview=await req('/api/setup/preview',{method:'POST',cookie,csrf:login.body.csrf,input:t.input});assert.equal(preview.status,200);assert.ok(!JSON.stringify(preview.body).includes('fake_test_secret'));
}finally{t.close();}});
test('fresh setup generates an isolated tenant and rerunning preserves it',()=>{const root=mkdtempSync(join(tmpdir(),'engine-install-'));try{
  for(const name of ['src','scripts','config','schema'])cpSync(name,join(root,name),{recursive:true,filter:path=>!path.endsWith('local.json')});cpSync('.env.example',join(root,'.env.example'));
  const run=()=>spawnSync(process.execPath,['scripts/setup.mjs'],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH}});
  const first=run();assert.equal(first.status,0,first.stderr);const config=JSON.parse(readFileSync(join(root,'config','local.json'),'utf8'));assert.match(config.tenant,/^local-/);
  config.business.name='Preserved';writeFileSync(join(root,'config','local.json'),JSON.stringify(config));const second=run();assert.equal(second.status,0,second.stderr);
  const retained=JSON.parse(readFileSync(join(root,'config','local.json'),'utf8'));assert.equal(retained.tenant,config.tenant);assert.equal(retained.business.name,'Preserved');
}finally{rmSync(root,{recursive:true,force:true});}});
