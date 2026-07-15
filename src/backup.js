const fs = require('node:fs');
const path = require('node:path');

function sqlString(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function runDailyBackup(db, options) {
  const projectRoot = typeof options === 'string' ? options : options.projectRoot;
  const dataDir = typeof options === 'string' ? path.join(projectRoot, 'data') : options.dataDir;
  const day = new Date().toISOString().slice(0, 10);
  const backupRoot = process.env.BACKUP_DIR || path.join(dataDir, 'backups');
  const destination = path.join(backupRoot, day);
  const databaseBackup = path.join(destination, 'cipa.db');
  fs.mkdirSync(destination, { recursive: true });

  if (!fs.existsSync(databaseBackup)) {
    db.exec(`VACUUM INTO ${sqlString(databaseBackup.replaceAll('\\', '/'))}`);
    const uploads = path.join(dataDir, 'uploads');
    if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(destination, 'uploads'), { recursive: true });
  }

  const retentionLimit = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
    const timestamp = new Date(`${entry.name}T00:00:00Z`).getTime();
    if (timestamp < retentionLimit) fs.rmSync(path.join(backupRoot, entry.name), { recursive: true, force: true });
  }
  return destination;
}

module.exports = runDailyBackup;
