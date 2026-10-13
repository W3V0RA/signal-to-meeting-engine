import { openApplication } from '../src/bootstrap.mjs';
import { reconcileAttempt } from '../src/reconciliation.mjs';
const app=openApplication(),id=process.argv.find(arg=>arg.startsWith('--message-id='))?.slice(13);
try {
  if(!id||process.env.INTEGRATION_READS_ENABLED!=='true')throw Error('Set read-only integration access and use --message-id=<held message>');
  console.log(JSON.stringify(await reconcileAttempt(app.engine,id,{mail:app.providers.mail,token:app.engine.keys.admin,reviewer:process.env.VERIFICATION_REVIEWER}),null,2));
}finally{app.engine.store.close();}
