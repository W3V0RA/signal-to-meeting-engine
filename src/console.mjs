import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { authenticate,normalizeEmail,email,hash } from './config.mjs';
import { readiness } from './readiness.mjs';
import { dashboard,learning } from './reporting.mjs';
import { refreshProspectSources } from './discovery.mjs';
import { scenario } from '../fixtures/scenario.mjs';
import { snapshot } from './evidence.mjs';
import { dailyDiscoveryProgress } from './daily-discovery.mjs';

function requireVersion(engine,id,digest) {if(typeof digest!=='string'||engine.context(id).digest!==digest)throw Error('Draft changed; reload its current exact copy before reviewing or editing');}
function state(application) {
  const {engine}=application,store=engine.store;
  return {business:engine.config.business,timezone:engine.config.policy.timezone,offers:engine.config.offers,preApprovalRequired:engine.config.policy.requirePreApprovalRelease===true,authoringBriefRequired:engine.config.policy.requireAuthoringBrief===true,bookingStrategy:engine.config.policy.booking?.strategy??'interest-only',bookingDurationMinutes:engine.config.policy.booking?.durationMinutes??null,discoveryProgress:dailyDiscoveryProgress(engine),readiness:readiness(engine),metrics:dashboard(store),learning:learning(store),
    candidates:store.list('discoveryCandidate'),prospects:store.list('prospect'),messages:store.list('message').map(m=>{
      const ctx=engine.context(m.id);let gaps;
      try{gaps=engine.baseGaps(m.id,engine.clock(),true);}catch{gaps=['Research or message structure needs repair'];}
      const approval=store.get('approval',m.id);return {...m,digest:ctx.digest,approvalCurrent:approval?.digest===ctx.digest,approvedBy:approval?.reviewer??null,gaps,sources:ctx.pages.map(p=>({url:p.url,text:p.text,digest:p.digest,checkedAt:p.checkedAt}))};
    }),work:store.list('work'),inbound:store.list('inboundDetail'),research:store.list('researchWork'),jobs:store.jobs(),
    notifications:store.db.prepare('SELECT id,kind,recipient,subject,state,created_at FROM notifications ORDER BY created_at DESC LIMIT 100').all(),
    audit:store.db.prepare('SELECT event,record_id,at,detail FROM audit ORDER BY id DESC LIMIT 100').all()};
}

