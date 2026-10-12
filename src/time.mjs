const formatters=new Map();
export function localParts(now,policy) {
  if(!Number.isFinite(now.getTime())) throw Error('Invalid clock');
  if(!formatters.has(policy.timezone))formatters.set(policy.timezone,new Intl.DateTimeFormat('en-US',{timeZone:policy.timezone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
  const parts=formatters.get(policy.timezone).formatToParts(now);
  const get=k=>parts.find(p=>p.type===k).value;
  return {day:`${get('year')}-${get('month')}-${get('day')}`,weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday')),time:`${get('hour')}:${get('minute')}`};
}
export function inWindow(now,policy) { const p=localParts(now,policy);return policy.weekdays.includes(p.weekday)&&p.time>=policy.windowStart&&p.time<policy.windowEnd; }
export function nextWindow(at,policy) {
  const t=new Date(Math.ceil(at.getTime()/60000)*60000);
  for(let n=0;n<15*24*60;n++,t.setUTCMinutes(t.getUTCMinutes()+1)) if(inWindow(t,policy)) return new Date(t);
  throw Error('No eligible window within fifteen days');
}
export function followupDue(sentAt,days,policy) {
  const local=localParts(new Date(sentAt),policy);
  const target=new Date(`${local.day}T12:00:00Z`);target.setUTCDate(target.getUTCDate()+days);
  const targetDay=target.toISOString().slice(0,10);
  const start=new Date(target); start.setUTCHours(0,0,0,0);start.setUTCDate(start.getUTCDate()-1);
  for(let n=0;n<3*24*60;n++,start.setUTCMinutes(start.getUTCMinutes()+1)) {
    const p=localParts(start,policy);
    if(p.day>=targetDay&&inWindow(start,policy))return new Date(start);
  }
  return nextWindow(start,policy);
}
