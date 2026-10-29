import { randomUUID } from 'node:crypto';
import { authenticate,hash,normalizeEmail,validateConfig } from './config.mjs';
import { researchGaps,advisoryScore } from './evidence.mjs';
import { bodyFor,writingGaps,messageDigest } from './writing.mjs';
import { seal,unseal,preflightGaps,releasePayload } from './security.mjs';
import { inWindow,localParts,nextWindow,followupDue } from './time.mjs';
import { activationGaps } from './readiness.mjs';
import { mailboxAdmission } from './notifications.mjs';
import { bookingScheduleGaps } from './booking.mjs';
import { noteNewContact,noteVerifiedDraft } from './daily-discovery.mjs';

export const REVIEW_CHECKS=['business','sources','claimsAndHypotheses','contactRoute','exactCopy','suppressionAndConsent'];
export class Engine {
  constructor({config,flags,store,mail,keys,clock=()=>new Date()}) {
    this.config=structuredClone(validateConfig(config));this.flags={dryRun:true,liveSend:false,autonomy:false,integrationWrites:false,...flags};
    this.store=store;this.mail=mail;this.keys=keys;this.clock=clock;
  }
  research(prospect,pages) {
    const now=this.clock(),gaps=researchGaps(prospect,pages,this.config,now);
    return this.store.transaction(()=>{
      noteNewContact(this,prospect,now);
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
      if(prior){
        const record={message:prior,approval:this.store.get('approval',m.id),release:this.store.get('release',m.id),baseline:this.store.get('approvalBaseline',m.id),archivedAt:this.clock().toISOString()};
        const revision=hash(record);if(!this.store.get('messageRevision',revision))this.store.put('messageRevision',revision,record);
      }
      this.store.put('message',m.id,m);this.store.put('approval',m.id,null);this.store.put('release',m.id,null);this.store.put('approvalBaseline',m.id,null);
      noteVerifiedDraft(this,m,p,this.clock());
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
    const baseline=m.kind!=='followup'&&this.config.policy.requirePreApprovalRelease?this.approvalBaseline(id,at,{mustBeCurrent:true}):null;
    if(this.config.policy.requireAuthoringBrief&&checks?.portfolioReviewed!==true)throw Error('Human portfolio comparison required');
    const compared=this.config.policy.requireAuthoringBrief?this.store.list('message').filter(x=>x.state==='review'&&x.id!==m.id&&x.prospectId!==m.prospectId&&x.sections?.length).sort((a,b)=>Date.parse(a.createdAt??0)-Date.parse(b.createdAt??0)).slice(-10).map(x=>({id:x.id,subject:x.subject,body:x.body})):null;
    if(compared&&compared.length<(this.config.policy.minimumPortfolioComparisons??0))throw Error('Insufficient current drafts for portfolio comparison');
    const approval={digest,reviewer,at:at.toISOString(),allowFollowups:m.kind==='initial'&&allowFollowups,...(baseline?{baselineHash:hash(baseline)}:{}),...(compared?{portfolioReviewed:compared}:{})};
    this.store.transaction(()=>{const history=hash({id,approval});if(!this.store.get('approvalHistory',history))this.store.put('approvalHistory',history,{id,approval});this.store.put('approval',id,approval);this.store.audit('human_approved',id,at,{digest,reviewer,allowFollowups:approval.allowFollowups});});
    return approval;
  }
  approvalBaseline(id,now,{mustBeCurrent=false,production=false}={}) {
    const {m,digest}=this.context(id),baseline=this.store.get('approvalBaseline',id);
    let value;try{value=unseal(baseline,this.keys.release);}catch{throw Error('Authenticated pre-approval release required');}
    if(value.kind!=='preapproval-baseline'||value.tenant!==this.config.tenant||value.messageId!==id||value.purpose!==m.kind||value.digest!==digest||!Number.isFinite(Date.parse(value.issuedAt))||Date.parse(value.issuedAt)>now.getTime()||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)>Date.parse(value.issuedAt)+3600000||(mustBeCurrent&&Date.parse(value.expiresAt)<=now.getTime())||(production&&value.mode!=='production'))throw Error('Pre-approval release is missing stale or changed');
    return baseline;
  }
  baseGaps(id,now,production=false,{allowUnapproved=false}={}) {
    const {m,p,pages,digest}=this.context(id),gaps=[...researchGaps(p,pages,this.config,now,{production}),...writingGaps(m,p,this.config,this.store.list('message'))];
    if(m.state!=='review')gaps.push('Message is not in review');
    const compared=this.store.list('message').filter(x=>x.state==='review'&&x.id!==m.id&&x.prospectId!==m.prospectId&&x.sections?.length);
    if(compared.length<(this.config.policy.minimumPortfolioComparisons??0))gaps.push('Insufficient current drafts for portfolio comparison');
    if(m.recipient!==normalizeEmail(p.contact.email))gaps.push('Recipient/contact mismatch');
    if(this.store.suppressed(m.recipient))gaps.push('Suppressed recipient');
    const consent=this.store.get('consent',m.recipient);
    if(!consent?.allowed||!consent.basis?.trim()||!consent.reviewedBy||!Number.isFinite(Date.parse(consent.expiresAt))||Date.parse(consent.expiresAt)<=now.getTime())gaps.push('Reviewed outreach permission or legal basis missing/expired');
    const approval=this.store.get('approval',id);
    if(m.kind!=='followup'&&!allowUnapproved&&approval?.digest!==digest)gaps.push('Exact-copy human approval missing or changed');
    if(m.kind!=='followup'&&!allowUnapproved&&this.config.policy.requirePreApprovalRelease){
      try{const baseline=this.approvalBaseline(id,now,{production});if(!approval?.baselineHash||approval.baselineHash!==hash(baseline))gaps.push('Approval is not bound to the pre-approval release');}
      catch{gaps.push('Authenticated pre-approval release missing or changed');}
    }
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
        if(m.ordinal>1&&this.config.policy.followupMinGapDays){
          const prior=this.store.list('message').find(x=>x.parentId===m.parentId&&x.kind==='followup'&&x.ordinal===m.ordinal-1&&x.state==='sent');
          const previous=Date.parse(prior?.sentAt??'');
          if(!Number.isFinite(previous)||previous>now.getTime()||now.getTime()-previous<this.config.policy.followupMinGapDays[m.ordinal-1]*86400000)gaps.push('Follow-up minimum gap or verified prior send time');
        }
      } else {
        const inbound=this.store.db.prepare('SELECT * FROM inbound WHERE id=?').get(m.inboundId??'');
        if(!inbound||inbound.thread_id!==m.threadId||inbound.recipient!==m.recipient||!['reply','interest'].includes(inbound.classification))gaps.push('Response lacks verified inbound context');
        const latest=this.store.db.prepare('SELECT id FROM inbound WHERE thread_id=? AND recipient=? ORDER BY at DESC,rowid DESC LIMIT 1').get(m.threadId??'',m.recipient);
        if(latest?.id!==m.inboundId)gaps.push('Response context superseded by newer inbound');
        if(m.bookingRequested && inbound?.classification!=='interest')gaps.push('Booking needs verified interest and fresh response approval');
      }
    }
    if(m.kind==='initial'&&(m.parentId||m.threadId||m.ordinal||m.bookingRequested&&this.config.policy.booking?.strategy!=='initial-and-final'))gaps.push('Initial purpose metadata invalid');
    if(m.body.includes(this.config.integrations.bookingUrl)&&!m.bookingRequested)gaps.push('Booking link lacks explicit intent');
    if(m.bookingRequested&&m.body.includes(this.config.integrations.bookingUrl)&&this.config.policy.booking?.strategy==='initial-and-final')gaps.push(...bookingScheduleGaps(this,now,production));
    if(production&&/(example\.(com|org)|Fictional)/i.test(JSON.stringify(this.config.business)))gaps.push('Fictional identity cannot send');
    return [...new Set(gaps)];
  }
  release(id,{token,preflight,production=false,preApproval=false}) {
    authenticate(token,this.keys.admin);
    const now=this.clock(),message=this.context(id).m;
    if(preApproval&&(!this.config.policy.requirePreApprovalRelease||message.kind==='followup'||this.store.get('approval',id)))throw Error('Pre-approval release requires an unapproved initial or response and configured policy');
    const gaps=[...this.baseGaps(id,now,production,{allowUnapproved:preApproval}),...preflightGaps(preflight,this.keys.preflight,this.config,now,production)];
    if(gaps.length)throw Error(`Release refused: ${gaps.join('; ')}`);
    const {m,p,pages,digest}=this.context(id);
    const payload=releasePayload(m,p,this.config,pages,digest,now,preflight);
    payload.mode=production?'production':'simulation';if(preApproval)payload.kind='preapproval-baseline';
    // A release cannot outlive its sender proof.
    payload.expiresAt=new Date(Math.min(Date.parse(payload.expiresAt),Date.parse(unseal(preflight,this.keys.preflight).expiresAt))).toISOString();
    if(m.bookingRequested&&m.body.includes(this.config.integrations.bookingUrl)&&this.config.policy.booking?.strategy==='initial-and-final'){
      const schedule=this.store.get('installation','bookingSchedule');payload.bookingProofHash=hash(schedule);
      payload.expiresAt=new Date(Math.min(Date.parse(payload.expiresAt),Date.parse(unseal(schedule,this.keys.preflight).expiresAt))).toISOString();
    }
    const envelope=seal(payload,this.keys.release);
    this.store.transaction(()=>{
      const compared=this.store.list('message').filter(x=>x.state==='review'&&x.id!==m.id&&x.prospectId!==m.prospectId&&x.sections?.length).sort((a,b)=>Date.parse(a.createdAt??0)-Date.parse(b.createdAt??0)).slice(-10);
      const review={message:m,prospect:p,pages,compared,mode:payload.mode,evaluatedAt:now.toISOString(),digest};
      const reviewId=hash(review);if(!this.store.get('sourceReviewHistory',reviewId))this.store.put('sourceReviewHistory',reviewId,review);
      if(preApproval){this.store.put('approvalBaseline',id,envelope);this.store.put('approvalBaselineHistory',hash(envelope),{envelope,preflight,reviewId});}
      else this.store.put('release',id,{envelope,preflight,reviewId});
      this.store.audit(preApproval?'preapproval_baseline_issued':'release_issued',id,now,{digest,mode:payload.mode,expiresAt:payload.expiresAt});
    });return envelope;
  }
  deliveryGaps(id,now,production=false) {
    const {m,digest,pages}=this.context(id),gaps=this.baseGaps(id,now,production),stored=this.store.get('release',id);
    try {
      const r=unseal(stored?.envelope,this.keys.release);
      if(r.kind!=='exact-message-release'||r.tenant!==this.config.tenant||r.messageId!==id||r.digest!==digest||r.evidenceHash!==hash(pages)||r.preflightHash!==hash(stored.preflight)||r.recipient!==m.recipient||r.from!==this.config.business.sender||r.replyTo!==this.config.business.replyTo||r.purpose!==m.kind||r.parentId!==(m.parentId??null)||r.ordinal!==(m.ordinal??null)||r.threadId!==(m.threadId??null))gaps.push('Release identity purpose or exact message changed');
      if(m.bookingRequested&&m.body.includes(this.config.integrations.bookingUrl)&&this.config.policy.booking?.strategy==='initial-and-final'&&r.bookingProofHash!==hash(this.store.get('installation','bookingSchedule')))gaps.push('Booking schedule proof changed');
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
    const latestInitial=attempts.find(a=>a.kind==='initial');
    const firstTouchSpacing=this.config.policy.minimumFirstTouchSpacingMinutes??this.config.policy.minimumSpacingMinutes;
    if(m.kind==='initial'&&latestInitial&&now.getTime()-Date.parse(latestInitial.at)<firstTouchSpacing*60000)gaps.push('Minimum first-touch spacing');
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
        const acceptedAt=this.clock().toISOString();this.store.put('message',id,{...current.m,state:'sent',sentAt:acceptedAt});this.store.audit('provider_accepted',id,this.clock(),{providerId:result.id,simulation:simulate});
        const workId=m.kind==='response'?`response:${m.inboundId}`:m.kind==='followup'?`followup:${m.parentId}:${m.ordinal}`:null;
        if(workId&&this.store.get('work',workId))this.store.put('work',workId,{...this.store.get('work',workId),state:'completed'});
        if(m.kind==='initial')this.store.put('sequence',id,{stopped:false,sentAt:acceptedAt,initialDigest:current.digest,configHash:hash(this.config)});
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
      let dueAt=followupDue(parent.sentAt??attempt.at,days,this.config.policy).toISOString();
      if(index>0&&this.config.policy.followupMinGapDays){
        const prior=this.store.list('message').find(m=>m.parentId===initialId&&m.kind==='followup'&&m.ordinal===index&&m.state==='sent');
        if(Number.isFinite(Date.parse(prior?.sentAt??''))){const earliest=nextWindow(new Date(Date.parse(prior.sentAt)+this.config.policy.followupMinGapDays[index]*86400000),this.config.policy).toISOString();if(earliest>dueAt)dueAt=earliest;}
      }
      const work={id,kind:'followup',parentId:initialId,prospectId:parent.prospectId,ordinal:index+1,threadId:attempt.thread_id,rfcParentId:attempt.rfc_id,dueAt,state:sequence?.stopped?'cancelled':'needs_authoring'};
      // Reconciliation must never revive cancelled work.
      const next=existing?.state==='completed'||existing?.state==='cancelled'?existing:sequence?.stopped?work:existing?{...existing,dueAt:existing.dueAt>dueAt?existing.dueAt:dueAt}:work;
      this.store.put('work',id,next);
      if(next.messageId){const draft=this.store.get('message',next.messageId);if(draft?.state==='review'&&!this.store.db.prepare('SELECT 1 FROM attempts WHERE message_id=?').get(draft.id)&&draft.dueAt!==next.dueAt)this.store.put('message',draft.id,{...draft,dueAt:next.dueAt});}
      return this.store.get('work',id);
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
        this.store.put('approval',msg.id,null);this.store.put('release',msg.id,null);this.store.put('approvalBaseline',msg.id,null);
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
    const coldBooking=this.config.policy.booking?.strategy==='initial-and-final'&&[parent,...this.store.list('message').filter(m=>m.parentId===initialId&&m.kind==='followup'&&m.ordinal===3)].some(m=>{
      if(!m?.bookingRequested||m.state!=='sent'||!m.body.includes(this.config.integrations.bookingUrl))return false;
      const attempt=this.store.db.prepare("SELECT at FROM attempts WHERE message_id=? AND status='sent'").get(m.id);
      return attempt&&Date.parse(event.start)>=Date.parse(attempt.at);
    });
    if((!interest||!bookingResponse)&&!coldBooking||!event.id||event.status!=='confirmed'||event.organizer!==this.config.business.sender||!event.attendees?.some(a=>a.email===parent?.recipient&&a.accepted)||!Number.isFinite(Date.parse(event.start))||!Number.isFinite(Date.parse(event.end))||Date.parse(event.start)<Date.parse(initialAttempt?.at??'')||Date.parse(event.end)<=Date.parse(event.start)||!['mock-calendar','google-calendar'].includes(event.provider))throw Error('Actual accepted calendar event required');
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
