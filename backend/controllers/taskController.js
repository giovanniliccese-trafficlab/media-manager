const { spawn } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fileUtils = require('../utils/fileUtils');
const cronManager = require('../utils/cronManager');
const errorLogger = require('../utils/logger');
const tasksDb = require('../db/tasksDb');

const runningProcesses = new Map();

class TaskController {
  async getTasks() {
    return tasksDb.getAll();
  }

  async getTask(id) {
    return tasksDb.getById(id);
  }

  async createTask(taskData) {
    // Validation
    if (!taskData.name || !taskData.name.trim()) {
      throw new Error('Task name is required');
    }
    if (!taskData.files || taskData.files.length === 0) {
      throw new Error('At least one file is required');
    }

    const newTask = {
      id: uuidv4(),
      name: taskData.name.trim(),
      files: Array.isArray(taskData.files) ? taskData.files : [taskData.files],
      startDateTime: taskData.startDateTime || null,
      seekTime: taskData.seekTime || '00:00:00',
      loop: taskData.loop || false,
      status: 'stopped',
      error: null,
      createdAt: new Date().toISOString(),
      rtspUrl: '',
      hlsUrl: '',
      activeFile: null,
      uptime: 0,
      connectedClients: 0
    };

    const config = await fileUtils.readJSON(path.join(__dirname, '../../data/config.json'));
    let serverIp = config.server?.ip;
    if (!serverIp || serverIp === '') serverIp = await this.getServerIP();
    
    newTask.rtspUrl = `rtsp://${serverIp}:${config.mediamtx?.rtspPort || 554}/${newTask.name}`;
    newTask.hlsUrl = `http://${serverIp}:${config.mediamtx?.hlsPort || 8888}/${newTask.name}`;

    const created = tasksDb.create(newTask);

    if (newTask.startDateTime) {
      try {
        const cronExpr = this.dateTimeToCron(newTask.startDateTime);
        cronManager.scheduleTask(newTask.id, cronExpr, () => this.startTask(newTask.id));
      } catch (error) {
        console.error('Error scheduling task:', error);
      }
    }

    return created;
  }

  async getServerIP() {
    try {
      const si = require('systeminformation');
      const networkInterfaces = await si.networkInterfaces();
      const defaultInterface = networkInterfaces.find(ni => ni.ip4 && !ni.internal);
      return defaultInterface ? defaultInterface.ip4 : 'localhost';
    } catch (error) {
      return 'localhost';
    }
  }

  dateTimeToCron(dateTime) {
    const date = new Date(dateTime);
    return `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;
  }

  async updateTask(id, updates) {
    const task = tasksDb.getById(id);
    if (!task) throw new Error('Task not found');

    // Validation
    if (updates.name !== undefined && (!updates.name || !updates.name.trim())) {
      throw new Error('Task name cannot be empty');
    }
    if (updates.files !== undefined && (!updates.files || updates.files.length === 0)) {
      throw new Error('At least one file is required');
    }

    if (task.status === 'running') await this.stopTask(id);
    cronManager.removeTask(id);

    if (updates.name && updates.name !== task.name) {
      const config = await fileUtils.readJSON(path.join(__dirname, '../../data/config.json'));
      let serverIp = config.server?.ip;
      if (!serverIp || serverIp === '') serverIp = await this.getServerIP();
      updates.rtspUrl = `rtsp://${serverIp}:${config.mediamtx?.rtspPort || 554}/${updates.name}`;
      updates.hlsUrl = `http://${serverIp}:${config.mediamtx?.hlsPort || 8888}/${updates.name}`;
    }

    updates.error = null;
    const updated = tasksDb.update(id, updates);

    if (updated && updated.startDateTime) {
      try {
        const cronExpr = this.dateTimeToCron(updated.startDateTime);
        cronManager.scheduleTask(id, cronExpr, () => this.startTask(id));
      } catch (error) {
        console.error('Error re-scheduling task:', error);
      }
    }

