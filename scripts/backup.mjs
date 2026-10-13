import { backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { openEngine } from '../src/bootstrap.mjs';
const engine=openEngine();mkdirSync('runtime/backups',{recursive:true});
try{const path=`runtime/backups/engine-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`;await backup(engine.store.db,path);console.log(`Consistent private database backup: ${path}`);}finally{engine.store.close();}
