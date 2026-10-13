import { readFileSync,readdirSync } from 'node:fs';
import { hash } from './config.mjs';

export function migrate(db,directory=new URL('../schema/',import.meta.url)) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)');
  const names=readdirSync(directory).filter(name=>/^\d+_[a-z_]+\.sql$/.test(name)).sort();
  if(db.prepare('SELECT name FROM schema_migrations').all().some(row=>!names.includes(row.name)))throw Error('Database schema is newer than this installation; do not downgrade');
  for(const name of names) {
    const sql=readFileSync(new URL(name,directory),'utf8'),checksum=hash(sql);
    const applied=db.prepare('SELECT checksum FROM schema_migrations WHERE name=?').get(name);
    if(applied) {if(applied.checksum!==checksum)throw Error(`Applied migration changed: ${name}`);continue;}
    if(name==='001_initial.sql'&&db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='attempts'").get()) {
      const columns=db.prepare('PRAGMA table_info(attempts)').all().map(r=>r.name);
      if(['parent_id','ordinal','inbound_id'].some(c=>!columns.includes(c)))throw Error('Unsupported legacy schema; restore and run an explicit migration');
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(name,checksum,new Date().toISOString());db.exec('COMMIT');
    } catch(error){db.exec('ROLLBACK');throw error;}
  }
  return db.prepare('SELECT name,checksum,applied_at FROM schema_migrations ORDER BY name').all();
}
