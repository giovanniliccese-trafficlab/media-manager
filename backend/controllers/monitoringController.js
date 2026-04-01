const si = require('systeminformation');
const monitoringDb = require('../db/monitoringDb');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '../../data/config.json');

class MonitoringController {
  constructor() {
    this.collectionInterval = null;
    this.currentIntervalSeconds = 60;
  }

  getConfiguredInterval() {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      const val = parseInt(config.monitoring?.collectionInterval);
      if (!isNaN(val) && val >= 1 && val <= 60) return val;
    } catch (e) {}
    return 60;
  }

  startCollection() {
    if (this.collectionInterval) return;
    this.currentIntervalSeconds = this.getConfiguredInterval();
    console.log(`[MONITORING] Starting metrics collection every ${this.currentIntervalSeconds}s`);
    this.collectAndSave();
    this.collectionInterval = setInterval(() => {
      this.collectAndSave();
    }, this.currentIntervalSeconds * 1000);
  }

  stopCollection() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
      console.log('[MONITORING] Collection stopped');
    }
  }

  restartCollection() {
    this.stopCollection();
    this.startCollection();
  }

  async collectAndSave() {
    try {
      const data = await this.getCurrentLoad();
      const cpu = Math.round(data.cpu.currentLoad);
      const ram = Math.round(parseFloat(data.memory.usedPercent));
      const gpu = Math.round(data.gpu.utilizationGpu || 0);
      monitoringDb.save(cpu, ram, gpu);
      console.log(`[MONITORING] Saved: CPU=${cpu}% RAM=${ram}% GPU=${gpu}%`);
    } catch (error) {
      console.error('[MONITORING] Error collecting metrics:', error);
    }
  }

  async getSystemInfo() {
    try {
      const [cpu, mem, time, osInfo, networkInterfaces] = await Promise.all([
        si.cpu(), si.mem(), si.time(), si.osInfo(), si.networkInterfaces()
      ]);
      return {
        cpu: { manufacturer: cpu.manufacturer, brand: cpu.brand, speed: cpu.speed, cores: cpu.cores, physicalCores: cpu.physicalCores },
        memory: { total: mem.total, free: mem.free, used: mem.used },
        os: { platform: osInfo.platform, distro: osInfo.distro, release: osInfo.release, arch: osInfo.arch, hostname: osInfo.hostname },
        time: { current: time.current, uptime: time.uptime, timezone: time.timezone },
        network: networkInterfaces.map(ni => ({ iface: ni.iface, ip4: ni.ip4, ip6: ni.ip6, mac: ni.mac }))
      };
    } catch (error) { console.error('Error getting system info:', error); throw error; }
  }

  async getCurrentLoad() {
    try {
      const [cpuLoad, mem, graphics] = await Promise.all([si.currentLoad(), si.mem(), si.graphics()]);
      const gpuLoad = graphics.controllers.map(gpu => ({
        model: gpu.model, vendor: gpu.vendor,
        utilizationGpu: gpu.utilizationGpu || 0, memoryUsed: gpu.memoryUsed || 0, memoryTotal: gpu.memoryTotal || 0
      }));
      const memUsed = mem.total - mem.available;
      return {
        cpu: { currentLoad: cpuLoad.currentLoad, avgLoad: cpuLoad.avgLoad, cpus: cpuLoad.cpus.map(c => ({ load: c.load })) },
        memory: { total: mem.total, free: mem.free, available: mem.available, used: memUsed, usedPercent: (memUsed / mem.total * 100).toFixed(2) },
        gpu: gpuLoad.length > 0 ? gpuLoad[0] : { model: 'N/A', vendor: 'N/A', utilizationGpu: 0, memoryUsed: 0, memoryTotal: 0 },
        timestamp: new Date().toISOString()
      };
    } catch (error) { console.error('Error getting current load:', error); throw error; }
  }

  async getHistoricalData(hours = 24) {
    const rows = monitoringDb.getHistory(hours);
    return { hours, count: rows.length, samples: rows.map(r => ({ timestamp: r.timestamp, cpu: r.cpu, ram: r.ram, gpu: r.gpu })) };
  }

  async getMediaMTXStatus() {
    try {
      const http = require('http');
      const config = require('../../data/config.json');
      return new Promise((resolve) => {
        const req = http.get(`http://mediamtx:${config.mediamtx?.apiPort || 9997}/v3/info`, (res) => {
          let data = '';
          res.on('data', c => { data += c; });
          res.on('end', () => {
            try { resolve({ status: 'running', running: true, info: JSON.parse(data), timestamp: new Date().toISOString() }); }
            catch (e) { resolve({ status: 'running', running: true, timestamp: new Date().toISOString() }); }
          });
        });
        req.on('error', () => resolve({ status: 'stopped', running: false, timestamp: new Date().toISOString() }));
        req.setTimeout(5000, () => { req.destroy(); resolve({ status: 'timeout', running: false, timestamp: new Date().toISOString() }); });
      });
    } catch (e) { return { status: 'error', running: false, error: e.message, timestamp: new Date().toISOString() }; }
  }

  async getMediaMTXPaths() {
    try {
      const http = require('http');
      const config = require('../../data/config.json');
      return new Promise((resolve) => {
        const req = http.get(`http://mediamtx:${config.mediamtx?.apiPort || 9997}/v3/paths/list`, (res) => {
          let data = '';
          res.on('data', c => { data += c; });
          res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({ items: [] }); } });
        });
        req.on('error', () => resolve({ items: [] }));
        req.setTimeout(5000, () => { req.destroy(); resolve({ items: [] }); });
      });
    } catch (e) { return { items: [] }; }
  }
}

module.exports = new MonitoringController();
