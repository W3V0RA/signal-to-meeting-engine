import { readFileSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';

export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const email = value => typeof value === 'string' && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value) && !/[\r\n]/.test(value);
export const normalizeEmail = value => value.trim().toLowerCase();
export function authenticate(actual, expected) {
  if (typeof expected !== 'string' || expected.length < 32 || typeof actual !== 'string') throw Error('Authentication unavailable or invalid');
  const a=Buffer.from(actual), b=Buffer.from(expected);
  if(a.length!==b.length || !timingSafeEqual(a,b)) throw Error('Authentication failed');
}
export function validateConfig(c) {
  if(!c.tenant || !c.business || !email(c.business.sender) || !email(c.business.replyTo) || /[\r\n]/.test(c.business.displayName)) throw Error('Invalid business identity');
  if(!c.business.postalAddress || !c.business.signature.includes(c.business.postalAddress) || !c.business.signature.includes(c.business.website)) throw Error('Signature needs website and postal address');
  if(c.icp?.headcountAdvisory!==true || c.prioritization?.advisoryOnly!==true) throw Error('Headcount and scores must remain advisory');
  new Intl.DateTimeFormat('en-US',{timeZone:c.policy.timezone});
  const p=c.policy;
  for(const k of ['dailyInitialCap','dailyMailboxCap','minimumSpacingMinutes','releaseMinutes','inboundFreshMinutes']) if(!Number.isInteger(p[k]) || p[k]<1) throw Error(`Invalid policy ${k}`);
  if(p.releaseMinutes>60 || !p.weekdays.length || p.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)) throw Error('Invalid release or weekday policy');
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(p.windowStart)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(p.windowEnd)||p.windowStart>=p.windowEnd) throw Error('Invalid pacing window');
  if(!Number.isFinite(c.discovery.maxSourceAgeHours)||c.discovery.maxSourceAgeHours<=0||!Array.isArray(c.discovery.allowedHosts))throw Error('Invalid discovery policy');
  const weights=c.prioritization.weights;
  if(!weights||Object.values(weights).some(v=>!Number.isFinite(v)||v<0)||Math.abs(weights.relevance+weights.recency-1)>0.001)throw Error('Invalid advisory weights');
  if(!Array.isArray(p.followupDays)||p.followupDays.length>3||p.followupDays.some((d,i)=>!Number.isInteger(d)||d<1||(i&&d<=p.followupDays[i-1]))) throw Error('Invalid cadence');
  if(!p.optOut.toLowerCase().includes('reply unsubscribe') || !c.offers.length) throw Error('Offers and reply opt-out required');
  return c;
}
export function loadConfig(path='config/example.json',env=process.env) {
  return { config:validateConfig(JSON.parse(readFileSync(path,'utf8'))), flags:{
    dryRun:env.DRY_RUN!=='false',liveSend:env.LIVE_SEND_ENABLED==='true',
    autonomy:env.CONTROLLED_AUTONOMY_ENABLED==='true',integrationWrites:env.INTEGRATION_WRITES_ENABLED==='true'
  }};
}
