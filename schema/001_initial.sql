PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));
CREATE TABLE IF NOT EXISTS attempts (
 message_id TEXT PRIMARY KEY, recipient TEXT NOT NULL, kind TEXT NOT NULL,
 local_day TEXT NOT NULL, at TEXT NOT NULL, status TEXT NOT NULL,
 provider_id TEXT, thread_id TEXT, rfc_id TEXT, parent_id TEXT, ordinal INTEGER, inbound_id TEXT
);
CREATE TABLE IF NOT EXISTS suppressions (route TEXT PRIMARY KEY, reason TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS inbound (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, recipient TEXT NOT NULL, classification TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY,event TEXT NOT NULL,record_id TEXT,at TEXT NOT NULL,detail TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS costs (id INTEGER PRIMARY KEY,provider TEXT NOT NULL,operation TEXT NOT NULL,amount REAL NOT NULL CHECK(amount>=0),at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outcomes (id TEXT PRIMARY KEY,kind TEXT NOT NULL,record_id TEXT NOT NULL,at TEXT NOT NULL,detail TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS projections (id TEXT PRIMARY KEY,provider_id TEXT,hash TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS attempts_day ON attempts(local_day,status);
CREATE INDEX IF NOT EXISTS attempts_recipient ON attempts(recipient);
CREATE UNIQUE INDEX IF NOT EXISTS attempts_touch ON attempts(parent_id,ordinal) WHERE kind='followup';
CREATE UNIQUE INDEX IF NOT EXISTS attempts_response ON attempts(inbound_id) WHERE kind='response';
