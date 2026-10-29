import { readFileSync,writeFileSync,renameSync,unlinkSync,openSync,closeSync,lstatSync } from 'node:fs';
import { resolve,dirname,basename,join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { hash,email,validateConfig } from './config.mjs';

const credentialNames=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN','NOTION_TOKEN','VERIFICATION_GOOGLE_CLIENT_ID','VERIFICATION_GOOGLE_CLIENT_SECRET','VERIFICATION_GOOGLE_REFRESH_TOKEN'];
const isText=v=>typeof v==='string'&&v.trim()&&!/[\r\n\u0000-\u001f]/.test(v);
function site(value,{optional=false}={}) {
  if(optional&&value==='')return '';
  let u;try{u=new URL(value);}catch{throw Error('Enter a valid HTTPS URL');}
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||isIP(u.hostname))throw Error('URLs must use public HTTPS without credentials or a custom port');
  return u.href;
}
function lines(value) {
  if(!Array.isArray(value)||value.some(v=>!isText(v)))throw Error('List entries must be non-empty text');
  return [...new Set(value.map(x=>x.trim()))];
}
function integer(value,label,min,max) {
  if(!Number.isInteger(value)||value<min||value>max)throw Error(`${label} must be between ${min} and ${max}`);return value;
}
function privateFile(path) {
  const st=lstatSync(path);if(st.isSymbolicLink()||!st.isFile())throw Error('Setup requires ordinary local configuration files');return readFileSync(path,'utf8');
}
function credentialUpdate(content,credentials) {
  if(credentials===undefined)return content;
  if(!credentials||typeof credentials!=='object'||Array.isArray(credentials)||Object.keys(credentials).some(key=>!credentialNames.includes(key)))throw Error('Unsupported credential field');
  let output=content;
  for(const [key,value]of Object.entries(credentials)) {
    if(value==='')continue;
    if(typeof value!=='string'||!value.trim()||/[\r\n\u0000-\u001f]/.test(value))throw Error('Credential values must be single-line text');
    const pattern=new RegExp(`^${key}=.*$`,'gm'),matches=output.match(pattern)??[];
    if(matches.length>1)throw Error('Duplicate credential entries require manual repair');
    const entry=`${key}=${JSON.stringify(value)}`;
    output=matches.length?output.replace(pattern,()=>entry):`${output.replace(/\s*$/,'')}\n${entry}\n`;
  }
  return output;
}