    return updated;
  }

  async deleteTask(id) {
    await this.stopTask(id);
    cronManager.removeTask(id);
    await errorLogger.clearLogs(id);
    tasksDb.delete(id);
    return { success: true, message: 'Task deleted' };
  }

  async startTask(id, force = false) {
    const task = tasksDb.getById(id);
    if (!task) throw new Error('Task not found');
    if (task.status === 'running' && !force) {
      return { success: false, message: 'Task already running' };
    }
    if (force && runningProcesses.has(id)) await this.stopTask(id);

    try {
      const config = await fileUtils.readJSON(path.join(__dirname, '../../data/config.json'));
      const rtspUrl = `rtsp://mediamtx:${config.mediamtx?.rtspPort || 554}/${task.name}`;
      const args = this._buildFFmpegArgs(task, rtspUrl);

      console.log('='.repeat(80));
      console.log(`[FFMPEG START] Task: ${task.name} (${task.id})`);
      console.log(`Full command: ffmpeg ${args.join(' ')}`);
      console.log('='.repeat(80));

      const ffmpegProcess = spawn('ffmpeg', args);
      const processInfo = {
        process: ffmpegProcess,
        startTime: Date.now(),
        currentFileIndex: 0,
        fileStartTime: Date.now(),
        stderrBuffer: '',
        filesCompleted: []
      };

      runningProcesses.set(id, processInfo);
      await this._updateTaskError(id, null);
      
      // Log task start
      await errorLogger.logTaskStart(id, task.name, task.files);

      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        processInfo.stderrBuffer += output;
        if (processInfo.stderrBuffer.length > 10000) {
          processInfo.stderrBuffer = processInfo.stderrBuffer.slice(-10000);
        }
        
        // Track which file is currently playing in playlist
        // FFmpeg with -v verbose logs: "Opening 'filename' for reading" or "reading from 'filename'"
        if (task.files.length > 1) {
          // Pattern: Opening 'path/to/file.mp4' for reading
          // Pattern: [concat @ ...] Opening 'path/to/file.mp4'
          const openingMatch = output.match(/Opening '([^']+)' for reading/i) || 
                              output.match(/\[concat[^\]]*\] Opening '([^']+)'/i) ||
                              output.match(/reading from '([^']+)'/i);
          
          if (openingMatch && openingMatch[1]) {
            const openedFile = openingMatch[1];
            // Find which file in the playlist matches this path
            const fileIndex = task.files.findIndex(f => 
              f === openedFile || f.endsWith(openedFile) || openedFile.endsWith(f.split('/').pop())
            );
            
            if (fileIndex !== -1 && processInfo.currentFileIndex !== fileIndex) {
              const oldIndex = processInfo.currentFileIndex;
              
              // Log completion of previous file
              if (oldIndex >= 0 && oldIndex < task.files.length) {
                const fileDuration = Math.floor((Date.now() - processInfo.fileStartTime) / 1000);
                errorLogger.logFileComplete(
                  id, 
                  task.name, 
                  task.files[oldIndex], 
                  oldIndex + 1, 
                  task.files.length, 
                  fileDuration
                ).catch(err => console.error('[LOG ERROR]', err));
                processInfo.filesCompleted.push({
                  file: task.files[oldIndex],
                  duration: fileDuration
                });
              }
              
              // Update to new file
              processInfo.currentFileIndex = fileIndex;
              processInfo.fileStartTime = Date.now();
              
              // Log start of new file
              errorLogger.logFileStart(
                id,
                task.name,
                task.files[fileIndex],
                fileIndex + 1,
                task.files.length
              ).catch(err => console.error('[LOG ERROR]', err));
              
              // Update activeFile in DB asynchronously
              this._updateTaskStatus(id, 'running', task.files[fileIndex]).catch(err => 
                console.error(`[FFMPEG] Error updating activeFile:`, err)
              );
              
              const fileName = task.files[fileIndex].split('/').pop();
              console.log(`[FFMPEG PLAYLIST] Task ${task.name}: ${oldIndex + 1} → ${fileIndex + 1}/${task.files.length} - Now playing: ${fileName}`);
            }
          }
        }
        
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('failed')) {
          console.error(`[FFMPEG ERROR] Task ${task.name}:`, output.trim());
        }
      });

      ffmpegProcess.on('error', async (error) => {
        console.error(`[FFMPEG PROCESS ERROR] Task ${task.name}:`, error);
        await errorLogger.logError(id, task.name, error);
        await this._updateTaskError(id, error.message);
        runningProcesses.delete(id);
        await this._updateTaskStatus(id, 'stopped');
      });

      ffmpegProcess.on('close', async (code) => {
        console.log(`[FFMPEG CLOSE] Task ${task.name} exited with code ${code}`);
        
        // Log last file completion if needed
        if (processInfo.currentFileIndex >= 0 && processInfo.currentFileIndex < task.files.length) {
          const fileDuration = Math.floor((Date.now() - processInfo.fileStartTime) / 1000);
          await errorLogger.logFileComplete(
            id,
            task.name,
            task.files[processInfo.currentFileIndex],
            processInfo.currentFileIndex + 1,
            task.files.length,
            fileDuration
          );
        }
        
        if (code !== 0 && code !== null && code !== 255) {
          const errorMatch = processInfo.stderrBuffer.match(/error.*$/im);
          const errorMsg = errorMatch ? errorMatch[0] : `FFmpeg exited with code ${code}`;
          await errorLogger.logError(id, task.name, new Error(errorMsg));
          await this._updateTaskError(id, errorMsg);
          await this._updateTaskStatus(id, 'stopped');
        } else if (code === 255) {
          console.log(`[FFMPEG INFO] Task ${task.name} stopped normally (SIGTERM)`);
          const totalDuration = Math.floor((Date.now() - processInfo.startTime) / 1000);
          await errorLogger.logTaskStopped(id, task.name, 'manual');
          await this._updateTaskStatus(id, 'stopped');
        } else if (code === 0) {
          // Task completed successfully
          const totalDuration = Math.floor((Date.now() - processInfo.startTime) / 1000);
          await errorLogger.logTaskComplete(id, task.name, processInfo.filesCompleted.length, totalDuration);
          console.log(`[FFMPEG COMPLETE] Task ${task.name} completed successfully after ${totalDuration}s`);
          await this._updateTaskStatus(id, 'completed');
        }
        
        runningProcesses.delete(id);

        if (task.loop && code === 0) {
          console.log(`[FFMPEG RESTART] Restarting looped task: ${task.name}`);
          setTimeout(() => this.startTask(id), 1000);
        }
      });

      await this._updateTaskStatus(id, 'running', task.files[0]);
      console.log(`[FFMPEG SUCCESS] Task ${task.name} started successfully`);
      return { success: true, message: 'Task started' };
    } catch (error) {
      console.error(`[FFMPEG FATAL] Error starting task ${id}:`, error);
      await errorLogger.logError(id, task.name, error);
      await this._updateTaskError(id, error.message);
      throw error;
    }
  }

  async stopTask(id, force = false) {
    const processInfo = runningProcesses.get(id);
    if (!processInfo) {
      await this._updateTaskStatus(id, 'stopped');
      return { success: true, message: 'Task not running' };
    }
    try {
      processInfo.process.kill(force ? 'SIGKILL' : 'SIGTERM');
      runningProcesses.delete(id);
      await this._updateTaskStatus(id, 'stopped');
      await this._updateTaskError(id, null);
      return { success: true, message: 'Task stopped' };
    } catch (error) {
      throw new Error(`Failed to stop task: ${error.message}`);
    }
  }

  async stopAllTasks() {
    const stopPromises = Array.from(runningProcesses.keys()).map(id => 
      this.stopTask(id).catch(err => console.error(`Error stopping task ${id}:`, err))
    );
    await Promise.all(stopPromises);
  }

  async deleteAllTasks() {
    await this.stopAllTasks();
    tasksDb.deleteAll();
    cronManager.removeAllTasks();
    await errorLogger.clearLogs();
    return { success: true, message: 'All tasks deleted' };
  }

  getTaskStatus(id) {
    const processInfo = runningProcesses.get(id);
    if (!processInfo) return { running: false, uptime: 0, currentFileIndex: 0 };
    const uptime = Math.floor((Date.now() - processInfo.startTime) / 1000);
    return { running: true, uptime, currentFileIndex: processInfo.currentFileIndex || 0 };
  }

  _buildFFmpegArgs(task, rtspUrl) {
    const args = [];
    
    // Add verbose logging to track file reading in playlists
    // With -v verbose, FFmpeg logs "Opening 'filename' for reading" when it starts each file
    // This allows us to track which file is currently playing in concat mode
    args.push('-v', 'debug');
    
    if (task.loop) args.push('-stream_loop', '-1');
    if (task.seekTime && task.seekTime !== '00:00:00') args.push('-ss', task.seekTime);
    if (task.files.length === 1) {
      args.push('-re', '-i', task.files[0]);
    } else {
      const fs = require('fs');
      const concatFilePath = `/tmp/concat_${task.id}.txt`;
      const concatContent = task.files.map(f => `file '${f}'`).join('\n');
      fs.writeFileSync(concatFilePath, concatContent, 'utf8');
      args.push('-re', '-f', 'concat', '-safe', '0', '-i', concatFilePath);
    }
    args.push('-c', 'copy', '-f', 'rtsp', '-rtsp_transport', 'tcp');
    args.push(rtspUrl);
    return args;
  }

  async _updateTaskStatus(id, status, activeFile = null) {
    const updates = { status };
    if (activeFile) updates.activeFile = activeFile;
    if (status === 'stopped') {
      updates.activeFile = null;
      updates.uptime = 0;
    }
    return tasksDb.update(id, updates);
  }

  async _updateTaskError(id, error) {
    tasksDb.update(id, { error });
  }
}

module.exports = new TaskController();
