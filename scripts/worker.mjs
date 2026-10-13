import { openApplication } from '../src/bootstrap.mjs';
const app=openApplication();
try{console.log(JSON.stringify(await app.worker.tick(),null,2));}finally{app.engine.store.close();}
