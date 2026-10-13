import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { migrate } from './migrations.mjs';
export class Store {
  constructor(path=':memory:',tenant='fictional-demo') {
    if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path,{timeout:5000});
    if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata'").get()) {
      const tenantRecord=this.db.prepare('SELECT value FROM metadata WHERE key=?').get('tenant');
      if(tenantRecord&&tenantRecord.value!==tenant){this.db.close();throw Error('Database tenant mismatch');}
    }
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    try{migrate(this.db);}catch(error){this.db.close();throw error;}
    const existing=this.db.prepare('SELECT value FROM metadata WHERE key=?').get('tenant');
    if(existing&&existing.value!==tenant) {this.db.close();throw Error('Database tenant mismatch');}
    this.db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('tenant',tenant);
  }
  get(kind,id){const r=this.db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind,id);return r?JSON.parse(r.data):null;}
  list(kind){return this.db.prepare('SELECT data FROM records WHERE kind=? ORDER BY id').all(kind).map(r=>JSON.parse(r.data));}
  put(kind,id,value){this.db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data').run(kind,id,JSON.stringify(value));return value;}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const v=fn();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  audit(event,id,now,detail={}){this.db.prepare('INSERT INTO audit(event,record_id,at,detail) VALUES(?,?,?,?)').run(event,id,now.toISOString(),JSON.stringify(detail));}
  suppress(route,reason,now){this.db.prepare('INSERT INTO suppressions VALUES(?,?,?) ON CONFLICT(route) DO UPDATE SET reason=excluded.reason,at=excluded.at').run(route.toLowerCase(),reason,now.toISOString());this.audit('suppressed',route,now,{reason});}
  suppressed(route){return !!this.db.prepare('SELECT 1 FROM suppressions WHERE route IN (?,?)').get(route.toLowerCase(),`@${route.split('@')[1].toLowerCase()}`);}
  cost(provider,operation,amount,now){this.db.prepare('INSERT INTO costs(provider,operation,amount,at) VALUES(?,?,?,?)').run(provider,operation,amount,now.toISOString());}
  holdSending(reason,now=new Date()){this.put('installation','sendHold',{held:true,reason,at:now.toISOString()});this.audit('installation_send_hold','installation',now,{reason});}
  enqueue(id,kind,payload,dueAt){this.db.prepare('INSERT OR IGNORE INTO jobs(id,kind,payload,due_at) VALUES(?,?,?,?)').run(id,kind,JSON.stringify(payload),dueAt.toISOString());}
  jobs(){return this.db.prepare('SELECT * FROM jobs ORDER BY due_at,id').all().map(j=>({...j,payload:JSON.parse(j.payload)}));}
  close(){this.db.close();}
}
