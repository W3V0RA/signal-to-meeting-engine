import { openApplication } from '../src/bootstrap.mjs';
import { collectMailboxProof,verifyIntegrations } from '../src/verifier.mjs';
const app=openApplication(),mode=process.argv[2],reviewer=process.env.VERIFICATION_REVIEWER;
try {
  if(process.env.INTEGRATION_READS_ENABLED!=='true')throw Error('Read-only integration verification requires INTEGRATION_READS_ENABLED=true');
  if(mode==='mailbox') {
    await collectMailboxProof(app.engine,{sender:app.providers.mail,receiver:app.providers.receiver,references:app.engine.config.verification?.references??{},token:app.engine.keys.admin,reviewer});
    console.log('Actual owned-inbox artifacts verified and stored locally. Sending remains held.');
  } else if(mode==='integrations') {
    if(process.env.RESEARCH_NETWORK_ENABLED!=='true')throw Error('Explicit research read access is required');
    await app.worker.mailboxSync();await verifyIntegrations(app.engine,{...app.providers,token:app.engine.keys.admin,reviewer});
    console.log('Business integration reads verified. Sending remains held.');
  } else throw Error('Usage: npm run verify -- mailbox|integrations. This command never sends or activates sending.');
}finally{app.engine.store.close();}
