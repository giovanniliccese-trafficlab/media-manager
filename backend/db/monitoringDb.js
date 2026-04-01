const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '../../data/monitoring.db');
const RETENTION_HOURS = 24;

class MonitoringDb {
  constructor() {
    this.db = null;
    this.ready = false;
    this.init();
  }

  async init() {
    try {
      const SQL = await initSqlJs();

      // Load existing DB from disk if it exists, otherwise create new
      if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        this.db = new SQL.Database(fileBuffer);
        console.log('[MONITORING DB] Loaded existing DB from', DB_PATH);
      } else {
        this.db = new SQL.Database();
        console.log('[MONITORING DB] Created new DB at', DB_PATH);
      }

      this.db.run(`
        CREATE TABLE IF NOT EXISTS resource_history (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT    NOT NULL,
          cpu       REAL    NOT NULL DEFAULT 0,
          ram       REAL    NOT NULL DEFAULT 0,
          gpu       REAL    NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_timestamp ON resource_history (timestamp);
      `);

      this.ready = true;
      console.log('[MONITORING DB] Ready');
    } catch (error) {
      console.error('[MONITORING DB] Failed to initialize:', error);
    }
  }

  // Persist in-memory DB to disk
  persist() {
    try {
      const data = this.db.export();
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (error) {
      console.error('[MONITORING DB] Error persisting to disk:', error);
    }
  }

  save(cpu, ram, gpu) {
    if (!this.ready || !this.db) return;
    try {
      this.db.run(
        'INSERT INTO resource_history (timestamp, cpu, ram, gpu) VALUES (?, ?, ?, ?)',
        [new Date().toISOString(), cpu, ram, gpu]
      );
      this.cleanup();
      this.persist(); // Save to disk after every write
    } catch (error) {
      console.error('[MONITORING DB] Error saving data point:', error);
    }
  }

  cleanup() {
    try {
      const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000).toISOString();
      this.db.run('DELETE FROM resource_history WHERE timestamp < ?', [cutoff]);
    } catch (error) {
      console.error('[MONITORING DB] Error during cleanup:', error);
    }
  }

  getHistory(hours = 24) {
    if (!this.ready || !this.db) return [];
    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const result = this.db.exec(
        'SELECT timestamp, cpu, ram, gpu FROM resource_history WHERE timestamp >= ? ORDER BY timestamp ASC',
        [cutoff]
      );
      if (!result.length) return [];
      const [{ columns, values }] = result;
      return values.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
    } catch (error) {
      console.error('[MONITORING DB] Error reading history:', error);
      return [];
    }
  }
}

module.exports = new MonitoringDb();