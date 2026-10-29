import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { randomBytes,randomUUID } from 'node:crypto';
import { openEngine } from '../src/bootstrap.mjs';
mkdirSync('runtime',{recursive:true});
if(!existsSync('config/local.json')){const config=JSON.parse(readFileSync('config/example.json','utf8'));config.tenant=`local-${randomUUID()}`;writeFileSync('config/local.json',JSON.stringify(config,null,2)+'\n','utf8');}
if(!existsSync('.env')) {
  const text=readFileSync('.env.example','utf8').replace('ENGINE_CONFIG=config/example.json','ENGINE_CONFIG=config/local.json');writeFileSync('.env',text,{mode:0o600});
}
if(!existsSync('runtime/keys.json'))writeFileSync('runtime/keys.json',JSON.stringify(Object.fromEntries(['admin','release','inbound','preflight'].map(k=>[k,randomBytes(32).toString('hex')])),null,2),{mode:0o600});
const engine=openEngine({...process.env,ENGINE_CONFIG:'config/local.json',DRY_RUN:'true',LIVE_SEND_ENABLED:'false',CONTROLLED_AUTONOMY_ENABLED:'false'});
engine.store.holdSending('Installation setup keeps all sending disabled');engine.store.close();
console.log('Local setup complete. Operator credentials are stored in ignored runtime/keys.json. Run npm start, sign in, and complete the setup interview. Existing configuration, credentials and history are preserved.');
