const path = require('path');
const fs = require('fs').promises;

const ERROR_LOGS_FILE = path.join(__dirname, '../../data/error-logs.json');
const APP_LOGS_FILE = path.join(__dirname, '../../data/app-logs.json');

class ErrorLogger {
  // ===== Original error logging (backward compatible) =====
  async logError(taskId, taskName, error) {
    try {
      const logs = await this.getLogs();
      
      const logEntry = {
        taskId,
        taskName,
        error: error.message || error.toString(),
        stack: error.stack,
        timestamp: new Date().toISOString()
      };
      
      logs.push(logEntry);
      
      // Keep only last 1000 logs
      if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000);
      }
      
      await fs.writeFile(ERROR_LOGS_FILE, JSON.stringify({ logs }, null, 2));
      
      console.error(`[ERROR LOG] Task ${taskName} (${taskId}):`, error.message);
      
      // Also write to app logs
      await this.writeAppLog({
        timestamp: new Date().toISOString(),
        type: 'error',
        taskId,
        taskName,
        message: error.message || error.toString(),
        stack: error.stack
      });
      
      return logEntry;
    } catch (err) {
      console.error('Failed to write error log:', err);
    }
  }

  async getLogs() {
    try {
      const data = await fs.readFile(ERROR_LOGS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.logs || [];
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async clearLogs(taskId = null) {
    try {
      if (taskId) {
        const logs = await this.getLogs();
        const filtered = logs.filter(log => log.taskId !== taskId);
        await fs.writeFile(ERROR_LOGS_FILE, JSON.stringify({ logs: filtered }, null, 2));
        
        // Also clear from app logs
        const appLogs = await this.getAppLogs('all', 10000);
        const filteredAppLogs = appLogs.filter(log => log.taskId !== taskId);
        await this.saveAppLogs(filteredAppLogs);
      } else {
        await fs.writeFile(ERROR_LOGS_FILE, JSON.stringify({ logs: [] }, null, 2));
        await fs.writeFile(APP_LOGS_FILE, JSON.stringify({ logs: [] }, null, 2));
      }
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  }

  // ===== New enhanced logging system =====
  
  async logTaskStart(taskId, taskName, files) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'task_start',
      taskId,
      taskName,
      filesCount: files.length,
      files: files.map(f => path.basename(f))
    };
    await this.writeAppLog(logEntry);
    console.log(`[TASK START] ${taskName} (${taskId}) - ${files.length} files`);
  }

  async logFileStart(taskId, taskName, fileName, fileIndex, totalFiles) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'file_start',
      taskId,
      taskName,
      fileName: path.basename(fileName),
      fileIndex,
      totalFiles
    };
    await this.writeAppLog(logEntry);
    console.log(`[FILE START] ${taskName} - File ${fileIndex}/${totalFiles}: ${path.basename(fileName)}`);
  }

  async logFileComplete(taskId, taskName, fileName, fileIndex, totalFiles, durationSeconds) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'file_complete',
      taskId,
      taskName,
      fileName: path.basename(fileName),
      fileIndex,
      totalFiles,
      duration: durationSeconds,
      durationFormatted: this.formatDuration(durationSeconds)
    };
    await this.writeAppLog(logEntry);
    console.log(`[FILE COMPLETE] ${taskName} - File ${fileIndex}/${totalFiles}: ${path.basename(fileName)} - ${this.formatDuration(durationSeconds)}`);
  }

  async logTaskComplete(taskId, taskName, filesProcessed, totalDuration) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'task_complete',
      taskId,
      taskName,
      filesProcessed,
      totalDuration,
      totalDurationFormatted: this.formatDuration(totalDuration)
    };
    await this.writeAppLog(logEntry);
    console.log(`[TASK COMPLETE] ${taskName} (${taskId}) - ${filesProcessed} files - ${this.formatDuration(totalDuration)}`);
  }

  async logTaskStopped(taskId, taskName, reason = 'manual') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'task_stopped',
      taskId,
      taskName,
      reason
    };
    await this.writeAppLog(logEntry);
    console.log(`[TASK STOPPED] ${taskName} (${taskId}) - Reason: ${reason}`);
  }

  formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  async writeAppLog(logEntry) {
    try {
      const logs = await this.getAppLogs('all', 10000);
      logs.unshift(logEntry); // Add to beginning (most recent first)
      
      // Keep only last 5000 logs
      if (logs.length > 5000) {
        logs.splice(5000);
      }
      
      await this.saveAppLogs(logs);
    } catch (error) {
      console.error('Failed to write app log:', error);
    }
  }

  async getAppLogs(type = 'all', limit = 100) {
    try {
      const data = await fs.readFile(APP_LOGS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      let logs = parsed.logs || [];
      
      // Filter by type if specified
      if (type && type !== 'all') {
        logs = logs.filter(log => log.type === type);
      }
      
      // Return limited results
      return logs.slice(0, limit);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async saveAppLogs(logs) {
    await fs.writeFile(APP_LOGS_FILE, JSON.stringify({ logs }, null, 2));
  }
}

module.exports = new ErrorLogger();
