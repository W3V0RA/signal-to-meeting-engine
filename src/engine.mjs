import { randomUUID } from 'node:crypto';
import { authenticate,hash,normalizeEmail,validateConfig } from './config.mjs';
import { researchGaps,advisoryScore } from './evidence.mjs';
import { bodyFor,writingGaps,messageDigest } from './writing.mjs';
import { seal,unseal,preflightGaps,releasePayload } from './security.mjs';
import { inWindow,localParts,nextWindow,followupDue } from './time.mjs';
import { activationGaps } from './readiness.mjs';
import { mailboxAdmission } from './notifications.mjs';

export const REVIEW_CHECKS=['business','sources','claimsAndHypotheses','contactRoute','exactCopy','suppressionAndConsent'];
export class Engine {
  constructor({config,flags,store,mail,keys,clock=()=>new Date()}) {
    this.config=structuredClone(validateConfig(config));this.flags={dryRun:true,liveSend:false,autonomy:false,integrationWrites:false,...flags};
    this.store=store;this.mail=mail;this.keys=keys;this.clock=clock;
  }
  research(prospect,pages) {
    const now=this.clock(),gaps=researchGaps(prospect,pages,this.config,now);
    return this.store.transaction(()=>{
      this.store.put('prospect',prospect.id,prospect);this.store.put('pages',prospect.id,pages);
      this.store.audit('researched',prospect.id,now,{gaps,priority:advisoryScore(prospect,this.config)});
      return {gaps,priority:advisoryScore(prospect,this.config),stage:gaps.length?'research':'review'};
    });
  }
  draft(input) {
    const p=this.store.get('prospect',input.prospectId);if(!p)throw Error('Unknown prospect');
    const prior=input.id?this.store.get('message',input.id):null;
    if(prior&&this.store.db.prepare('SELECT 1 FROM attempts WHERE message_id=?').get(input.id))throw Error('Attempted copy is immutable; reconcile first');
    const m={...input,id:input.id??randomUUID(),recipient:normalizeEmail(p.contact.email),state:'review',createdAt:this.clock().toISOString()};
    if(!['initial','followup','response'].includes(m.kind))throw Error('Invalid message purpose');
    m.body=bodyFor(m,p,this.config);
    return this.store.transaction(()=>{
      this.store.put('message',m.id,m);this.store.put('approval',m.id,null);this.store.put('release',m.id,null);
      const workId=m.kind==='response'?`response:${m.inboundId}`:m.kind==='followup'?`followup:${m.parentId}:${m.ordinal}`:null;
      if(workId&&this.store.get('work',workId))this.store.put('work',workId,{...this.store.get('work',workId),state:'drafted',messageId:m.id});
      this.store.audit(prior?'copy_changed_approval_invalidated':'drafted',m.id,this.clock(),{purpose:m.kind});return m;
    });
  }
  context(id) {
    const m=this.store.get('message',id);if(!m)throw Error('Unknown message');
    const p=this.store.get('prospect',m.prospectId),pages=this.store.get('pages',m.prospectId)??[];
    return {m,p,pages,digest:messageDigest(m,p,this.config,pages)};
  }
  approve(id,{token,reviewer,checks,allowFollowups=false}) {
    authenticate(token,this.keys.admin);
    if(!reviewer?.trim()||REVIEW_CHECKS.some(k=>checks?.[k]!==true))throw Error('All human review checks required');
    const {digest,m}=this.context(id),at=this.clock();
    const approval={digest,reviewer,at:at.toISOString(),allowFollowups:m.kind==='initial'&&allowFollowups};
    this.store.transaction(()=>{this.store.put('approval',id,approval);this.store.audit('human_approved',id,at,{digest,reviewer,allowFollowups:approval.allowFollowups});});
    return approval;
  }
  baseGaps(id,now,production=false) {
    const {m,p,pages,digest}=this.context(id),gaps=[...researchGaps(p,pages,this.config,now,{production}),...writingGaps(m,p,this.config,this.store.list('message'))];
    if(m.recipient!==normalizeEmail(p.contact.email))gaps.push('Recipient/contact mismatch');
    if(this.store.suppressed(m.recipient))gaps.push('Suppressed recipient');
    const consent=this.store.get('consent',m.recipient);
    if(!consent?.allowed||!consent.basis?.trim()||!consent.reviewedBy||!Number.isFinite(Date.parse(consent.expiresAt))||Date.parse(consent.expiresAt)<=now.getTime())gaps.push('Reviewed outreach permission or legal basis missing/expired');
    const approval=this.store.get('approval',id);
    if(m.kind!=='followup'&&approval?.digest!==digest)gaps.push('Exact-copy human approval missing or changed');
    if(m.kind!=='initial') {
      const parent=this.store.get('message',m.parentId),attempt=this.store.db.prepare('SELECT * FROM attempts WHERE message_id=?').get(m.parentId??'');
      if(!parent||parent.kind!=='initial'||parent.prospectId!==m.prospectId||parent.recipient!==m.recipient||attempt?.status!=='sent'||attempt.thread_id!==m.threadId||attempt.rfc_id!==m.rfcParentId)gaps.push('Purpose/thread/parent mismatch');
      const sequence=this.store.get('sequence',m.parentId);
      if(m.kind==='followup') {
        const initialApproval=this.store.get('approval',m.parentId);
        if(!initialApproval?.allowFollowups||initialApproval.digest!==sequence?.initialDigest||sequence?.configHash!==hash(this.config))gaps.push('Initial sequence authorization missing or changed');
        if(sequence?.stopped)gaps.push('Sequence cancelled on inbound');
        const sent=this.store.list('message').filter(x=>x.parentId===m.parentId&&x.kind==='followup'&&this.store.db.prepare("SELECT 1 FROM attempts WHERE message_id=? AND status='sent'").get(x.id)).length;
        if(!Number.isInteger(m.ordinal)||m.ordinal<1||m.ordinal>this.config.policy.followupDays.length||m.ordinal!==sent+1)gaps.push('Follow-up order or limit');
        if(!m.dueAt||Date.parse(m.dueAt)>now.getTime()||!Number.isFinite(Date.parse(m.dueAt)))gaps.push('Follow-up not due');
      } else {
        const inbound=this.store.db.prepare('SELECT * FROM inbound WHERE id=?').get(m.inboundId??'');
        if(!inbound||inbound.thread_id!==m.threadId||inbound.recipient!==m.recipient||!['reply','interest'].includes(inbound.classification))gaps.push('Response lacks verified inbound context');
        const latest=this.store.db.prepare('SELECT id FROM inbound WHERE thread_id=? AND recipient=? ORDER BY at DESC,rowid DESC LIMIT 1').get(m.threadId??'',m.recipient);
        if(latest?.id!==m.inboundId)gaps.push('Response context superseded by newer inbound');
        if(m.bookingRequested && inbound?.classification!=='interest')gaps.push('Booking needs verified interest and fresh response approval');
      }
    }
    if(m.kind==='initial'&&(m.parentId||m.threadId||m.ordinal||m.bookingRequested))gaps.push('Initial purpose metadata invalid');
    if(m.body.includes(this.config.integrations.bookingUrl)&&!m.bookingRequested)gaps.push('Booking link lacks explicit intent');
    if(production&&/(example\.(com|org)|Fictional)/i.test(JSON.stringify(this.config.business)))gaps.push('Fictional identity cannot send');
    return [...new Set(gaps)];
  }
  release(id,{token,preflight,production=false}) {
    authenticate(token,this.keys.admin);
    const now=this.clock(),gaps=[...this.baseGaps(id,now,production),...preflightGaps(preflight,this.keys.preflight,this.config,now,production)];
    if(gaps.length)throw Error(`Release refused: ${gaps.join('; ')}`);
    const {m,p,pages,digest}=this.context(id);
    const payload=releasePayload(m,p,this.config,pages,digest,now,preflight);
    payload.mode=production?'production':'simulation';
    // A release cannot outlive its sender proof.
    payload.expiresAt=new Date(Math.min(Date.parse(payload.expiresAt),Date.parse(unseal(preflight,this.keys.preflight).expiresAt))).toISOString();
    const envelope=seal(payload,this.keys.release);
    this.store.transaction(()=>{this.store.put('release',id,{envelope,preflight});this.store.audit('release_issued',id,now,{digest,mode:payload.mode,expiresAt:payload.expiresAt});});return envelope;
  }
  deliveryGaps(id,now,production=false) {
    const {m,digest,pages}=this.context(id),gaps=this.baseGaps(id,now,production),stored=this.store.get('release',id);
    try {
      const r=unseal(stored?.envelope,this.keys.release);
      if(r.kind!=='exact-message-release'||r.tenant!==this.config.tenant||r.messageId!==id||r.digest!==digest||r.evidenceHash!==hash(pages)||r.preflightHash!==hash(stored.preflight)||r.recipient!==m.recipient||r.from!==this.config.business.sender||r.replyTo!==this.config.business.replyTo||r.purpose!==m.kind||r.parentId!==(m.parentId??null)||r.ordinal!==(m.ordinal??null)||r.threadId!==(m.threadId??null))gaps.push('Release identity purpose or exact message changed');
      if(!Number.isFinite(Date.parse(r.issuedAt))||Date.parse(r.issuedAt)>now.getTime()||!Number.isFinite(Date.parse(r.expiresAt))||Date.parse(r.expiresAt)<=now.getTime()||Date.parse(r.expiresAt)>Date.parse(r.issuedAt)+3600000)gaps.push('Release expired or malformed');
      if(production&&r.mode!=='production')gaps.push('Simulation release cannot send');
      gaps.push(...preflightGaps(stored.preflight,this.keys.preflight,this.config,now,production));
    }catch{gaps.push('Release authentication failed');}
    if(!inWindow(now,this.config.policy))gaps.push('Outside sending window');
    const check=this.store.get('mailboxCheck',m.recipient);
    if(!check||check.sender!==this.config.business.sender||check.replyTo!==this.config.business.replyTo)gaps.push('Mailbox identity mismatch');
    if(!check||!Number.isFinite(Date.parse(check.at))||Date.parse(check.at)>now.getTime()||now.getTime()-Date.parse(check.at)>this.config.policy.inboundFreshMinutes*60000)gaps.push('Inbound/history check stale');
    if(m.kind==='initial'&&check?.priorThreads?.length)gaps.push('Prior thread exists');
    if(m.kind==='followup'&&check?.inbound?.length)gaps.push('Inbound cancels follow-up');
    const day=localParts(now,this.config.policy).day;
    const attempts=this.store.db.prepare('SELECT * FROM attempts').all();
    if(attempts.some(a=>a.message_id===id))gaps.push('Duplicate or uncertain attempt; manual reconciliation required');
    if(m.kind==='initial'&&attempts.some(a=>a.recipient===m.recipient&&a.kind==='initial'))gaps.push('Recipient already contacted or reserved');
    if(m.kind==='followup'&&attempts.some(a=>a.kind==='followup'&&a.parent_id===m.parentId&&a.ordinal===m.ordinal))gaps.push('Duplicate follow-up touch');
    if(m.kind==='response'&&attempts.some(a=>a.kind==='response'&&a.inbound_id===m.inboundId))gaps.push('Response already reserved for this inbound');
    const todays=attempts.filter(a=>a.local_day===day);
    if(todays.length>=this.config.policy.dailyMailboxCap)gaps.push('Daily mailbox cap');
    if(m.kind==='initial'&&todays.filter(a=>a.kind==='initial').length>=this.config.policy.dailyInitialCap)gaps.push('Daily initial cap');
    const latest=attempts.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
    if(latest&&now.getTime()-Date.parse(latest.at)<this.config.policy.minimumSpacingMinutes*60000)gaps.push('Minimum spacing');
    gaps.push(...mailboxAdmission(this,now));
    return [...new Set(gaps)];
  }
  async deliver(id,{simulate=false}={}) {
    // Disabled returns before provider reads, reservations or approval mutations.
    if(!simulate&&(this.flags.dryRun||!this.flags.liveSend||!this.flags.autonomy))return {status:'dry_run',reason:'Live transport disabled'};
    if(simulate&&(this.mail.mode!=='mock'||!this.flags.dryRun||this.flags.liveSend))throw Error('Simulation requires mock provider and disabled live sending');
    if(!simulate&&this.mail.mode!=='gmail')throw Error('Live provider unavailable');
    if(!simulate){const gaps=activationGaps(this);if(gaps.length)throw Error(`Delivery blocked: ${gaps.join('; ')}`);}
    const {m}=this.context(id),production=!simulate;
    const identity=await this.mail.identity(),check=await this.mail.inspect(m.recipient,m.threadId);
    if(identity.sender!==this.config.business.sender||identity.replyTo!==this.config.business.replyTo)throw Error('Mailbox identity mismatch');
    const now=this.clock();
    this.store.put('mailboxCheck',m.recipient,{...check,...identity,at:now.toISOString()});
    for(const event of check.inbound??[])this.ingest(event,this.keys.inbound);
    // Serialize all workers sharing this one-business database. Reservations count against caps even when uncertain.
    let prepared=null,reservedDigest=null;
    this.store.transaction(()=>{
      const gaps=this.deliveryGaps(id,now,production);if(gaps.length)throw Error(`Delivery blocked: ${gaps.join('; ')}`);
      const ready=this.context(id);reservedDigest=ready.digest;
      this.store.put('attemptContext',id,{...ready,configHash:hash(this.config),business:this.config.business});
      if(this.mail.prepare)prepared=this.mail.prepare({...ready.m,from:this.config.business.sender,replyTo:this.config.business.replyTo,displayName:this.config.business.displayName});
      this.store.db.prepare('INSERT INTO attempts(message_id,recipient,kind,local_day,at,status,parent_id,ordinal,inbound_id,rfc_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,m.recipient,m.kind,localParts(now,this.config.policy).day,now.toISOString(),'reserved',m.parentId??null,m.ordinal??null,m.inboundId??null,prepared?.rfcId??null);
      this.store.audit('reserved',id,now,{simulation:simulate});
    });
    try {
      // Reload and reject edits/suppression received during provider preflight before transport.
      const current=this.context(id);
      if(current.digest!==reservedDigest)throw Error('Reserved message changed before transport');
      if(current.digest!==this.store.get('approval',m.kind==='followup'?m.parentId:id)?.digest&&m.kind!=='followup')throw Error('Copy changed before transport');
      if(this.store.suppressed(m.recipient)||this.baseGaps(id,this.clock(),production).length)throw Error('Safety state changed before transport');
      if(production&&activationGaps(this).length)throw Error('Installation verification or send hold changed');
      const stored=this.store.get('release',id),release=unseal(stored.envelope,this.keys.release),transportTime=this.clock();
      if(release.digest!==current.digest||Date.parse(release.expiresAt)<=transportTime.getTime()||!inWindow(transportTime,this.config.policy)||preflightGaps(stored.preflight,this.keys.preflight,this.config,transportTime,production).length)throw Error('Release or window changed before transport');
      const result=await this.mail.send({...current.m,from:this.config.business.sender,replyTo:this.config.business.replyTo,displayName:this.config.business.displayName},prepared);
      if(!result.id||!result.threadId||!result.rfcId)throw Error('Provider confirmation incomplete');
      this.store.transaction(()=>{
        this.store.db.prepare("UPDATE attempts SET status='sent',provider_id=?,thread_id=?,rfc_id=? WHERE message_id=?").run(result.id,result.threadId,result.rfcId,id);
        this.store.put('message',id,{...current.m,state:'sent'});this.store.audit('provider_accepted',id,this.clock(),{providerId:result.id,simulation:simulate});
        const workId=m.kind==='response'?`response:${m.inboundId}`:m.kind==='followup'?`followup:${m.parentId}:${m.ordinal}`:null;
        if(workId&&this.store.get('work',workId))this.store.put('work',workId,{...this.store.get('work',workId),state:'completed'});
        if(m.kind==='initial')this.store.put('sequence',id,{stopped:false,sentAt:now.toISOString(),initialDigest:current.digest,configHash:hash(this.config)});
        this.store.cost(simulate?'mock':'gmail','send',0,this.clock());
      });
      return {status:simulate?'simulated':'provider_accepted',...result};
    }catch(e){this.store.db.prepare("UPDATE attempts SET status='uncertain' WHERE message_id=?").run(id);this.store.audit('uncertain_hold',id,this.clock(),{reason:'Reconcile provider Sent before any retry'});throw Error('Uncertain attempt held for manual reconciliation',{cause:e});}
  }
  planFollowups(initialId) {
    const parent=this.store.get('message',initialId),attempt=this.store.db.prepare("SELECT * FROM attempts WHERE message_id=? AND status='sent'").get(initialId);
    if(!parent||parent.kind!=='initial'||!attempt)return [];
    const sequence=this.store.get('sequence',initialId),approval=this.store.get('approval',initialId);
    if(!approval?.allowFollowups)return [];
    return this.config.policy.followupDays.map((days,index)=>{
      const id=`followup:${initialId}:${index+1}`,existing=this.store.get('work',id);
      const work={id,kind:'followup',parentId:initialId,prospectId:parent.prospectId,ordinal:index+1,threadId:attempt.thread_id,rfcParentId:attempt.rfc_id,dueAt:followupDue(attempt.at,days,this.config.policy).toISOString(),state:sequence?.stopped?'cancelled':'needs_authoring'};
      // Reconciliation must never revive cancelled work.
      this.store.put('work',id,existing?.state==='completed'||existing?.state==='cancelled'?existing:sequence?.stopped?work:existing??work);return this.store.get('work',id);
    });
  }
  ingest(event,token) {
    authenticate(token,this.keys.inbound);
    if(!event.id||!event.threadId||!event.recipient||!['reply','interest','bounce','unsubscribe'].includes(event.classification)||!Number.isFinite(Date.parse(event.at))||Date.parse(event.at)>this.clock().getTime())throw Error('Inbound event invalid');
    const recipient=normalizeEmail(event.recipient);
    const parent=this.store.db.prepare("SELECT * FROM attempts WHERE thread_id=? AND recipient=? AND kind='initial' AND status='sent'").get(event.threadId,recipient);
    if(!parent||Date.parse(event.at)<Date.parse(parent.at))throw Error('Inbound thread/recipient mismatch');
    return this.store.transaction(()=>{
      const result=this.store.db.prepare('INSERT OR IGNORE INTO inbound VALUES(?,?,?,?,?)').run(event.id,event.threadId,recipient,event.classification,event.at);
      if(!result.changes)return {duplicate:true};
      this.store.put('inboundDetail',event.id,{...event,recipient});
      this.store.put('sequence',parent.message_id,{...this.store.get('sequence',parent.message_id),stopped:true,reason:event.classification});
      for(const work of this.store.list('work').filter(w=>w.parentId===parent.message_id&&w.kind==='followup'&&w.state!=='completed'))this.store.put('work',work.id,{...work,state:'cancelled'});
      for(const msg of this.store.list('message').filter(w=>w.parentId===parent.message_id&&w.kind==='followup'&&w.state!=='sent')) {
        this.store.put('message',msg.id,{...msg,state:'cancelled'});this.store.put('release',msg.id,null);
      }
      for(const msg of this.store.list('message').filter(w=>w.parentId===parent.message_id&&w.kind==='response'&&w.state!=='sent')) {
        this.store.put('approval',msg.id,null);this.store.put('release',msg.id,null);
      }
      if(['bounce','unsubscribe'].includes(event.classification))this.store.suppress(recipient,event.classification,this.clock());
      if(['reply','interest'].includes(event.classification))this.store.put('work',`response:${event.id}`,{id:`response:${event.id}`,kind:'response',parentId:parent.message_id,inboundId:event.id,prospectId:this.store.get('message',parent.message_id).prospectId,threadId:event.threadId,rfcParentId:parent.rfc_id,state:'needs_authoring',interest:event.classification==='interest'});
      this.store.put('work',`alert:${event.id}`,{id:`alert:${event.id}`,kind:'owner_alert',state:'pending',classification:event.classification,inboundId:event.id,parentId:parent.message_id,prospectId:this.store.get('message',parent.message_id).prospectId});
      this.store.audit('inbound_classified',parent.message_id,this.clock(),{id:event.id,classification:event.classification});
      return {duplicate:false,sequenceStopped:true};
    });
  }
  verifyBooking(initialId,event,token) {
    authenticate(token,this.keys.inbound);
    if(event.status==='cancelled') {
      const prior=this.store.db.prepare('SELECT * FROM outcomes WHERE id=? AND record_id=?').get(`booking:${event.id}`,initialId);
      if(!prior)throw Error('Unknown cancelled booking');
      if(JSON.parse(prior.detail).status==='cancelled')return {status:'cancelled'};
      this.store.transaction(()=>{
        this.store.db.prepare('UPDATE outcomes SET detail=? WHERE id=?').run(JSON.stringify({...JSON.parse(prior.detail),status:'cancelled'}),prior.id);
        this.store.put('work',`booking-alert:${event.id}:cancelled`,{id:`booking-alert:${event.id}:cancelled`,kind:'owner_alert',state:'pending',classification:'cancelled_booking',eventId:event.id,parentId:initialId,prospectId:this.store.get('message',initialId).prospectId});
        this.store.audit('booking_cancelled',initialId,this.clock(),{eventId:event.id});
      });return {status:'cancelled'};
    }
    const parent=this.store.get('message',initialId),interest=this.store.db.prepare("SELECT 1 FROM inbound WHERE thread_id=? AND recipient=? AND classification='interest'").get(parent?.threadId??this.store.db.prepare('SELECT thread_id FROM attempts WHERE message_id=?').get(initialId)?.thread_id??'',parent?.recipient??'');
    const bookingResponse=this.store.list('message').find(m=>m.parentId===initialId&&m.kind==='response'&&m.bookingRequested&&m.state==='sent');
    const initialAttempt=this.store.db.prepare('SELECT at FROM attempts WHERE message_id=?').get(initialId);
    if(!interest||!bookingResponse||!event.id||event.status!=='confirmed'||event.organizer!==this.config.business.sender||!event.attendees?.some(a=>a.email===parent.recipient&&a.accepted)||!Number.isFinite(Date.parse(event.start))||!Number.isFinite(Date.parse(event.end))||Date.parse(event.start)<Date.parse(initialAttempt?.at??'')||Date.parse(event.end)<=Date.parse(event.start)||!['mock-calendar','google-calendar'].includes(event.provider))throw Error('Actual accepted calendar event required');
    const prior=this.store.db.prepare('SELECT detail,record_id FROM outcomes WHERE id=?').get(`booking:${event.id}`);
    if(prior&&prior.record_id!==initialId)throw Error('Calendar event already belongs to another initial');
    if(prior&&prior.detail===JSON.stringify(event))return {status:'confirmed',simulation:event.provider==='mock-calendar'};
    this.store.transaction(()=>{
      this.store.db.prepare('INSERT INTO outcomes VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET detail=excluded.detail').run(`booking:${event.id}`,'booking',initialId,this.clock().toISOString(),JSON.stringify(event));
      const workId=`booking-alert:${event.id}:confirmed`;
      if(!this.store.get('work',workId))this.store.put('work',workId,{id:workId,kind:'owner_alert',state:'pending',classification:'confirmed_booking',eventId:event.id,parentId:initialId,prospectId:parent.prospectId});
      this.store.audit('booking_verified',initialId,this.clock(),{eventId:event.id,mode:event.provider});
    });return {status:'confirmed',simulation:event.provider==='mock-calendar'};
  }
  nextEligible(now=this.clock()) {return nextWindow(now,this.config.policy);}
}
