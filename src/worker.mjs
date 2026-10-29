import { randomUUID } from 'node:crypto';
import { hash } from './config.mjs';
import { localParts,nextWindow } from './time.mjs';
import { approvalDigest,ownerAlerts,deliverOwnerNotification } from './notifications.mjs';
import { watchSources } from './discovery.mjs';
import { syncNotion } from './reporting.mjs';

const intervals={mailbox_sync:5,lifecycle:5,source_watch:60,projection:15,bookings:15,delivery:5,owner_alerts:5};
export class Worker {
  constructor(engine,{mail=engine.mail,research=null,notion=null,calendar=null,readsEnabled=false,researchEnabled=false,ownerEmailEnabled=false}={}) {
    this.engine=engine;this.providers={mail,research,notion,calendar};this.readsEnabled=readsEnabled;this.researchEnabled=researchEnabled;this.ownerEmailEnabled=ownerEmailEnabled;this.owner=randomUUID();this.running=false;
  }
  schedule() {
    const now=this.engine.clock();
    for(const [kind,minutes]of Object.entries(intervals))this.engine.store.enqueue(`${kind}:${Math.floor(now.getTime()/(minutes*60000))}`,kind,{},now);
    const p=localParts(now,this.engine.config.policy),time=this.engine.config.operations?.digestTime??'08:00';
    if(this.engine.config.policy.weekdays.includes(p.weekday)&&p.time>=time)this.engine.store.enqueue(`digest:${p.day}`,'digest',{day:p.day},now);
  }
  claim() {
    const store=this.engine.store,now=this.engine.clock();
    return store.transaction(()=>{
      const job=store.db.prepare("SELECT * FROM jobs WHERE due_at<=? AND (state IN ('pending','retry') OR (state='running' AND lease_until<?)) ORDER BY due_at,id LIMIT 1").get(now.toISOString(),now.toISOString());
      if(!job)return null;
      const lease=new Date(now.getTime()+300000).toISOString();
      store.db.prepare("UPDATE jobs SET state='running',owner=?,lease_until=?,attempts=attempts+1 WHERE id=?").run(this.owner,lease,job.id);
      return {...job,payload:JSON.parse(job.payload)};
    });
  }
  heartbeat(id){const now=this.engine.clock();this.engine.store.db.prepare("UPDATE jobs SET lease_until=? WHERE id=? AND owner=? AND state='running'").run(new Date(now.getTime()+300000).toISOString(),id,this.owner);}
  async mailboxSync() {
    const engine=this.engine,mail=this.providers.mail;
    if(!this.readsEnabled)return {held:'Integration reads disabled'};
    const attempts=engine.store.db.prepare("SELECT * FROM attempts WHERE status='sent'").all();
    const cursor=engine.store.get('installation','inboundCursor');
    const since=cursor?.at??new Date(engine.clock().getTime()-86400000).toISOString();
    const result=mail.scan?await mail.scan({attempts,since,aliases:engine.config.integrations.routeAliases??{}}):{events:[],warnings:[]};
    if(result.warnings.length)throw Error('Unmatched mailbox events require operator review');
    for(const event of result.events) {
      const parent=attempts.find(a=>a.kind==='initial'&&a.thread_id===event.threadId&&a.recipient===event.recipient);
      if(!parent)throw Error('Mailbox event cannot be associated safely');
      engine.ingest(event,engine.keys.inbound);
    }
    const at=engine.clock().toISOString();
    engine.store.put('installation','inboundCursor',{at:new Date(Date.parse(at)-300000).toISOString()});
    engine.store.put('installation','workerHealth',{ok:true,at,configHash:hash(engine.config),mode:mail.mode==='gmail'?'production':'simulation'});
    return {ingested:result.events.length};
  }
  async runJob(job) {
    const e=this.engine;
    if(job.kind==='mailbox_sync')return this.mailboxSync();
    if(job.kind==='source_watch')return this.researchEnabled&&this.providers.research?watchSources(e,this.providers.research):{held:'Research network disabled'};
    if(job.kind==='lifecycle'){for(const m of e.store.list('message').filter(m=>m.kind==='initial'&&m.state==='sent'))e.planFollowups(m.id);return {planned:true};}
    if(job.kind==='projection')return this.providers.notion?syncNotion(e,this.providers.notion):{held:'Notion not configured'};
    if(job.kind==='digest'){
      const viewId=e.config.operations?.notionApprovalViewId;
      if(viewId&&(!this.readsEnabled||!this.providers.notion?.savedView))throw Error('Configured saved view requires Notion read access');
      const notionView=viewId?await this.providers.notion.savedView(viewId,e.clock()):null;
      const n=approvalDigest(e,job.payload.day,{notionView});return deliverOwnerNotification(e,n.id,{enabled:this.ownerEmailEnabled});
    }
    if(job.kind==='owner_alerts') {
      const prepared=ownerAlerts(e),notifications=e.store.db.prepare("SELECT id FROM notifications WHERE kind IN ('alert','booking') AND state='pending'").all();
      for(const n of notifications)await deliverOwnerNotification(e,n.id,{enabled:this.ownerEmailEnabled});return {prepared};
    }
    if(job.kind==='bookings') {
      if(!this.readsEnabled||!this.providers.calendar)return {held:'Calendar reads disabled'};
      let checked=0;for(const association of e.store.list('calendarAssociation')){const event=await this.providers.calendar.event(association.eventId);e.verifyBooking(association.initialId,event,e.keys.inbound);checked++;}return {checked};
    }
    if(job.kind==='delivery') {
      if(e.flags.dryRun||!e.flags.liveSend||!e.flags.autonomy)return {held:'Sending disabled'};
      const now=e.clock(),messages=e.store.list('message').filter(m=>m.state==='review'&&e.store.get('release',m.id)&&(!m.dueAt||Date.parse(m.dueAt)<=now.getTime()));
      let accepted=0;for(const message of messages) {
        try{const result=await e.deliver(message.id);if(result.status==='provider_accepted')accepted++;}
        catch(error){e.store.put('deliveryHold',message.id,{at:now.toISOString(),reason:error.message,nextWindow:nextWindow(new Date(now.getTime()+60000),e.config.policy).toISOString()});}
      }return {accepted};
    }
    throw Error('Unknown job type');
  }
  async tick({maxJobs=30}={}) {
    if(this.running)return {busy:true};this.running=true;
    try {
      this.schedule();let completed=0,failed=0;
      for(let index=0;index<maxJobs;index++) {
        const job=this.claim();if(!job)break;
        const pulse=setInterval(()=>this.heartbeat(job.id),60000);pulse.unref();
        try {
          const result=await this.runJob(job);
          this.engine.store.db.prepare("UPDATE jobs SET state='completed',completed_at=?,lease_until=NULL,last_error=NULL WHERE id=? AND owner=?").run(this.engine.clock().toISOString(),job.id,this.owner);
          this.engine.store.audit('job_completed',job.id,this.engine.clock(),result);completed++;
        } catch(error) {
          const attempts=job.attempts+1,delay=Math.min(60,2**Math.min(attempts,6));
          this.engine.store.db.prepare("UPDATE jobs SET state=?,due_at=?,lease_until=NULL,last_error=? WHERE id=? AND owner=?").run(attempts>=5?'held':'retry',new Date(this.engine.clock().getTime()+delay*60000).toISOString(),'Job failed; inspect local audit and integration configuration',job.id,this.owner);
          this.engine.store.audit('job_failed',job.id,this.engine.clock(),{kind:job.kind,reason:error.message.slice(0,500)});failed++;
          if(job.kind==='mailbox_sync')this.engine.store.holdSending('Inbound scan failure; verify before any activation',this.engine.clock());
        } finally{clearInterval(pulse);}
      }
      return {completed,failed};
    } finally{this.running=false;}
  }
}
