CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,due_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',lease_until TEXT,owner TEXT,attempts INTEGER NOT NULL DEFAULT 0,
 last_error TEXT,completed_at TEXT
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(state,due_at);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY,kind TEXT NOT NULL,recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,provider_id TEXT,attempted_at TEXT
);
CREATE TABLE IF NOT EXISTS verification_events (
 id TEXT PRIMARY KEY,kind TEXT NOT NULL,artifact_hash TEXT NOT NULL,mode TEXT NOT NULL,
 checked_at TEXT NOT NULL,expires_at TEXT NOT NULL,detail TEXT NOT NULL
);