export function createConsole(application,{port=3401,clock=()=>Date.now()}={}) {
  const sessions=new Map(),failures=new Map(),origin=`http://127.0.0.1:${port}`;
  const files={'/':{name:'index.html',type:'text/html; charset=utf-8'},'/app.js':{name:'app.js',type:'text/javascript; charset=utf-8'},'/app.css':{name:'app.css',type:'text/css; charset=utf-8'}};
  const security={'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
  function send(res,status,data,headers={}){res.writeHead(status,{...security,'Content-Type':'application/json; charset=utf-8',...headers});res.end(typeof data==='string'?data:JSON.stringify(data));}
  async function json(req) {
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw Error('JSON request body required');
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>524288)throw Error('Request too large');chunks.push(chunk);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  return async function handler(req,res) {
    try {
      const host=req.headers.host;
      if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress))return send(res,403,{error:'Loopback access only'});
      const url=new URL(req.url,origin),mutation=req.method==='POST';
      if(mutation&&![origin,`http://localhost:${port}`].includes(req.headers.origin))return send(res,403,{error:'Same-origin request required'});
      if(req.method==='GET'&&files[url.pathname]) {
        const file=files[url.pathname];res.writeHead(200,{...security,'Content-Type':file.type});res.end(readFileSync(new URL(`../web/${file.name}`,import.meta.url),'utf8'));return;
      }
      if(mutation&&url.pathname==='/api/login') {
        const key=req.socket.remoteAddress,attempt=failures.get(key);
        if(attempt&&attempt.count>=5&&clock()-attempt.at<300000)return send(res,429,{error:'Wait five minutes before trying again'});
        const input=await json(req);
        try{authenticate(input.token,application.engine.keys.admin);}catch{failures.set(key,{count:clock()- (attempt?.at??0)<300000?(attempt?.count??0)+1:1,at:clock()});return send(res,401,{error:'Operator access key not accepted'});}
        if(!input.reviewer?.trim())throw Error('Enter your reviewer name');
        failures.delete(key);const sid=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
        sessions.set(sid,{reviewer:input.reviewer.trim(),csrf,expires:clock()+(application.engine.config.operations?.sessionMinutes??15)*60000});
        send(res,200,{csrf,reviewer:input.reviewer.trim()},{'Set-Cookie':`engine_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=900`});return;
      }
      const sid=req.headers.cookie?.match(/(?:^|;\s*)engine_session=([a-f0-9]{64})(?:;|$)/)?.[1],session=sessions.get(sid);
      if(!session||session.expires<=clock()){sessions.delete(sid);return send(res,401,{error:'Sign in to review this business'});}
      if(req.method==='GET'&&url.pathname==='/api/state')return send(res,200,state(application));
      if(req.method==='GET'&&url.pathname==='/api/session')return send(res,200,{csrf:session.csrf,reviewer:session.reviewer});
      if(!mutation||!url.pathname.startsWith('/api/'))return send(res,404,{error:'Unknown operation'});
      try{authenticate(req.headers['x-csrf-token'],session.csrf);}catch{return send(res,403,{error:'Review session token required'});}
      const input=await json(req),e=application.engine;
      if(url.pathname==='/api/example') {
        if(e.config.tenant!=='fictional-demo'||!e.flags.dryRun||e.flags.liveSend)throw Error('Fictional examples use a separate disabled demo installation');
        const sample=scenario(e.clock());e.research(sample.prospect,sample.pages);return send(res,200,e.draft(sample.draft));
      }
      if(url.pathname==='/api/company') {
        const domain=new URL(input.website).hostname;
        if(!input.company?.trim()||!email(input.contactEmail)||!input.fact?.trim()||!input.personQuote?.trim())throw Error('Company, contact, fact and person quotation required');
        const id=`company:${hash(domain)}`,existing=e.store.get('prospect',id);
        if(existing)throw Error('Company already exists; review current research before updating');
        const prospect={id,companyName:input.company.trim(),domain,businessVerified:input.businessReviewed===true,offerId:input.offerId,claims:[{id:'fact',type:'fact',text:input.fact.trim(),sourceUrl:input.factSource}],
          contact:{name:input.contactName?.trim(),role:input.contactRole?.trim(),email:normalizeEmail(input.contactEmail),routeType:input.routeType,routeSource:input.routeSource,personSource:input.personSource,personQuote:input.personQuote.trim()}};
        const textByUrl=new Map();
        for(const [url,text]of [[input.factSource,input.fact],[input.personSource,input.personQuote],[input.routeSource,input.contactEmail]]) {new URL(url);textByUrl.set(url,(textByUrl.get(url)??'')+'\n'+text);}
        const pages=[...textByUrl].map(([url,text])=>snapshot(url,text,e.clock(),'operator-import'));
        return send(res,200,e.research(prospect,pages));
      }
      if(url.pathname==='/api/logout'){sessions.delete(sid);return send(res,200,{signedOut:true},{'Set-Cookie':'engine_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
      if(url.pathname==='/api/research') {
        if(!input.prospect?.id||!Array.isArray(input.pages)||input.pages.length>20)throw Error('Prospect and up to twenty source captures required');
        return send(res,200,e.research(input.prospect,input.pages.map(p=>({...p,mode:'operator-import'}))));
      }
      if(url.pathname==='/api/draft') {
        if(input.message?.id&&e.store.get('message',input.message.id))requireVersion(e,input.message.id,input.digest);
        return send(res,200,e.draft(input.message));
      }
      if(url.pathname==='/api/approve') {
        requireVersion(e,input.id,input.digest);
        return send(res,200,e.approve(input.id,{token:e.keys.admin,reviewer:session.reviewer,checks:input.checks,allowFollowups:input.allowFollowups===true}));
      }
      if(url.pathname==='/api/release') {
        requireVersion(e,input.id,input.digest);const proof=e.store.get('installation','preflight');
        return send(res,200,e.release(input.id,{token:e.keys.admin,preflight:proof?.envelope,production:true,preApproval:input.preApproval===true}));
      }
      if(url.pathname==='/api/consent') {
        if(!email(input.email)||input.allowed!==true||!input.basis?.trim()||!Number.isFinite(Date.parse(input.expiresAt))||Date.parse(input.expiresAt)<=e.clock().getTime())throw Error('Reviewed route, basis and future expiry are required');
        e.store.put('consent',normalizeEmail(input.email),{allowed:true,basis:input.basis.trim(),expiresAt:input.expiresAt,reviewedBy:session.reviewer});e.store.audit('permission_reviewed',normalizeEmail(input.email),e.clock(),{reviewer:session.reviewer});return send(res,200,{stored:true});
      }
      if(url.pathname==='/api/suppress') {
        if(!email(input.email)||!input.reason?.trim())throw Error('Exact route and suppression reason required');
        e.store.suppress(normalizeEmail(input.email),input.reason,e.clock());return send(res,200,{suppressed:true});
      }
      if(url.pathname==='/api/hold') {e.store.holdSending('Operator requested send hold',e.clock());return send(res,200,{held:true});}
      if(url.pathname==='/api/cycle')return send(res,200,await application.worker.tick());
      if(url.pathname==='/api/source-refresh') {
        if(!application.worker.researchEnabled)throw Error('Research network reads are disabled');
        return send(res,200,await refreshProspectSources(e,input.prospectId,application.providers.research));
      }
      if(url.pathname==='/api/calendar-association') {
        if(!input.eventId||!e.store.get('message',input.initialId))throw Error('Reviewed event and initial message references required');
        e.store.put('calendarAssociation',input.eventId,{eventId:input.eventId,initialId:input.initialId,reviewer:session.reviewer});e.store.audit('calendar_associated',input.initialId,e.clock(),{eventId:input.eventId,reviewer:session.reviewer});return send(res,200,{stored:true});
      }
      return send(res,404,{error:'No send or activation action is exposed by this console'});
    } catch(error){return send(res,400,{error:error instanceof SyntaxError?'Invalid JSON':error.message.slice(0,500)});}
  };
}