export function createInterview(application,{root=process.cwd(),configPath='config/local.json',envPath='.env'}={}) {
  const base=resolve(root),target=resolve(base,configPath),envTarget=resolve(base,envPath);
  if(target!==resolve(base,'config/local.json')||envTarget!==resolve(base,'.env'))return null;
  const engine=application.engine;
  function current() {
    const raw=privateFile(target),config=JSON.parse(raw);
    if(hash(config)!==hash(engine.config))throw Error('Configuration changed on disk; restart the app before using the interview');
    return {raw,config,version:hash(raw)};
  }
  function view() {
    const {config,version}=current(),b=config.business,p=config.policy,i=config.integrations;
    return {version,business:b,primaryOffer:config.offers[0],markets:config.markets,sectors:config.icp.sectors,sources:config.discovery.sources,allowedHosts:config.discovery.allowedHosts,
      policy:{timezone:p.timezone,weekdays:p.weekdays,windowStart:p.windowStart,windowEnd:p.windowEnd,dailyInitialCap:p.dailyInitialCap,dailyMailboxCap:p.dailyMailboxCap,minimumSpacingMinutes:p.minimumSpacingMinutes,minimumFirstTouchSpacingMinutes:p.minimumFirstTouchSpacingMinutes??p.minimumSpacingMinutes,dailyDiscoveryTarget:p.dailyDiscoveryTarget??5,followupDays:p.followupDays,followupMinGapDays:p.followupMinGapDays??p.followupDays.map(()=>0),optOut:p.optOut,includeOwnerNotificationsInMailboxCap:p.includeOwnerNotificationsInMailboxCap!==false,sharedInboxGreeting:p.sharedInboxGreeting??'named',requirePreApprovalRelease:p.requirePreApprovalRelease===true,requireAuthoringBrief:p.requireAuthoringBrief===true,minimumPortfolioComparisons:p.minimumPortfolioComparisons??0,senderProofHours:p.senderProofHours??1,booking:p.booking??null},
      integrations:{ownerEmail:i.ownerEmail,calendarId:i.calendarId,notionDataSourceId:i.notionDataSourceId,bookingUrl:i.bookingUrl,ownedInbox:config.verification?.ownedInbox??'',notionApprovalViewId:config.operations?.notionApprovalViewId??'',projectCommunicationWork:config.operations?.projectCommunicationWork===true},
      writing:p.writing,otherOffersPreserved:Math.max(0,config.offers.length-1)};
  }
  function prepare(input) {
    const snapshot=current();if(input?.version!==snapshot.version)throw Error('Setup changed since it was opened; reload the interview');
    const c=structuredClone(snapshot.config),b=input.business,p=input.policy,i=input.integrations,o=input.primaryOffer;
    if(!b||!p||!i||!o||![b.name,b.displayName,b.postalAddress,o.description].every(isText)||!email(b.sender)||!email(b.replyTo)||!email(i.ownerEmail))throw Error('Business name, contact identity, addresses and an offer are required');
    const website=site(b.website),postal=b.postalAddress.trim();
    c.business={...c.business,name:b.name.trim(),displayName:b.displayName.trim(),website,sender:b.sender.trim().toLowerCase(),replyTo:b.replyTo.trim().toLowerCase(),postalAddress:postal,signature:`${b.displayName.trim()}\n${b.name.trim()}\n${website}\n${postal}`};
    c.offers=[{...c.offers[0],description:o.description.trim(),tags:lines(o.tags)},...c.offers.slice(1)];
    c.markets=lines(input.markets);c.icp={...c.icp,sectors:lines(input.sectors),headcountAdvisory:true};
    const sources=lines(input.sources).map(url=>site(url));const hosts=lines(input.allowedHosts).map(host=>{const u=new URL(site(`https://${host}`));if(u.hostname!==host.toLowerCase()||u.pathname!=='/'||u.search)throw Error('Allowed hosts must be domain names without paths');return u.hostname;});c.discovery={...c.discovery,sources,allowedHosts:[...new Set([...hosts,...sources.map(url=>new URL(url).hostname)])]};
    if(!Array.isArray(p.weekdays)||!p.weekdays.length||p.weekdays.some(day=>!Number.isInteger(day)||day<0||day>6))throw Error('Choose at least one valid weekday');
    const followupDays=p.followupDays;if(!Array.isArray(followupDays)||followupDays.length>3)throw Error('Choose up to three follow-up intervals');
    const gaps=p.followupMinGapDays;if(!Array.isArray(gaps)||gaps.length!==followupDays.length)throw Error('Follow-up intervals and minimum gaps must align');
    for(const field of ['includeOwnerNotificationsInMailboxCap','requirePreApprovalRelease','requireAuthoringBrief'])if(typeof p[field]!=='boolean')throw Error('Choose each review and owner-capacity setting');
    if(!['named','neutral'].includes(p.sharedInboxGreeting))throw Error('Choose a shared inbox greeting');
    if(!isText(p.optOut)||!p.optOut.toLowerCase().includes('reply unsubscribe'))throw Error('Opt-out text must include reply unsubscribe');
    c.policy={...c.policy,timezone:p.timezone,weekdays:[...new Set(p.weekdays)].sort(),windowStart:p.windowStart,windowEnd:p.windowEnd,
      dailyInitialCap:integer(p.dailyInitialCap,'Initial daily cap',1,10000),dailyMailboxCap:integer(p.dailyMailboxCap,'Combined daily cap',1,10000),minimumSpacingMinutes:integer(p.minimumSpacingMinutes,'Shared spacing',1,1440),minimumFirstTouchSpacingMinutes:integer(p.minimumFirstTouchSpacingMinutes,'Initial spacing',1,1440),dailyDiscoveryTarget:integer(p.dailyDiscoveryTarget,'Discovery target',1,10000),followupDays,followupMinGapDays:gaps,
      optOut:p.optOut.trim(),includeOwnerNotificationsInMailboxCap:p.includeOwnerNotificationsInMailboxCap,sharedInboxGreeting:p.sharedInboxGreeting,requirePreApprovalRelease:p.requirePreApprovalRelease,requireAuthoringBrief:p.requireAuthoringBrief,minimumPortfolioComparisons:integer(p.minimumPortfolioComparisons,'Comparison minimum',0,10),senderProofHours:integer(p.senderProofHours,'Sender proof hours',1,24)};
    if(!input.writing||!['title','sentence'].includes(input.writing.subjectCase))throw Error('Choose a subject style');
    for(const k of ['subjectWords','subjectCharacters','firstTouchWords'])if(!Array.isArray(input.writing[k])||input.writing[k].length!==2||!input.writing[k].every(x=>Number.isInteger(x)&&x>0)||input.writing[k][0]>input.writing[k][1])throw Error('Writing ranges must have a positive minimum and maximum');
    c.policy.writing={...c.policy.writing,...input.writing};
    for(const k of ['calendarId','notionDataSourceId','notionApprovalViewId','ownedInbox'])if(typeof i[k]!=='string'||(/[\r\n\u0000-\u001f]/.test(i[k])))throw Error('Integration identifiers must be single-line text');
    if(i.ownedInbox&&!email(i.ownedInbox))throw Error('Enter a valid owned verification inbox');
    if(i.ownedInbox&&i.ownedInbox.toLowerCase()===c.business.sender)throw Error('The verification inbox must be separate from the sender');
    if(typeof i.projectCommunicationWork!=='boolean')throw Error('Choose whether to project communication work');
    c.integrations={...c.integrations,ownerEmail:i.ownerEmail.toLowerCase(),calendarId:i.calendarId.trim(),notionDataSourceId:i.notionDataSourceId.trim(),bookingUrl:site(i.bookingUrl,{optional:true})};
    c.verification={...c.verification,ownedInbox:i.ownedInbox.trim().toLowerCase()};
    c.operations={...c.operations,projectCommunicationWork:i.projectCommunicationWork};
    if(i.notionApprovalViewId.trim())c.operations.notionApprovalViewId=i.notionApprovalViewId.trim();else delete c.operations.notionApprovalViewId;
    if(p.bookingEnabled===true){
      if(!p.booking||!isText(p.booking.scheduleTitle))throw Error('The exact booking schedule title is required');
      c.policy.booking={strategy:'initial-and-final',canonicalScheduleUrl:site(p.booking.canonicalScheduleUrl),scheduleTitle:p.booking.scheduleTitle.trim(),durationMinutes:integer(p.booking.durationMinutes,'Booking duration',1,240),...(p.booking.appointmentLabel?.trim()?{appointmentLabel:p.booking.appointmentLabel.trim()}:{}),...(p.booking.requireInitialLinkSince?.trim()?{requireInitialLinkSince:p.booking.requireInitialLinkSince.trim()}:{})};
    }else if(p.bookingEnabled===false)delete c.policy.booking;else throw Error('Choose a booking strategy');
    validateConfig(c);
    const envRaw=privateFile(envTarget),newEnv=credentialUpdate(envRaw,input.credentials);
    return {c,envRaw,newEnv,version:snapshot.version,configChanged:hash(c)!==hash(snapshot.config),credentialsChanged:newEnv!==envRaw};
  }
  function preview(input) {
    const plan=prepare(input);return {version:plan.version,planHash:hash({config:plan.c,envHash:hash(plan.newEnv),version:plan.version}),configChanged:plan.configChanged,credentialsChanged:plan.credentialsChanged,
      businessName:plan.c.business.name,sender:plan.c.business.sender,ownerEmail:plan.c.integrations.ownerEmail,offer:plan.c.offers[0].description,sourceCount:plan.c.discovery.sources.length,policy:plan.c.policy,bookingConfigured:!!plan.c.policy.booking,restartRequired:plan.configChanged||plan.credentialsChanged};
  }
  function save(input,{reviewer}) {
    if(!isText(reviewer)||input?.confirmation!=='Save configuration and keep sending held')throw Error('Review and confirm the setup before saving');
    if(application.worker?.running)throw Error('A worker operation is in progress; wait for it to finish and try again');
    const plan=prepare(input),planHash=hash({config:plan.c,envHash:hash(plan.newEnv),version:plan.version});
    if(input.planHash!==planHash)throw Error('Setup changed since preview; review it again');
    if(!plan.configChanged&&!plan.credentialsChanged)return {saved:false,restartRequired:false};
    const lock=join(base,'runtime','setup-interview.lock');let fd,configTemp,envTemp;
    try{
      fd=openSync(lock,'wx',0o600);
      if(hash(privateFile(target))!==plan.version||privateFile(envTarget)!==plan.envRaw)throw Error('Configuration changed during setup; reload and retry');
      const suffix=randomUUID();configTemp=join(dirname(target),`.${basename(target)}.${suffix}.tmp`);envTemp=join(dirname(envTarget),`.${basename(envTarget)}.${suffix}.tmp`);
      writeFileSync(configTemp,JSON.stringify(plan.c,null,2)+'\n',{mode:0o600,flag:'wx'});writeFileSync(envTemp,plan.newEnv,{mode:0o600,flag:'wx'});
      engine.store.transaction(()=>engine.store.holdSending('Setup changed; restart and re-verify before any activation',engine.clock()));
      try{renameSync(envTemp,envTarget);envTemp=null;renameSync(configTemp,target);configTemp=null;}
      catch(error){try{writeFileSync(envTarget,plan.envRaw,{mode:0o600});}catch{}throw error;}
      if(hash(JSON.parse(privateFile(target)))!==hash(plan.c)||privateFile(envTarget)!==plan.newEnv)throw Error('Saved settings could not be verified; sending remains held');
      application.interviewRestartRequired=true;
      if(application.worker){application.worker.readsEnabled=false;application.worker.researchEnabled=false;application.worker.ownerEmailEnabled=false;}
      engine.flags.integrationWrites=false;
      engine.store.audit('setup_interview_saved','installation',engine.clock(),{reviewer,configChanged:plan.configChanged,credentialsChanged:plan.credentialsChanged});
      return {saved:true,restartRequired:true};
    }finally{
      for(const file of [configTemp,envTemp])if(file)try{unlinkSync(file);}catch{}
      if(fd!==undefined){closeSync(fd);try{unlinkSync(lock);}catch{}}
    }
  }
  return {view,preview,save};
}
