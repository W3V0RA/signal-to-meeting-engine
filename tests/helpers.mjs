import { randomBytes } from 'node:crypto';
import { loadConfig,hash } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { MockMail } from '../src/providers/mock.mjs';
import { Engine,REVIEW_CHECKS } from '../src/engine.mjs';
import { PREFLIGHT_CHECKS,seal } from '../src/security.mjs';
import { scenario } from '../fixtures/scenario.mjs';
export function fixture({path=':memory:',configEdit=()=>{}}={}) {
  const {config,flags}=loadConfig('config/example.json',{});configEdit(config);
  const store=new Store(path,config.tenant),mail=new MockMail(config.business),keys=Object.fromEntries(['admin','release','preflight','inbound'].map(k=>[k,randomBytes(32).toString('hex')]));
  let at=new Date('2026-10-12T15:00:00Z');
  const engine=new Engine({config,flags,store,mail,keys,clock:()=>new Date(at)}),s=scenario(at);
  engine.research(s.prospect,s.pages);engine.draft(s.draft);
  store.put('consent',s.prospect.contact.email,{allowed:true,basis:'Fictional reviewed business relevance',reviewedBy:'Fictional Reviewer',expiresAt:'2027-01-01T00:00:00Z'});
  const f={engine,store,mail,keys,config,s,now:()=>new Date(at),setTime:value=>{at=new Date(value);}};
  f.approve=(id=s.draft.id,extra={})=>engine.approve(id,{token:keys.admin,reviewer:'Fictional Reviewer',checks:Object.fromEntries(REVIEW_CHECKS.map(k=>[k,true])),allowFollowups:true,...extra});
  f.preflight=()=>seal({kind:'sender-preflight',mode:'simulation',tenant:config.tenant,sender:config.business.sender,replyTo:config.business.replyTo,checkedAt:at.toISOString(),expiresAt:new Date(at.getTime()+3600000).toISOString(),checks:Object.fromEntries(PREFLIGHT_CHECKS.map(k=>[k,{artifactHash:hash(`SYNTHETIC TEST ONLY ${k}`)}]))},keys.preflight);
  f.release=(id=s.draft.id,extra={})=>engine.release(id,{token:keys.admin,preflight:f.preflight(),...extra});
  f.ready=()=>{f.approve();f.release();};
  f.simulate=(id=s.draft.id)=>engine.deliver(id,{simulate:true});
  f.refresh=()=>engine.research(s.prospect,s.pages.map(p=>({...p,checkedAt:at.toISOString()})));
  return f;
}
