import { openEngine } from '../src/bootstrap.mjs';
import { readiness } from '../src/readiness.mjs';
const engine=openEngine();
try{console.log(JSON.stringify(readiness(engine),null,2));}finally{engine.store.close();}
