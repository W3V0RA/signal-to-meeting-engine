import { hash } from './config.mjs';
import { localParts } from './time.mjs';
import { researchGaps } from './evidence.mjs';
import { writingGaps } from './writing.mjs';

function identity(p) {
  if(typeof p?.domain!=='string'||typeof p.contact?.name!=='string'||!p.domain.trim()||!p.contact.name.trim())return null;
  return hash({domain:p.domain.trim().toLowerCase(),name:p.contact.name.trim().replace(/\s+/g,' ').toLowerCase()});
}

// Only first observations after this feature is installed can be counted as new.
export function noteNewContact(engine,prospect,now) {
  if(!engine.config.policy.dailyDiscoveryTarget||engine.store.get('prospect',prospect.id))return;
  const key=identity(prospect);if(!key||engine.store.get('discoveryContact',key))return;
  if(engine.store.list('prospect').some(existing=>identity(existing)===key))return;
  engine.store.put('discoveryContact',key,{prospectId:prospect.id,firstSeenAt:now.toISOString(),day:localParts(now,engine.config.policy).day});
}

// A draft counts once only after real company-page captures support its exact copy.
export function noteVerifiedDraft(engine,message,prospect,now) {
  if(!engine.config.policy.dailyDiscoveryTarget||message.kind!=='initial'||!engine.config.policy.weekdays.includes(localParts(now,engine.config.policy).weekday))return;
  const key=identity(prospect),seen=key&&engine.store.get('discoveryContact',key),day=localParts(now,engine.config.policy).day;
  if(!seen||seen.prospectId!==prospect.id||seen.day!==day||engine.store.get('discoveryCompleted',key))return;
  const pages=engine.store.get('pages',prospect.id)??[];
  if(researchGaps(prospect,pages,engine.config,now,{production:true}).length||writingGaps(message,prospect,engine.config,engine.store.list('message')).length||engine.store.suppressed(message.recipient))return;
  const compared=engine.store.list('message').filter(x=>x.state==='review'&&x.id!==message.id&&x.prospectId!==message.prospectId&&x.sections?.length);
  if(compared.length<(engine.config.policy.minimumPortfolioComparisons??0))return;
  if(engine.store.list('discoveryCompleted').some(item=>item.recipient===message.recipient))return;
  if(engine.store.db.prepare("SELECT 1 FROM attempts WHERE recipient=? AND kind='initial'").get(message.recipient))return;
  engine.store.put('discoveryCompleted',key,{prospectId:prospect.id,messageId:message.id,recipient:message.recipient,day,at:now.toISOString()});
}

export function dailyDiscoveryProgress(engine,now=engine.clock()) {
  const target=engine.config.policy.dailyDiscoveryTarget;if(!target)return null;
  const local=localParts(now,engine.config.policy),activeDay=engine.config.policy.weekdays.includes(local.weekday);
  const completed=activeDay?engine.store.list('discoveryCompleted').filter(item=>item.day===local.day).length:0;
  return {day:local.day,target,verifiedNewDrafts:completed,shortfall:activeDay?Math.max(0,target-completed):0,activeDay,automatedDiscovery:false};
}
