import { hash } from './config.mjs';
export function bodyFor(message,prospect,config) {
  const name=prospect.contact?.name?.trim().split(/\s+/)[0];
  const greeting=prospect.contact?.routeType==='shared'&&config.policy.sharedInboxGreeting==='neutral'?'Hi there,':name?`Hi ${name},`:'Hello,';
  const main=message.sections.map(s=>s.text).join('\n\n');
  const link=message.bookingRequested&&message.kind!=='response'&&config.policy.booking?.strategy==='initial-and-final'?`\n\n${config.integrations.bookingUrl}`:'';
  return `${greeting}\n\n${main}${link}\n\n${config.business.signature}\n\n${config.policy.optOut}`;
}
export function writingGaps(m,p,c,previous=[]) {
  const gaps=[],rule=c.policy.writing,main=m.sections?.map(s=>s.text).join('\n\n')??'';
  if(typeof m.subject!=='string'||/[\r\n]/.test(m.subject)||!m.sections?.length) return ['Message structure invalid'];
  if(m.body!==bodyFor(m,p,c))gaps.push('Body differs from reviewed claim structure or signature');
  if(c.policy.requireAuthoringBrief&&(!Array.isArray(m.brief)||m.brief.length!==3||m.brief.some(s=>typeof s!=='string'||!s.trim())||typeof m.framework!=='string'||!m.framework.trim()))gaps.push('Three-part source brief and framework required');
  if(/<[^>]*>|utm_|tracking pixel/i.test(m.body))gaps.push('Plain text only');
  if(m.kind==='initial') {
    const words=m.subject.trim().split(/\s+/);
    const wrongCase=rule.subjectCase==='sentence'?words[0]?.[0]!==words[0]?.[0]?.toUpperCase():words.some(w=>w[0]!==w[0].toUpperCase());
    if(words.length<rule.subjectWords[0]||words.length>rule.subjectWords[1]||m.subject.length<rule.subjectCharacters[0]||m.subject.length>rule.subjectCharacters[1]||/[^A-Za-z ]/.test(m.subject)||wrongCase||words.includes(p.contact?.name?.split(' ')[0]))gaps.push('Subject format');
    const count=main.trim().split(/\s+/).length;
    if(count<rule.firstTouchWords[0]||count>rule.firstTouchWords[1])gaps.push('First-touch word count');
    if(!/\b(could|might|may)\b/i.test(m.sections[0].text))gaps.push('Opening needs an honest possible outcome');
  }
  const questions=(main.match(/\?/g)??[]).length;
  if(m.kind==='response' ? questions>1 : questions!==1||!m.sections.at(-1)?.text.endsWith('?'))gaps.push('One soft closing question required');
  if(/^(re:|fwd:)|quick question/i.test(m.subject))gaps.push('Deceptive or generic subject');
  const claims=new Map(p.claims.map(x=>[x.id,x]));
  if(m.kind!=='response'&&!m.sections.some(s=>s.type==='fact'))gaps.push('Cited company fact required');
  for(const s of m.sections) {
    if(s.type==='fact') {if(claims.get(s.claimId)?.text!==s.text)gaps.push('Message claim lacks exact source support');}
    else if(s.type==='possibility') {
      if(!/\b(could|might|may|would)\b/i.test(s.text))gaps.push('Hypothesis must be framed as possibility');
    } else if(s.type==='question') {if(!s.text.endsWith('?'))gaps.push('Discovery question invalid');}
    else if(s.type==='offer') {if(s.text!==c.offers.find(o=>o.id===p.offerId)?.description)gaps.push('Offer wording not configured');}
    else gaps.push('Unreviewed sentence type');
    // Do not let a good citation whitewash a different unsupported assertion.
    if(s.type!=='fact'&&/you (?:use|rely on|struggle|are losing)|your (?:manual|broken|slow|outdated)|we (?:saved|increased)|guarantee|\d+%|already built/i.test(s.text))gaps.push('Unsupported pain or performance assertion');
  }
  const permittedLinks=[c.business.website];
  if(m.bookingRequested&&(m.kind==='response'||c.policy.booking?.strategy==='initial-and-final'&&(m.kind==='initial'||m.kind==='followup'&&m.ordinal===3)))permittedLinks.push(c.integrations.bookingUrl);
  const links=m.body.match(/https?:\/\/[^\s]+/g)??[];
  if(links.some(url=>!permittedLinks.includes(url)))gaps.push('Unapproved link');
  if(m.kind!=='response'&&m.body.includes(c.integrations.bookingUrl)&&!(m.bookingRequested&&c.policy.booking?.strategy==='initial-and-final'&&(m.kind==='initial'||m.kind==='followup'&&m.ordinal===3)))gaps.push('Booking is interest-gated or not permitted on this touch');
  if(m.bookingRequested&&m.kind!=='response'&&c.policy.booking?.strategy==='initial-and-final'){
    const question=m.sections.at(-1)?.text??'';
    if(!new RegExp(`\\b${c.policy.booking.durationMinutes}[- ]minute\\b`,'i').test(question))gaps.push('Booking question must state the reviewed appointment duration');
    if(c.policy.booking.appointmentLabel&&!question.toLowerCase().includes(c.policy.booking.appointmentLabel.trim().toLowerCase()))gaps.push('Booking question must name the configured appointment');
  }
  if(m.kind==='initial'&&c.policy.booking?.requireInitialLinkSince&&Date.parse(m.createdAt)>=Date.parse(c.policy.booking.requireInitialLinkSince)&&!m.bookingRequested)gaps.push('New initial needs the configured booking link');
  const opening=m.sections[0].text.toLowerCase().split(/\s+/).slice(0,7).join(' ');
  for(const old of previous.filter(x=>x.state==='review'&&x.id!==m.id&&x.prospectId!==m.prospectId&&x.sections?.length).sort((a,b)=>Date.parse(a.createdAt??0)-Date.parse(b.createdAt??0)).slice(-10)) {
    if(old.subject===m.subject || old.sections[0].text.toLowerCase().split(/\s+/).slice(0,7).join(' ')===opening || old.sections.at(-1).text===m.sections.at(-1).text)gaps.push('Portfolio repetition needs revision');
  }
  return [...new Set(gaps)];
}
export function messageDigest(m,p,config,pages) {
  return hash({tenant:config.tenant,id:m.id,kind:m.kind,parentId:m.parentId??null,ordinal:m.ordinal??null,threadId:m.threadId??null,...(config.policy.requirePreApprovalRelease?{inboundId:m.inboundId??null}:{}),
    rfcParentId:m.rfcParentId??null,recipient:m.recipient,subject:m.subject,body:m.body,sections:m.sections,
    from:config.business.sender,replyTo:config.business.replyTo,displayName:config.business.displayName,
    prospect:p,config,pages:pages.map(s=>({url:s.url,digest:s.digest,checkedAt:s.checkedAt,mode:s.mode})),bookingRequested:!!m.bookingRequested,...(config.policy.requireAuthoringBrief?{brief:m.brief??null,framework:m.framework??null}:{})});
}
