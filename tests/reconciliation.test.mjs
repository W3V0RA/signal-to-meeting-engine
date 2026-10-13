import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { reconcileAttempt } from '../src/reconciliation.mjs';
import { hash } from '../src/config.mjs';

function uncertain() {
  const f=fixture(),context=f.engine.context(f.s.draft.id),message={id:'provider-message',threadId:'provider-thread',labelIds:['SENT'],payload:{mimeType:'text/plain',headers:[{name:'From',value:f.config.business.sender},{name:'Reply-To',value:f.config.business.replyTo},{name:'To',value:f.s.prospect.contact.email},{name:'Subject',value:context.m.subject},{name:'Message-ID',value:'<reserved@example.org>'}],body:{data:Buffer.from(context.m.body).toString('base64url')}}};
  f.store.put('attemptContext',f.s.draft.id,{...context,configHash:hash(f.config),business:f.config.business});
  f.store.db.prepare('INSERT INTO attempts(message_id,recipient,kind,local_day,at,status,rfc_id) VALUES(?,?,?,?,?,?,?)').run(f.s.draft.id,f.s.prospect.contact.email,'initial','2026-10-12',f.now().toISOString(),'uncertain','<reserved@example.org>');
  const mail={mode:'mock',identity:async()=>({sender:f.config.business.sender,replyTo:f.config.business.replyTo}),reconcileAttempt:async()=>[message]};
  return {...f,message,mail,reconcile:()=>reconcileAttempt(f.engine,f.s.draft.id,{mail,token:f.keys.admin,reviewer:'Fictional Reviewer',simulation:true})};
}
test('exact provider Sent readback resolves acceptance without resending and keeps installation held',async()=>{const f=uncertain();const result=await f.reconcile();assert.equal(result.status,'provider_accepted');assert.equal(f.store.db.prepare('SELECT status FROM attempts WHERE message_id=?').get(f.s.draft.id).status,'sent');assert.equal(f.store.get('message',f.s.draft.id).state,'sent');assert.equal(f.store.get('installation','sendHold').held,true);assert.equal(f.mail.sent,undefined);f.store.close();});
test('absence of a provider match never proves unsent or clears the attempt',async()=>{const f=uncertain();f.mail.reconcileAttempt=async()=>[];assert.equal((await f.reconcile()).status,'held');assert.equal(f.store.db.prepare('SELECT status FROM attempts WHERE message_id=?').get(f.s.draft.id).status,'uncertain');f.store.close();});
test('multiple provider matches remain held',async()=>{const f=uncertain();f.mail.reconcileAttempt=async()=>[f.message,f.message];assert.equal((await f.reconcile()).status,'held');f.store.close();});
for(const field of ['body','subject','recipient','sender','messageId'])test(`changed provider ${field} cannot resolve uncertain acceptance`,async()=>{
  const f=uncertain();if(field==='body')f.message.payload.body.data=Buffer.from('changed').toString('base64url');else f.message.payload.headers.find(h=>h.name===({subject:'Subject',recipient:'To',sender:'From',messageId:'Message-ID'}[field])).value='changed';await assert.rejects(f.reconcile(),/does not match/);assert.equal(f.store.db.prepare('SELECT status FROM attempts WHERE message_id=?').get(f.s.draft.id).status,'uncertain');f.store.close();
});
test('missing reserved Message-ID keeps uncertainty held',async()=>{const f=uncertain();f.store.db.prepare('UPDATE attempts SET rfc_id=NULL WHERE message_id=?').run(f.s.draft.id);await assert.rejects(f.reconcile(),/Message-ID/);f.store.close();});
