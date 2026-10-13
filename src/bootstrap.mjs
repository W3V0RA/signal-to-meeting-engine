import { loadConfig } from './config.mjs';
import { Store } from './store.mjs';
import { Engine } from './engine.mjs';
import { MockMail } from './providers/mock.mjs';
import { Gmail } from './providers/gmail.mjs';
import { readFileSync,existsSync } from 'node:fs';
import { PublicWeb } from './providers/public-web.mjs';
import { GoogleCalendar } from './providers/calendar.mjs';
import { Notion } from './providers/notion.mjs';
import { Worker } from './worker.mjs';
export function openEngine(env=process.env) {
  const {config,flags}=loadConfig(env.ENGINE_CONFIG??'config/example.json',env);
  const mail=flags.dryRun?new MockMail(config.business):new Gmail({business:config.business,credentials:{clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,refreshToken:env.GOOGLE_REFRESH_TOKEN}});
  const store=new Store(env.ENGINE_DATABASE??'runtime/engine.sqlite',config.tenant);
  const keyPath=env.ENGINE_KEYS??'runtime/keys.json',saved=existsSync(keyPath)?JSON.parse(readFileSync(keyPath,'utf8')):{};
  const keys={admin:env.ADMIN_APPROVAL_TOKEN||saved.admin,release:env.RELEASE_SIGNING_KEY||saved.release,preflight:env.PREFLIGHT_SIGNING_KEY||saved.preflight,inbound:env.INBOUND_AUTH_TOKEN||saved.inbound};
  if(!store.get('installation','sendHold'))store.holdSending('Installation starts with all external sending disabled');
  return new Engine({config,flags,store,mail,keys});
}
export function openApplication(env=process.env) {
  const engine=openEngine(env),credentials={clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,refreshToken:env.GOOGLE_REFRESH_TOKEN};
  const readMail=new Gmail({business:engine.config.business,credentials});
  const research=new PublicWeb({allowedHosts:engine.config.discovery.allowedHosts});
  const calendar=new GoogleCalendar({gmail:readMail,calendarId:engine.config.integrations.calendarId});
  const notion=new Notion({token:env.NOTION_TOKEN,dataSourceId:engine.config.integrations.notionDataSourceId});
  const receiver=new Gmail({business:{sender:engine.config.verification?.ownedInbox,replyTo:engine.config.verification?.ownedInbox},credentials:{clientId:env.VERIFICATION_GOOGLE_CLIENT_ID,clientSecret:env.VERIFICATION_GOOGLE_CLIENT_SECRET,refreshToken:env.VERIFICATION_GOOGLE_REFRESH_TOKEN}});
  const worker=new Worker(engine,{mail:readMail,research,calendar,notion:engine.config.integrations.notionDataSourceId?notion:null,readsEnabled:env.INTEGRATION_READS_ENABLED==='true',researchEnabled:env.RESEARCH_NETWORK_ENABLED==='true',ownerEmailEnabled:env.OWNER_EMAIL_ENABLED==='true'});
  return {engine,worker,providers:{mail:readMail,research,calendar,notion,receiver}};
}
