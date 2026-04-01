const express = require('express');
const router = express.Router();
const path = require('path');
const fileUtils = require('../utils/fileUtils');
const multer = require('multer');
const archiver = require('archiver');
const fs = require('fs').promises;

const CONFIG_FILE = path.join(__dirname, '../../data/config.json');
const TASKS_FILE = path.join(__dirname, '../../data/tasks.json');
const BACKUP_DIR = path.join(__dirname, '../../data/backup');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../data/uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// Get configuration
router.get('/', async (req, res, next) => {
  try {
    const config = await fileUtils.readJSON(CONFIG_FILE);
    res.json(config);
  } catch (error) {
    next(error);
  }
});

// Update configuration
router.put('/', async (req, res, next) => {
  try {
    const currentConfig = await fileUtils.readJSON(CONFIG_FILE);
    const updatedConfig = { ...currentConfig, ...req.body };
    await fileUtils.writeJSON(CONFIG_FILE, updatedConfig);
    res.json(updatedConfig);
  } catch (error) {
    next(error);
  }
});

// Upload logo
router.post('/logo', upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const logoPath = `/uploads/${req.file.filename}`;
    const config = await fileUtils.readJSON(CONFIG_FILE);
    config.dashboard.logo = logoPath;
    await fileUtils.writeJSON(CONFIG_FILE, config);

    res.json({ logoPath });
  } catch (error) {
    next(error);
  }
});

// Create backup
router.post('/backup', async (req, res, next) => {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.zip`);

    const output = require('fs').createWriteStream(backupFile);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      res.download(backupFile, `media-manager-backup-${timestamp}.zip`);
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(output);
    
    // Add config files
    archive.file(CONFIG_FILE, { name: 'config.json' });
    archive.file(TASKS_FILE, { name: 'tasks.json' });
    
    // Add mediamtx.yml
    const mediamtxYml = path.join(__dirname, '../../data/mediamtx.yml');
    if (await fs.access(mediamtxYml).then(() => true).catch(() => false)) {
      archive.file(mediamtxYml, { name: 'mediamtx.yml' });
    }
    
    await archive.finalize();
  } catch (error) {
    next(error);
  }
});

// Restore backup
router.post('/restore', upload.single('backup'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No backup file uploaded' });
    }

    const extract = require('extract-zip');
    const tempDir = path.join(__dirname, '../../data/temp-restore');
    
    await fs.mkdir(tempDir, { recursive: true });
    await extract(req.file.path, { dir: tempDir });

    // Restore files
    const configPath = path.join(tempDir, 'config.json');
    const tasksPath = path.join(tempDir, 'tasks.json');
    const mediamtxPath = path.join(tempDir, 'mediamtx.yml');

    if (await fs.access(configPath).then(() => true).catch(() => false)) {
      await fs.copyFile(configPath, CONFIG_FILE);
    }

    if (await fs.access(tasksPath).then(() => true).catch(() => false)) {
      await fs.copyFile(tasksPath, TASKS_FILE);
    }

    if (await fs.access(mediamtxPath).then(() => true).catch(() => false)) {
      const mediamtxDest = path.join(__dirname, '../../data/mediamtx.yml');
      await fs.copyFile(mediamtxPath, mediamtxDest);
    }

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.unlink(req.file.path);

    res.json({ success: true, message: 'Backup restored successfully. Please restart MediaMTX container.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;