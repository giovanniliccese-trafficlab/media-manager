const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const fileUtils = require('../utils/fileUtils');

// Get all tasks
router.get('/', async (req, res, next) => {
  try {
    console.log('[API /tasks] 📡 Fetching all tasks...');
    const tasks = await taskController.getTasks();
    console.log(`[API /tasks] ✅ Got ${tasks.length} tasks from controller`);
    
    const monitoringController = require('../controllers/monitoringController');
    const config = require('../../data/config.json');
    
    // Get MediaMTX paths to count clients
    console.log('[API /tasks] 📡 Fetching MediaMTX paths...');
    let paths = { items: [] };
    try {
      paths = await monitoringController.getMediaMTXPaths();
      console.log(`[API /tasks] ✅ Got ${paths.items ? paths.items.length : 0} paths from MediaMTX`);
      
      if (paths.items && paths.items.length > 0) {
        paths.items.forEach(path => {
          console.log(`[API /tasks]   - Path: ${path.name}, Readers: ${path.readers ? path.readers.length : 0}`);
          if (path.readers && path.readers.length > 0) {
            path.readers.forEach((reader, idx) => {
              console.log(`[API /tasks]     Reader ${idx + 1}: ${JSON.stringify(reader)}`);
            });
          }
        });
      }
    } catch (err) {
      console.error('[API /tasks] ❌ Could not get MediaMTX paths:', err.message);
    }
    
    // Add current status info and connected clients
    const tasksWithStatus = tasks.map(task => {
      const status = taskController.getTaskStatus(task.id);
      let connectedClients = 0;
      
      console.log(`[API /tasks] 🔍 Processing task: ${task.name} (${task.id})`);
      console.log(`[API /tasks]   Status: ${task.status}`);
      
      // Find matching path in MediaMTX
      if (task.status === 'running' && paths.items) {
        const pathInfo = paths.items.find(p => p.name === task.name);
        if (pathInfo) {
          console.log(`[API /tasks]   ✅ Found matching MediaMTX path for ${task.name}`);
          if (pathInfo.readers) {
            connectedClients = pathInfo.readers.length;
            console.log(`[API /tasks]   👥 Readers count: ${connectedClients}`);
          } else {
            console.log(`[API /tasks]   ℹ️ No readers array in path info`);
          }
        } else {
          console.log(`[API /tasks]   ⚠️ No matching MediaMTX path found for ${task.name}`);
        }
      } else {
        if (task.status !== 'running') {
          console.log(`[API /tasks]   ℹ️ Task not running, skipping client count`);
        }
      }
      
      // Ensure URLs are correct
      let serverIp = config.server?.ip;
      if (!serverIp || serverIp === '') {
        serverIp = 'localhost';
      }
      
      // Fix URLs if not set correctly
      if (!task.rtspUrl || !task.hlsUrl) {
        task.rtspUrl = `rtsp://${serverIp}:${config.mediamtx?.rtspPort || 554}/${task.name}`;
        task.hlsUrl = `http://${serverIp}:${config.mediamtx?.hlsPort || 8888}/${task.name}`;
      }
      
      const result = { ...task, ...status, connectedClients };
      console.log(`[API /tasks]   📤 Returning task with connectedClients: ${connectedClients}`);
      return result;
    });
    
    console.log('[API /tasks] ✅ Sending response with tasks');
    res.json(tasksWithStatus);
  } catch (error) {
    console.error('[API /tasks] ❌ Error:', error);
    next(error);
  }
});

// Get single task
router.get('/:id', async (req, res, next) => {
  try {
    const task = await taskController.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const status = taskController.getTaskStatus(task.id);
    res.json({ ...task, ...status });
  } catch (error) {
    next(error);
  }
});

// Create new task
router.post('/', async (req, res, next) => {
  try {
    const task = await taskController.createTask(req.body);
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

// Update task
router.put('/:id', async (req, res, next) => {
  try {
    const task = await taskController.updateTask(req.params.id, req.body);
    res.json(task);
  } catch (error) {
    next(error);
  }
});

// Delete task
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await taskController.deleteTask(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Start task
router.post('/:id/start', async (req, res, next) => {
  try {
    const force = req.body.force === true;
    const result = await taskController.startTask(req.params.id, force);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Stop task
router.post('/:id/stop', async (req, res, next) => {
  try {
    const force = req.body.force === true;
    const result = await taskController.stopTask(req.params.id, force);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Delete all tasks
router.delete('/', async (req, res, next) => {
  try {
    const result = await taskController.deleteAllTasks();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Browse files
router.get('/files/browse', async (req, res, next) => {
  try {
    const dirPath = req.query.path || '/mnt';
    const files = await fileUtils.listDirectory(dirPath, ['.mp4', '.mkv', '.avi', '.mov', '.ts']);
    res.json({ path: dirPath, files });
  } catch (error) {
    next(error);
  }
});

// Get mount points
router.get('/files/mounts', async (req, res, next) => {
  try {
    const mounts = await fileUtils.listMountPoints();
    res.json(mounts);
  } catch (error) {
    next(error);
  }
});

// Check file path
router.post('/files/check', async (req, res, next) => {
  try {
    const { path } = req.body;
    const result = await fileUtils.checkPath(path);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get video info
router.post('/files/info', async (req, res, next) => {
  try {
    const { path } = req.body;
    const info = await fileUtils.getVideoInfo(path);
    res.json(info);
  } catch (error) {
    next(error);
  }
});

// Debug endpoint - list scheduled cron jobs
router.get('/cron/list', async (req, res, next) => {
  try {
    const cronManager = require('../utils/cronManager');
    const scheduled = cronManager.getScheduledTasks();
    
    cronManager.listActiveCrons();
    
    res.json({
      count: scheduled.length,
      tasks: scheduled
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;