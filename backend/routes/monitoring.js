const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const monitoringController = require('../controllers/monitoringController');

const CONFIG_FILE = path.join(__dirname, '../../data/config.json');

router.get('/system', async (req, res, next) => {
  try { res.json(await monitoringController.getSystemInfo()); } catch (e) { next(e); }
});

router.get('/load', async (req, res, next) => {
  try { res.json(await monitoringController.getCurrentLoad()); } catch (e) { next(e); }
});

router.get('/history', async (req, res, next) => {
  try {
    const hours = Math.min(parseInt(req.query.hours) || 24, 24);
    res.json(await monitoringController.getHistoricalData(hours));
  } catch (e) { next(e); }
});

// Update collection interval and restart collector
router.put('/interval', async (req, res, next) => {
  try {
    const seconds = parseInt(req.body.interval);
    if (isNaN(seconds) || seconds < 1 || seconds > 60) {
      return res.status(400).json({ error: 'Interval must be between 1 and 60 seconds' });
    }
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(raw);
    if (!config.monitoring) config.monitoring = {};
    config.monitoring.collectionInterval = seconds;
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    monitoringController.restartCollection();
    console.log(`[MONITORING] Collection interval updated to ${seconds}s`);
    res.json({ success: true, interval: seconds });
  } catch (e) { next(e); }
});

router.get('/mediamtx', async (req, res, next) => {
  try { res.json(await monitoringController.getMediaMTXStatus()); } catch (e) { next(e); }
});

module.exports = router;
