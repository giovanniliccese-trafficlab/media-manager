const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

const LOGS_FILE = path.join(__dirname, '../../data/error-logs.json');
const logger = require('../utils/logger');

// ===== New app logs endpoints (with type filtering) =====

// Get app logs with optional type filter
router.get('/', async (req, res, next) => {
  try {
    const type = req.query.type || 'all';
    const limit = parseInt(req.query.limit) || 100;
    const logs = await logger.getAppLogs(type, limit);
    res.json({ logs, count: logs.length, type });
  } catch (error) {
    next(error);
  }
});

// Clear all logs (both error and app logs)
router.delete('/', async (req, res, next) => {
  try {
    await logger.clearLogs();
    res.json({ success: true, message: 'All logs cleared' });
  } catch (error) {
    next(error);
  }
});

// Clear logs for specific task
router.delete('/:taskId', async (req, res, next) => {
  try {
    await logger.clearLogs(req.params.taskId);
    res.json({ success: true, message: 'Task logs cleared' });
  } catch (error) {
    next(error);
  }
});

// ===== Legacy error logs endpoints (backward compatible) =====

// Get all error logs
router.get('/errors', async (req, res, next) => {
  try {
    const logs = await getErrorLogs();
    res.json(logs);
  } catch (error) {
    next(error);
  }
});

// Get error logs for specific task
router.get('/errors/:taskId', async (req, res, next) => {
  try {
    const logs = await getErrorLogs();
    const taskLogs = logs.filter(log => log.taskId === req.params.taskId);
    res.json(taskLogs);
  } catch (error) {
    next(error);
  }
});

// Clear all error logs
router.delete('/errors', async (req, res, next) => {
  try {
    await fs.writeFile(LOGS_FILE, JSON.stringify({ logs: [] }, null, 2));
    res.json({ success: true, message: 'All error logs cleared' });
  } catch (error) {
    next(error);
  }
});

// Clear error logs for specific task
router.delete('/errors/:taskId', async (req, res, next) => {
  try {
    const logs = await getErrorLogs();
    const filtered = logs.filter(log => log.taskId !== req.params.taskId);
    await fs.writeFile(LOGS_FILE, JSON.stringify({ logs: filtered }, null, 2));
    res.json({ success: true, message: 'Task error logs cleared' });
  } catch (error) {
    next(error);
  }
});

// Helper function to get error logs
async function getErrorLogs() {
  try {
    const data = await fs.readFile(LOGS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.logs || [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create it
      await fs.writeFile(LOGS_FILE, JSON.stringify({ logs: [] }, null, 2));
      return [];
    }
    throw error;
  }
}

module.exports = router;
