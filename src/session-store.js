const session = require('express-session');

class PostgresSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.cleanup = setInterval(() => {
      db.run('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]).catch(() => {});
    }, 15 * 60 * 1000).unref();
  }

  async get(sid, callback) {
    try {
      const row = await this.db.get('SELECT data, expires_at FROM sessions WHERE sid = $1', [sid]);
      if (!row) return callback(null, null);
      if (Number(row.expires_at) < Date.now()) {
        await this.db.run('DELETE FROM sessions WHERE sid = $1', [sid]);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.data));
    } catch (error) { callback(error); }
  }

  async set(sid, value, callback = () => {}) {
    try {
      const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 8 * 3600000;
      await this.db.run(`INSERT INTO sessions (sid, data, expires_at) VALUES ($1, $2, $3)
        ON CONFLICT(sid) DO UPDATE SET data=excluded.data, expires_at=excluded.expires_at`, [sid, JSON.stringify(value), expires]);
      callback(null);
    } catch (error) { callback(error); }
  }

  async destroy(sid, callback = () => {}) {
    try {
      await this.db.run('DELETE FROM sessions WHERE sid = $1', [sid]);
      callback(null);
    } catch (error) { callback(error); }
  }
}

module.exports = PostgresSessionStore;
