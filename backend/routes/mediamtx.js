const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

// Get MediaMTX status
router.get('/status', async (req, res, next) => {
  try {
    const config = require('../../data/config.json');
    const http = require('http');
    
    const status = await new Promise((resolve) => {
      const req = http.get(`http://mediamtx:${config.mediamtx?.apiPort || 9997}/v3/config/get`, (response) => {
        resolve({
          running: response.statusCode === 200,
          status: response.statusCode === 200 ? 'running' : 'error'
        });
      });

      req.on('error', () => {
        resolve({ running: false, status: 'stopped' });
      });

      req.setTimeout(5000, () => {
        req.destroy();
        resolve({ running: false, status: 'timeout' });
      });
    });

    res.json(status);
  } catch (error) {
    next(error);
  }
});

// Get MediaMTX paths (streams)
router.get('/paths', async (req, res, next) => {
  try {
    const config = require('../../data/config.json');
    const http = require('http');
    
    const paths = await new Promise((resolve, reject) => {
      const req = http.get(`http://mediamtx:${config.mediamtx?.apiPort || 9997}/v3/paths/list`, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            resolve({ items: [] });
          }
        });
      });

      req.on('error', (error) => {
        resolve({ items: [], error: error.message });
      });

      req.setTimeout(5000, () => {
        req.destroy();
        resolve({ items: [], error: 'timeout' });
      });
    });

    res.json(paths);
  } catch (error) {
    next(error);
  }
});

// Start MediaMTX
router.post('/start', async (req, res, next) => {
  try {
    const result = await configController.controlMediaMTX('start');
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop MediaMTX
router.post('/stop', async (req, res, next) => {
  try {
    const result = await configController.controlMediaMTX('stop');
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Restart MediaMTX
router.post('/restart', async (req, res, next) => {
  try {
    const result = await configController.controlMediaMTX('restart');
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;