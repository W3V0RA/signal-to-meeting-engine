import { authenticate,hash } from './config.mjs';
import { seal,unseal } from './security.mjs';
import { decodeEntities } from './text.mjs';

function googleUrl(value,{canonical=false}={}) {
  let u;try{u=new URL(value);}catch{throw Error('Invalid Google appointment URL');}
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('Invalid Google appointment URL');
  const schedule=u.hostname==='calendar.google.com'&&/^\/(?:calendar\/(?:u\/0\/)?)?appointments\/schedules\/[A-Za-z0-9_-]+$/.test(u.pathname);
  const short=u.hostname==='calendar.app.google'&&/^\/[A-Za-z0-9_-]+$/.test(u.pathname);
  if((canonical&&!schedule)||(!canonical&&!schedule&&!short))throw Error('Only Google appointment schedules are supported');
  return u;
}

export function validateBookingPolicy(config) {
  const policy=config.policy.booking;
  if(policy===undefined)return;
  if(policy?.strategy!=='initial-and-final'||!Number.isInteger(policy.durationMinutes)||policy.durationMinutes<1||policy.durationMinutes>240||typeof policy.scheduleTitle!=='string'||!policy.scheduleTitle.trim()||policy.scheduleTitle.length>200)throw Error('Invalid booking experiment policy');
  if(policy.appointmentLabel!==undefined&&(typeof policy.appointmentLabel!=='string'||!policy.appointmentLabel.trim()||policy.appointmentLabel.length>100))throw Error('Invalid booking appointment label');
  if(policy.requireInitialLinkSince!==undefined&&!Number.isFinite(Date.parse(policy.requireInitialLinkSince)))throw Error('Invalid initial booking policy date');
  googleUrl(config.integrations.bookingUrl);googleUrl(policy.canonicalScheduleUrl,{canonical:true});
}

async function boundedText(response) {
  const maximum=6_000_000,declared=Number(response.headers?.get('content-length')??0);
  if(declared>maximum)throw Error('Booking page exceeds size limit');
  if(!response.body?.getReader){const text=await response.text();if(Buffer.byteLength(text)>maximum)throw Error('Booking page exceeds size limit');return text;}
  const reader=response.body.getReader(),chunks=[];let count=0;
  while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>maximum){await reader.cancel();throw Error('Booking page exceeds size limit');}chunks.push(Buffer.from(value));}
  return Buffer.concat(chunks).toString('utf8');
}

// Identity is read from Google; the named human separately confirms the displayed duration.
export async function verifyBookingSchedule(engine,{token,reviewer,confirmation,fetcher=globalThis.fetch,simulation=false}) {
  authenticate(token,engine.keys.admin);validateBookingPolicy(engine.config);
  const c=engine.config,p=c.policy.booking;if(!p)throw Error('Booking experiment is not configured');
  if(typeof reviewer!=='string'||!reviewer.trim()||confirmation!=='I verified the displayed appointment duration')throw Error('Named human duration review required');
  if(!simulation&&fetcher!==globalThis.fetch)throw Error('Injected test transport cannot verify production');
  const expected=googleUrl(p.canonicalScheduleUrl,{canonical:true}),initial=googleUrl(c.integrations.bookingUrl);
  let current=initial,html=null;
  for(let i=0;i<4;i++){
    const response=await fetcher(current.href,{redirect:'manual',signal:AbortSignal.timeout(12000)});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers?.get('location');if(!location)throw Error('Booking redirect missing');
      const next=googleUrl(new URL(location,current).href,{canonical:true});
      if(next.origin!==expected.origin||next.pathname!==expected.pathname)throw Error('Booking schedule identity mismatch');
      current=next;continue;
    }
    if(!response.ok||current.origin!==expected.origin||current.pathname!==expected.pathname)throw Error('Booking schedule could not be verified');
    html=await boundedText(response);break;
  }
  const title=decodeEntities(html?.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]??'').trim();
  if(title!==p.scheduleTitle.trim())throw Error('Booking schedule title mismatch');
  const now=engine.clock(),proof={kind:'booking-schedule',mode:simulation?'simulation':'production',tenant:engine.config.tenant,configHash:hash(engine.config),bookingUrl:c.integrations.bookingUrl,canonicalScheduleUrl:p.canonicalScheduleUrl,scheduleTitle:title,durationMinutes:p.durationMinutes,durationReviewedBy:reviewer.trim(),sourceHash:hash(html),checkedAt:now.toISOString(),expiresAt:new Date(now.getTime()+3600000).toISOString()};
  const envelope=seal(proof,engine.keys.preflight);
  engine.store.transaction(()=>{engine.store.put('bookingScheduleHistory',hash(envelope),envelope);engine.store.put('installation','bookingSchedule',envelope);engine.store.audit('booking_schedule_verified','installation',now,{mode:proof.mode,reviewer:proof.durationReviewedBy,sourceHash:proof.sourceHash});});
  return proof;
}

export function bookingScheduleGaps(engine,now,production) {
  try{
    const p=unseal(engine.store.get('installation','bookingSchedule'),engine.keys.preflight),c=engine.config,policy=c.policy.booking;
    const checked=Date.parse(p.checkedAt),expires=Date.parse(p.expiresAt);
    if(p.kind!=='booking-schedule'||p.tenant!==c.tenant||p.configHash!==hash(c)||p.bookingUrl!==c.integrations.bookingUrl||p.canonicalScheduleUrl!==policy?.canonicalScheduleUrl||p.scheduleTitle!==policy?.scheduleTitle?.trim()||p.durationMinutes!==policy?.durationMinutes||!p.durationReviewedBy||!/^[a-f0-9]{64}$/.test(p.sourceHash??'')||!Number.isFinite(checked)||checked>now.getTime()||!Number.isFinite(expires)||expires<=now.getTime()||expires>checked+3600000||(production&&p.mode!=='production'))throw Error('invalid');
    return [];
  }catch{return ['Current verified booking schedule and duration review required'];}
}
