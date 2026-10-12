import { hash,email,normalizeEmail } from './config.mjs';

const fresh=(at,now,hours)=>Number.isFinite(Date.parse(at))&&Date.parse(at)<=now.getTime()&&now.getTime()-Date.parse(at)<=hours*3600000;
export function snapshot(url,text,now,mode='mock') {return {url,text,checkedAt:now.toISOString(),digest:hash(text),mode};}
export function researchGaps(prospect,pages,config,now,{production=false}={}) {
  const gaps=[],byUrl=new Map(pages.map(p=>[p.url,p]));
  function source(url) {
    const p=byUrl.get(url);
    let u;try{u=new URL(url);}catch{gaps.push('Invalid source URL');return null;}
    if(u.protocol!=='https:'||u.hostname!==prospect.domain||u.username||u.password||u.port)gaps.push('Source/company mismatch');
    if(!p||typeof p.text!=='string'||p.digest!==hash(p.text)||!fresh(p.checkedAt,now,config.discovery.maxSourceAgeHours)) {gaps.push('Missing stale or altered evidence');return null;}
    if(production&&p.mode!=='public-web')gaps.push('Synthetic evidence cannot clear production');
    return p;
  }
  if(!prospect.companyName||!prospect.domain||prospect.businessVerified!==true)gaps.push('Business verification missing');
  if(!prospect.claims?.length)gaps.push('No cited business fact');
  for(const claim of prospect.claims??[]) {
    const p=source(claim.sourceUrl);
    if(claim.type!=='fact'||!claim.text||claim.text.length<12||!p?.text.includes(claim.text))gaps.push('Unsupported factual claim');
  }
  const c=prospect.contact;
  if(!c||!email(c.email)||!c.name||!c.role)gaps.push('Named contact or exact route missing');
  else {
    const route=source(c.routeSource),person=source(c.personSource);
    // Parse whole address tokens: a substring inside an unrelated address is not evidence.
    const addresses=(route?.text.match(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)??[]).map(normalizeEmail);
    if(!addresses.includes(normalizeEmail(c.email)))gaps.push('Exact company-published recipient missing');
    if(!c.personQuote||!person?.text.includes(c.personQuote)||!c.personQuote.includes(c.name)||!c.personQuote.includes(c.role))gaps.push('Person/role evidence missing');
    if(!['shared','personal','official-business'].includes(c.routeType))gaps.push('Contact route type invalid');
  }
  if(!config.offers.some(o=>o.id===prospect.offerId))gaps.push('Configured offer missing');
  // Headcount and scores never enter the qualification decision.
  return [...new Set(gaps)];
}
export function advisoryScore(prospect,config) {
  const text=(prospect.claims??[]).map(c=>c.text).join(' ').toLowerCase();
  const offer=config.offers.find(o=>o.id===prospect.offerId);
  const relevance=offer?.tags.some(t=>text.includes(t.toLowerCase()))?100:25;
  const w=config.prioritization.weights;
  return {score:Math.round(relevance*w.relevance+50*w.recency),advisory:true,headcount:prospect.headcount??null};
}
