import { hash } from './config.mjs';
export function dashboard(store) {
  const attempts=store.db.prepare('SELECT * FROM attempts').all(),inbound=store.db.prepare('SELECT * FROM inbound').all(),outcomes=store.db.prepare('SELECT * FROM outcomes').all();
  const sent=attempts.filter(a=>a.status==='sent').length;
  return {prospects:store.list('prospect').length,drafts:store.list('message').filter(m=>m.state==='review').length,
    acceptedByProvider:sent,uncertain:attempts.filter(a=>a.status==='uncertain').length,
    replies:inbound.filter(i=>['reply','interest'].includes(i.classification)).length,
    interests:inbound.filter(i=>i.classification==='interest').length,
    bookings:outcomes.filter(o=>o.kind==='booking'&&JSON.parse(o.detail).status==='confirmed').length,
    cost:store.db.prepare('SELECT COALESCE(SUM(amount),0) AS value FROM costs').get().value,
    deliveryVerified:false,revenueVerified:false};
}
export function learning(store) {
  const report=dashboard(store);
  const initials=store.db.prepare("SELECT * FROM attempts WHERE kind='initial' AND status='sent'").all();
  const positive=initials.filter(a=>store.db.prepare("SELECT 1 FROM inbound WHERE thread_id=? AND recipient=? AND classification='interest'").get(a.thread_id,a.recipient)).length;
  const booked=initials.filter(a=>store.db.prepare("SELECT detail FROM outcomes WHERE record_id=? AND kind='booking'").all(a.message_id).some(o=>JSON.parse(o.detail).status==='confirmed')).length;
  return {sampleSize:initials.length,positiveReplyRate:initials.length?positive/initials.length:0,
    meetingRate:initials.length?booked/initials.length:0,
    recommendation:'Review observed outcomes and evidence quality with a human before changing policy.',rulesChanged:false,
    caveat:'Provider acceptance, simulations and draft quality do not prove delivery or commercial results.'};
}
export async function syncNotion(engine,provider) {
  if(provider.mode!=='mock'&&(!engine.flags.integrationWrites||engine.flags.dryRun))return {status:'dry_run',written:0};
  let written=0;
  for(const p of engine.store.list('prospect')) {
    const messages=engine.store.list('message').filter(m=>m.prospectId===p.id).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
    const inbound=engine.store.db.prepare('SELECT * FROM inbound WHERE recipient=? ORDER BY at DESC,rowid DESC LIMIT 1').get(p.contact.email.toLowerCase());
    const work=engine.store.list('work').filter(w=>w.prospectId===p.id&&w.state==='needs_authoring');
    const data={company:p.companyName,state:inbound?.classification??messages.at(-1)?.state??'research',nextAction:inbound&&['unsubscribe','bounce'].includes(inbound.classification)?'Suppressed; preserve cancellation and do not contact':work.some(w=>w.kind==='response')?'Read the actual inbound and author a separately approved response':messages.at(-1)?.kind==='response'&&messages.at(-1)?.state==='sent'?'Response accepted by provider; verify actual meeting outcome':'Review source evidence, exact copy and unresolved safety gaps'};
    const digest=hash(data),prior=engine.store.db.prepare('SELECT * FROM projections WHERE id=?').get(p.id);
    if(prior?.hash===digest)continue;
    const result=await provider.upsert(p.id,data,prior?.provider_id);
    engine.store.db.prepare('INSERT INTO projections VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET provider_id=excluded.provider_id,hash=excluded.hash').run(p.id,result.id,digest);
    engine.store.audit('notion_projection',p.id,engine.clock(),{mode:provider.mode});written++;
  }
  if(engine.config.operations?.projectCommunicationWork){
    for(const work of engine.store.list('work').filter(w=>['followup','response'].includes(w.kind))){
      const p=engine.store.get('prospect',work.prospectId);if(!p)throw Error('Communication projection prospect missing');
      const id=`communication:${hash(work.id)}`,message=work.messageId?engine.store.get('message',work.messageId):null;
      const stopped=work.state==='cancelled'||message?.state==='cancelled';
      const data={company:`${p.companyName} — ${work.kind}${work.ordinal?` ${work.ordinal}`:''}`,state:stopped?'cancelled':message?.state??work.state,
        nextAction:stopped?'Do not contact; preserve cancellation':work.kind==='response'?'Read actual inbound and review the separately approved response in the local console':'Review the personalized follow-up in the local console; initial authorization and all send checks still apply'};
      const digest=hash(data),prior=engine.store.db.prepare('SELECT * FROM projections WHERE id=?').get(id);
      if(prior?.hash===digest)continue;
      const result=await provider.upsert(id,data,prior?.provider_id);
      engine.store.db.prepare('INSERT INTO projections VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET provider_id=excluded.provider_id,hash=excluded.hash').run(id,result.id,digest);
      engine.store.audit('notion_communication_projected',work.id,engine.clock(),{mode:provider.mode});written++;
    }
  }
  return {status:provider.mode==='mock'?'simulated':'synced',written};
}
