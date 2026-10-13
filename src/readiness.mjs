import { authenticate,hash,email } from './config.mjs';
import { seal,unseal,preflightGaps } from './security.mjs';

function validActivation(engine,now) {
  try {
    const a=unseal(engine.store.get('installation','activation'),engine.keys.preflight),issued=Date.parse(a.issuedAt),expires=Date.parse(a.expiresAt);
    return a.kind==='installation-activation'&&a.configHash===hash(engine.config)&&a.tenant===engine.config.tenant&&typeof a.reviewer==='string'&&a.reviewer.trim()&&Number.isFinite(issued)&&issued<=now.getTime()&&Number.isFinite(expires)&&expires>now.getTime()&&expires<=issued+3600000;
  }catch{return false;}
}

export function readiness(engine,now=engine.clock()) {
  const gaps=[];
  if(/example\.(com|org)|Fictional/i.test(JSON.stringify(engine.config.business)))gaps.push('Replace fictional business identity');
  for(const name of ['admin','release','inbound','preflight'])if(typeof engine.keys[name]!=='string'||engine.keys[name].length<32)gaps.push(`Configure separate ${name} credential`);
  if(new Set(Object.values(engine.keys).filter(Boolean)).size!==4)gaps.push('Operator credentials must be distinct');
  if(!email(engine.config.integrations.ownerEmail))gaps.push('Configure owner notification route');
  const proof=engine.store.get('installation','preflight');
  const senderGaps=preflightGaps(proof?.envelope,engine.keys.preflight,engine.config,now,true);
  if(senderGaps.length)gaps.push(senderGaps.some(g=>/expired/.test(g))?'Refresh expired sender and owned-inbox verification':'Collect genuine sender, delivery, reply and unsubscribe verification');
  let checks=null;try{checks=unseal(engine.store.get('installation','integrationChecks'),engine.keys.preflight);}catch{}
  const checkedAt=Date.parse(checks?.checkedAt),expiresAt=Date.parse(checks?.expiresAt);
  if(checks?.kind!=='integration-checks'||checks?.mode!=='production'||checks?.tenant!==engine.config.tenant||checks?.configHash!==hash(engine.config)||!Number.isFinite(checkedAt)||checkedAt>now.getTime()||expiresAt<=now.getTime()||!Number.isFinite(expiresAt)||expiresAt>checkedAt+3600000)gaps.push('Fresh business verification of connected accounts and sources required');
  else {
    const names={gmailIdentity:'sending and reply account identity',sourceCapture:'official source access',workerHealth:'healthy reply monitoring'};
    for(const name of Object.keys(names))if(checks[name]!==true)gaps.push(`Verify ${names[name]}`);
    if(engine.config.integrations.calendarId&&checks.calendarRead!==true)gaps.push('Verify Calendar read access');
    if(engine.config.integrations.notionDataSourceId&&checks.notionRead!==true)gaps.push('Verify Notion mapping and read access');
  }
  const hold=engine.store.get('installation','sendHold');
  return {implementationReady:true,verificationComplete:gaps.length===0,sendingHeld:hold?.held!==false,
    sendingEnabled:!engine.flags.dryRun&&engine.flags.liveSend&&engine.flags.autonomy&&hold?.held===false&&gaps.length===0&&!!validActivation(engine,now),gaps:[...new Set(gaps)],note:'Verification does not grant message approval or activate sending.'};
}

export function activationGaps(engine,now=engine.clock()) {
  const hold=engine.store.get('installation','sendHold');
  if(!hold||hold.held!==false)return ['Installation send hold is active'];
  if(!validActivation(engine,now))return ['Installation activation missing changed expired or unauthenticated'];
  return readiness(engine,now).gaps;
}

// Future trusted business operator action. No CLI/UI path invokes this during installation.
export function authorizeActivation(engine,{token,reviewer,confirmation}) {
  authenticate(token,engine.keys.admin);
  const now=engine.clock(),report=readiness(engine,now);
  if(!report.verificationComplete||!reviewer?.trim()||confirmation!=='Authorize verified business sending')throw Error('Activation requires complete real verification and explicit human authorization');
  const expiresAt=new Date(now.getTime()+3600000).toISOString();
  engine.store.transaction(()=>{
    engine.store.put('installation','activation',seal({kind:'installation-activation',tenant:engine.config.tenant,configHash:hash(engine.config),reviewer,issuedAt:now.toISOString(),expiresAt},engine.keys.preflight));
    engine.store.put('installation','sendHold',{held:false,reason:'Explicit verified operator activation',at:now.toISOString()});
    engine.store.audit('installation_activation','installation',now,{reviewer,expiresAt});
  });
}
