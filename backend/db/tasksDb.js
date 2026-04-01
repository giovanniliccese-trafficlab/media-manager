const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '../../data/tasks.db');
const BACKUP_JSON = path.join(__dirname, '../../data/tasks.json');

class TasksDb {
  constructor() {
    this.db = null;
    this.ready = false;
    this.init();
  }

  async init() {
    try {
      const SQL = await initSqlJs();

      if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        this.db = new SQL.Database(fileBuffer);
        console.log('[TASKS DB] Loaded from', DB_PATH);
      } else {
        this.db = new SQL.Database();
        console.log('[TASKS DB] Created new database');
      }

      this.db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
          id              TEXT PRIMARY KEY,
          name            TEXT NOT NULL,
          files           TEXT NOT NULL,
          startDateTime   TEXT,
          seekTime        TEXT DEFAULT '00:00:00',
          loop            INTEGER DEFAULT 0,
          status          TEXT DEFAULT 'stopped',
          error           TEXT,
          createdAt       TEXT NOT NULL,
          updatedAt       TEXT,
          rtspUrl         TEXT,
          hlsUrl          TEXT,
          activeFile      TEXT,
          uptime          INTEGER DEFAULT 0,
          connectedClients INTEGER DEFAULT 0
        );
      `);

      this.ready = true;
      this.persist();
      this.backupToJSON();
      console.log('[TASKS DB] Ready');
    } catch (error) {
      console.error('[TASKS DB] Init error:', error);
    }
  }

  persist() {
    if (!this.ready || !this.db) return;
    try {
      const data = this.db.export();
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (error) {
      console.error('[TASKS DB] Persist error:', error);
    }
  }

  // Backup to JSON for compatibility
  backupToJSON() {
    try {
      const tasks = this.getAll();
      fs.writeFileSync(BACKUP_JSON, JSON.stringify({ tasks }, null, 2));
    } catch (error) {
      console.error('[TASKS DB] JSON backup error:', error);
    }
  }

  getAll() {
    if (!this.ready || !this.db) return [];
    try {
      const result = this.db.exec('SELECT * FROM tasks');
      if (!result.length) return [];
      const [{ columns, values }] = result;
      return values.map(row => this.rowToTask(columns, row));
    } catch (error) {
      console.error('[TASKS DB] getAll error:', error);
      return [];
    }
  }

  getById(id) {
    if (!this.ready || !this.db) return null;
    try {
      const result = this.db.exec('SELECT * FROM tasks WHERE id = ?', [id]);
      if (!result.length || !result[0].values.length) return null;
      const [{ columns, values }] = result;
      return this.rowToTask(columns, values[0]);
    } catch (error) {
      console.error('[TASKS DB] getById error:', error);
      return null;
    }
  }

  create(task) {
    if (!this.ready || !this.db) return null;
    try {
      this.db.run(
        `INSERT INTO tasks (id, name, files, startDateTime, seekTime, loop, status, error, 
         createdAt, rtspUrl, hlsUrl, activeFile, uptime, connectedClients)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id, task.name, JSON.stringify(task.files), task.startDateTime, task.seekTime,
          task.loop ? 1 : 0, task.status, task.error, task.createdAt, task.rtspUrl,
          task.hlsUrl, task.activeFile, task.uptime || 0, task.connectedClients || 0
        ]
      );
      this.persist();
      this.backupToJSON();
      return this.getById(task.id);
    } catch (error) {
      console.error('[TASKS DB] create error:', error);
      return null;
    }
  }

  update(id, updates) {
    if (!this.ready || !this.db) return null;
    try {
      const task = this.getById(id);
      if (!task) return null;

      const merged = { ...task, ...updates, updatedAt: new Date().toISOString() };
      
      this.db.run(
        `UPDATE tasks SET name=?, files=?, startDateTime=?, seekTime=?, loop=?, status=?, error=?,
         updatedAt=?, rtspUrl=?, hlsUrl=?, activeFile=?, uptime=?, connectedClients=?
         WHERE id=?`,
        [
          merged.name, JSON.stringify(merged.files), merged.startDateTime, merged.seekTime,
          merged.loop ? 1 : 0, merged.status, merged.error, merged.updatedAt, merged.rtspUrl,
          merged.hlsUrl, merged.activeFile, merged.uptime || 0, merged.connectedClients || 0, id
        ]
      );
      this.persist();
      this.backupToJSON();
      return this.getById(id);
    } catch (error) {
      console.error('[TASKS DB] update error:', error);
      return null;
    }
  }

  delete(id) {
    if (!this.ready || !this.db) return false;
    try {
      this.db.run('DELETE FROM tasks WHERE id = ?', [id]);
      this.persist();
      this.backupToJSON();
      return true;
    } catch (error) {
      console.error('[TASKS DB] delete error:', error);
      return false;
    }
  }

  deleteAll() {
    if (!this.ready || !this.db) return false;
    try {
      this.db.run('DELETE FROM tasks');
      this.persist();
      this.backupToJSON();
      return true;
    } catch (error) {
      console.error('[TASKS DB] deleteAll error:', error);
      return false;
    }
  }

  rowToTask(columns, row) {
    const obj = Object.fromEntries(columns.map((col, i) => [col, row[i]]));
    return {
      id: obj.id,
      name: obj.name,
      files: JSON.parse(obj.files || '[]'),
      startDateTime: obj.startDateTime,
      seekTime: obj.seekTime || '00:00:00',
      loop: obj.loop === 1,
      status: obj.status || 'stopped',
      error: obj.error,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      rtspUrl: obj.rtspUrl,
      hlsUrl: obj.hlsUrl,
      activeFile: obj.activeFile,
      uptime: obj.uptime || 0,
      connectedClients: obj.connectedClients || 0
    };
  }
}

module.exports = new TasksDb();
