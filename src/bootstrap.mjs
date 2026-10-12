import { loadConfig } from './config.mjs';
import { Store } from './store.mjs';
import { Engine } from './engine.mjs';
import { MockMail } from './providers/mock.mjs';
import { Gmail } from './providers/gmail.mjs';
export function openEngine(env=process.env) {
  const {config,flags}=loadConfig(env.ENGINE_CONFIG??'config/example.json',env);
  const mail=flags.dryRun?new MockMail(config.business):new Gmail({business:config.business,credentials:{clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,refreshToken:env.GOOGLE_REFRESH_TOKEN}});
  const store=new Store(env.ENGINE_DATABASE??'runtime/engine.sqlite',config.tenant);
  return new Engine({config,flags,store,mail,keys:{admin:env.ADMIN_APPROVAL_TOKEN,release:env.RELEASE_SIGNING_KEY,preflight:env.PREFLIGHT_SIGNING_KEY,inbound:env.INBOUND_AUTH_TOKEN}});
}
