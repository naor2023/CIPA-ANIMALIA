const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'cipa.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    employee_name TEXT NOT NULL,
    registration TEXT,
    department TEXT NOT NULL,
    job_title TEXT,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Novo',
    internal_notes TEXT DEFAULT '',
    assigned_to TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_records_created ON records(created_at);
  CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
  CREATE INDEX IF NOT EXISTS idx_records_department ON records(department);
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

const recordColumns = new Set(db.prepare('PRAGMA table_info(records)').all().map(column => column.name));
if (!recordColumns.has('priority')) db.exec("ALTER TABLE records ADD COLUMN priority TEXT NOT NULL DEFAULT 'Média'");
if (!recordColumns.has('due_date')) db.exec('ALTER TABLE records ADD COLUMN due_date TEXT');
if (!recordColumns.has('resolution')) db.exec("ALTER TABLE records ADD COLUMN resolution TEXT DEFAULT ''");

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_logs(record_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_records_priority ON records(priority);
  CREATE INDEX IF NOT EXISTS idx_records_due_date ON records(due_date);
`);

module.exports = db;
