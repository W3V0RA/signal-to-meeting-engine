import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlText,protectedAddress,messageText } from '../src/text.mjs';
import { Gmail,inboundFromThread } from '../src/providers/gmail.mjs';
import { fixture } from './helpers.mjs';

const body=(text,type='text/plain')=>({mimeType:type,body:{data:Buffer.from(text).toString('base64url')}});
function incoming(text,{from='office@example.com',type='text/plain'}={}) {return {id:'thread',messages:[{id:'reply',internalDate:'1791817200000',payload:{...body(text,type),headers:[{name:'From',value:from}]}}]};}
test('HTML-only replies are decoded and quoted unsubscribe footer cannot masquerade as intent',()=>{
  const thread=incoming('<p>Thanks, can you explain the review?</p><blockquote>If you prefer no further emails, reply unsubscribe.</blockquote>',{type:'text/html'});
  const event=inboundFromThread(thread,'office@example.com','alex@example.org')[0];assert.equal(event.classification,'reply');assert.match(event.text,/explain/);assert.ok(!event.text.includes('unsubscribe'));
});
test('Gmail quote containers are excluded from reply intent',()=>{const text=messageText(body('<p>Please send the booking link</p><div class="gmail_quote">reply unsubscribe</div>','text/html'));assert.equal(text,'Please send the booking link');});
test('plain quoted unsubscribe and original-message sections are excluded',()=>{const event=inboundFromThread(incoming('Thanks, please send the booking link\n\nOn Monday someone wrote:\n> reply unsubscribe'),'office@example.com','alex@example.org')[0];assert.equal(event.classification,'interest');});
test('unknown participant in the actual thread stops follow-ups without manufacturing interest',()=>{const event=inboundFromThread(incoming('Please send the booking link',{from:'assistant@example.com'}),'office@example.com','alex@example.org')[0];assert.equal(event.classification,'reply');assert.equal(event.unverifiedRoute,true);assert.equal(event.recipient,'office@example.com');});
test('separately configured exact route alias can establish explicit interest',()=>{const event=inboundFromThread(incoming('Please send the booking link',{from:'assistant@example.com'}),'office@example.com','alex@example.org',{aliases:['assistant@example.com']})[0];assert.equal(event.classification,'interest');assert.equal(event.unverifiedRoute,false);});
test('script content is not extracted as source or inbound evidence',()=>{assert.equal(htmlText('<p>Real source fact</p><script>invented@example.org</script>'),'Real source fact');});
test('company-published encoded and mailto addresses are decoded from actual source bytes',()=>{
  const route='office@example.com',key=37,encoded=Buffer.from([key,...Buffer.from(route).map(n=>n^key)]).toString('hex');assert.equal(protectedAddress(encoded),route);
  const text=htmlText(`<p>Contact <a data-cfemail="${encoded}">protected route</a><a href="mailto:office%40example.com">Email</a></p>`,{contactRoutes:true});assert.ok(text.includes(route));assert.equal(protectedAddress('invalid'),'');
});
test('mailbox-wide structured bounce correlates exact route and original Message-ID across threads',async()=>{
  const f=fixture(),queries=[];
  const gmail=new Gmail({business:f.config.business,credentials:{}});
  gmail.thread=async()=>({id:'original-thread',messages:[]});gmail.listMessages=async q=>{queries.push(q);return [{id:'dsn'}];};
  gmail.message=async()=>({id:'dsn',threadId:'different-thread',internalDate:'1791817200000',payload:{mimeType:'multipart/report',headers:[{name:'From',value:'mailer-daemon@example.org'}],parts:[body('Final-Recipient: rfc822; office@example.com\nStatus: 5.1.1','message/delivery-status'),body('Message-ID: <original@example.org>','text/rfc822-headers')]}});
  const result=await gmail.scan({attempts:[{kind:'initial',recipient:'office@example.com',thread_id:'original-thread',rfc_id:'<original@example.org>',at:'2026-10-12T14:00:00Z'}],since:'2026-10-12T00:00:00Z'});
  assert.equal(result.events[0].threadId,'original-thread');assert.equal(result.events[0].classification,'bounce');assert.equal(result.warnings.length,0);assert.match(queries[0],/after:/);f.store.close();
});
test('unmatched mailbox-wide bounce becomes a review warning and cannot suppress another route',async()=>{
  const f=fixture(),gmail=new Gmail({business:f.config.business,credentials:{}});gmail.listMessages=async()=>[{id:'dsn'}];gmail.message=async()=>({id:'dsn',internalDate:'1791817200000',payload:body('Final-Recipient: rfc822; other@example.com\nStatus: 5.1.1','message/delivery-status')});
  const result=await gmail.scan({attempts:[],since:'2026-10-12T00:00:00Z'});assert.equal(result.events.length,0);assert.equal(result.warnings.length,1);f.store.close();
});
test('large attached inline text is rejected before attachment access',async()=>{const f=fixture(),gmail=new Gmail({business:f.config.business,credentials:{}});gmail.api=async()=>{throw Error('Unexpected attachment call');};await assert.rejects(gmail.hydratePayload('id',{mimeType:'text/plain',body:{attachmentId:'a',size:2000001}}),/safe parsing limit/);f.store.close();});
test('Gmail text attachment hydration preserves original MIME part',async()=>{const f=fixture(),gmail=new Gmail({business:f.config.business,credentials:{}});gmail.api=async()=>({data:Buffer.from('Please unsubscribe me').toString('base64url')});const payload={mimeType:'text/plain',body:{attachmentId:'a',size:30}};await gmail.hydratePayload('m',payload);assert.match(messageText(payload),/unsubscribe/);f.store.close();});
