import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { collectMailboxProof,verifyIntegrations } from '../src/verifier.mjs';
import { readiness } from '../src/readiness.mjs';
import { seal,unseal } from '../src/security.mjs';
import { hash } from '../src/config.mjs';
import { snapshot } from '../src/evidence.mjs';

function mailboxFixture({proofHours}={}) {
  const f=fixture({configEdit:c=>{c.verification={ownedInbox:'owned@example.org'};if(proofHours)c.policy.senderProofHours=proofHours;}}),at=f.now().getTime()-10*60000;
  const h=(from,to,id,extra=[])=>[{name:'From',value:from},{name:'To',value:to},{name:'Subject',value:'Controlled Verification Example'},{name:'Message-ID',value:id},...extra];
  const part=(text,headers)=>({mimeType:'text/plain',headers,body:{data:Buffer.from(text).toString('base64url')}});
  const base=(id,threadId,payload,labelIds=[])=>({id,threadId,payload,labelIds,internalDate:String(at)});
  const sentHeaders=h('alex@example.org','owned@example.org','<initial@example.org>',[{name:'Reply-To',value:'alex@example.org'}]);
  const receivedHeaders=[...sentHeaders,{name:'Authentication-Results',value:'mx.google.com; spf=pass smtp.mailfrom=alex@example.org; dkim=pass header.d=example.org; dmarc=pass header.from=example.org;'},{name:'Received',value:'from mail.example.org by mx.google.com with ESMTPS id example version=TLS1_3;'}];
  const replyHeaders=h('owned@example.org','alex@example.org','<reply@example.org>',[{name:'In-Reply-To',value:'<initial@example.org>'}]);
  const optOutHeaders=h('owned@example.org','alex@example.org','<optout@example.org>',[{name:'In-Reply-To',value:'<initial@example.org>'}]);
  const messages={sent:base('sent','sender-thread',part('Fictional exact message',sentHeaders),['SENT']),received:base('received','receiver-thread',part('Fictional exact message',receivedHeaders)),replySent:base('replySent','receiver-thread',part('What would that review involve?',replyHeaders),['SENT']),replyReceived:base('replyReceived','sender-thread',part('What would that review involve?',replyHeaders)),optOutSent:base('optOutSent','receiver-thread',part('Please unsubscribe me',optOutHeaders),['SENT']),optOutReceived:base('optOutReceived','sender-thread',part('Please unsubscribe me',optOutHeaders))};
  const references=Object.fromEntries(Object.keys(messages).map(k=>[k,k])),calls=[];
  const sender={mode:'mock',identity:async()=>({sender:'alex@example.org',replyTo:'alex@example.org'}),message:async id=>{calls.push(id);return structuredClone(messages[id]);}};
  const receiver={mode:'mock',api:async()=>({emailAddress:'owned@example.org'}),message:sender.message};
  const collect=extra=>collectMailboxProof(f.engine,{sender,receiver,references,token:f.keys.admin,reviewer:'Fictional Reviewer',simulation:true,...extra});
  return {...f,messages,references,calls,sender,receiver,collect};
}
test('collector reads six existing artifact captures, verifies matching routes/copy, and never sends',async()=>{
  const f=mailboxFixture();const artifact=await f.collect();assert.equal(artifact.mode,'simulation');assert.equal(f.calls.length,6);assert.equal(f.mail.sent.length,0);assert.equal(f.store.suppressed('owned@example.org'),true);assert.equal(f.store.suppressed('other@example.org'),false);
  const proof=unseal(f.store.get('installation','preflight').envelope,f.keys.preflight);assert.ok(proof.checks.exactMessage.artifactHash);assert.equal(readiness(f.engine).verificationComplete,false);f.store.close();
});
for(const [name,mutate]of [
  ['missing reference',f=>delete f.references.replySent],
  ['old artifact',f=>f.messages.received.internalDate=String(f.now().getTime()-3600001)],
  ['future artifact',f=>f.messages.received.internalDate=String(f.now().getTime()+1)],
  ['different exact body',f=>f.messages.received.payload.body.data=Buffer.from('Added footer').toString('base64url')],
  ['different message ID',f=>f.messages.received.payload.headers.find(h=>h.name==='Message-ID').value='<other@example.org>'],
  ['missing Reply To routing',f=>f.messages.replyReceived.threadId='other-thread'],
  ['unsigned receiver auth',f=>f.messages.received.payload.headers.find(h=>h.name==='Authentication-Results').value='untrusted.example.org; spf=pass; dkim=pass; dmarc=pass'],
  ['failed authentication',f=>f.messages.received.payload.headers.find(h=>h.name==='Authentication-Results').value='mx.google.com; spf=fail; dkim=pass; dmarc=pass'],
  ['no received TLS',f=>f.messages.received.payload.headers.find(h=>h.name==='Received').value='from mail.example.org by mx.google.com with ESMTP id example;'],
  ['no actual opt out',f=>f.messages.optOutReceived.payload.body.data=Buffer.from('Thank you').toString('base64url')],
  ['missing owned Sent mirror',f=>f.messages.optOutSent.labelIds=[]],
  ['wrong owned inbox',f=>f.receiver.api=async()=>({emailAddress:'other@example.org'})],
  ['wrong sender',f=>f.sender.identity=async()=>({sender:'other@example.org',replyTo:'other@example.org'})]
])test(`real-evidence collector refuses ${name}`,async()=>{const f=mailboxFixture();mutate(f);await assert.rejects(f.collect());assert.equal(f.store.get('installation','preflight'),null);assert.equal(f.mail.sent.length,0);f.store.close();});
test('simulated mailbox captures cannot be promoted to production proof',async()=>{const f=mailboxFixture();await assert.rejects(f.collect({simulation:false}),/real owned Gmail/);assert.equal(f.store.get('installation','preflight'),null);f.store.close();});
test('collector requires authenticated human verifier',async()=>{const f=mailboxFixture();await assert.rejects(f.collect({token:'wrong'}),/Authentication/);await assert.rejects(f.collect({reviewer:''}),/Human verifier/);f.store.close();});
test('configured 24-hour sender proof expires from actual artifacts and never extends old evidence',async()=>{
  const f=mailboxFixture({proofHours:24}),old=f.now().getTime()-23*3600000;
  for(const message of Object.values(f.messages))message.internalDate=String(old);
  const artifact=await f.collect();assert.equal(Date.parse(artifact.expiresAt),old+24*3600000);
  assert.equal(Date.parse(unseal(f.store.get('installation','preflight').envelope,f.keys.preflight).expiresAt),old+24*3600000);f.store.close();
});
test('DKIM identity domain in actual receiver header is supported without inventing header d',async()=>{const f=mailboxFixture();const auth=f.messages.received.payload.headers.find(h=>h.name==='Authentication-Results');auth.value=auth.value.replace('header.d=example.org','header.i=@example.org');assert.equal((await f.collect()).mode,'simulation');f.store.close();});
test('a lower spoofed TLS header cannot override the first receiving gateway observation',async()=>{const f=mailboxFixture();f.messages.received.payload.headers.find(h=>h.name==='Received').value='from mail.example.org by mx.google.com with ESMTP id example;';f.messages.received.payload.headers.push({name:'Received',value:'by mx.google.com with ESMTPS id lower-header'});await assert.rejects(f.collect(),/TLS/);f.store.close();});
test('integration verification seals business-specific reads and rejects simulation for live readiness',async()=>{
  const f=fixture();f.store.put('installation','workerHealth',{ok:true,at:f.now().toISOString(),configHash:hash(f.config),mode:'simulation'});
  const args={mail:{mode:'mock',identity:async()=>({sender:f.config.business.sender,replyTo:f.config.business.replyTo})},research:{fetch:async url=>snapshot(url,'Example source',f.now())},token:f.keys.admin,reviewer:'Reviewer',simulation:true};
  await verifyIntegrations(f.engine,args);assert.equal(unseal(f.store.get('installation','integrationChecks'),f.keys.preflight).mode,'simulation');assert.equal(readiness(f.engine).verificationComplete,false);await assert.rejects(verifyIntegrations(f.engine,{...args,simulation:false}),/cannot clear production/);f.store.close();
});
test('altered integration verification envelope fails closed',()=>{const f=fixture();f.store.put('installation','integrationChecks',seal({kind:'integration-checks',mode:'production',tenant:f.config.tenant,configHash:'changed',expiresAt:'2027-01-01T00:00:00Z'},f.keys.preflight));assert.ok(readiness(f.engine).gaps.some(g=>g.includes('business verification')));f.store.close();});
