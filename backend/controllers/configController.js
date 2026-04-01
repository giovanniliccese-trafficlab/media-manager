const path = require('path');
const fs = require('fs').promises;
const fileUtils = require('../utils/fileUtils');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const CONFIG_FILE = path.join(__dirname, '../../data/config.json');
const MEDIAMTX_CONFIG_FILE = path.join(__dirname, '../../data/mediamtx.yml');

class ConfigController {
  async getConfig() {
    try {
      const config = await fileUtils.readJSON(CONFIG_FILE);
      // Read current MediaMTX settings from YAML
      const mediamtxSettings = await this.readMediaMTXConfig();
      if (mediamtxSettings) {
        config.mediamtx = { ...config.mediamtx, ...mediamtxSettings };
      }
      return config;
    } catch (error) {
      return this.getDefaultConfig();
    }
  }

  async readMediaMTXConfig() {
    try {
      const yamlContent = await fs.readFile(MEDIAMTX_CONFIG_FILE, 'utf8');
      const settings = {};
      
      const rtspMatch = yamlContent.match(/rtspAddress:\s*:(\d+)/);
      if (rtspMatch) settings.rtspPort = parseInt(rtspMatch[1]);
      
      const hlsMatch = yamlContent.match(/hlsAddress:\s*:(\d+)/);
      if (hlsMatch) settings.hlsPort = parseInt(hlsMatch[1]);
      
      const apiMatch = yamlContent.match(/apiAddress:\s*:(\d+)/);
      if (apiMatch) settings.apiPort = parseInt(apiMatch[1]);
      
      const userMatch = yamlContent.match(/publishUser:\s*(.+)/);
      if (userMatch) settings.username = userMatch[1].trim();
      
      const passMatch = yamlContent.match(/publishPass:\s*(.+)/);
      if (passMatch) settings.password = passMatch[1].trim();
      
      return settings;
    } catch (error) {
      return null;
    }
  }

  async updateConfig(updates) {
    const current = await this.getConfig();
    const updated = this.deepMerge(current, updates);
    await fileUtils.writeJSON(CONFIG_FILE, updated);
    
    // Update MediaMTX config if mediamtx settings changed
    if (updates.mediamtx) {
      await this.updateMediaMTXConfig(updates.mediamtx);
    }
    
    return updated;
  }

  async updateMediaMTXConfig(mediamtxSettings) {
    try {
      let yamlContent = await fs.readFile(MEDIAMTX_CONFIG_FILE, 'utf8');

      console.log('='.repeat(80));
      console.log('[MEDIAMTX CONFIG] Updating MediaMTX configuration');
      console.log(`Settings to apply:`, JSON.stringify(mediamtxSettings, null, 2));
      console.log('='.repeat(80));

      // Update ports
      if (mediamtxSettings.rtspPort) {
        yamlContent = yamlContent.replace(/rtspAddress:\s*:\d+/g, `rtspAddress: :${mediamtxSettings.rtspPort}`);
        console.log(`[MEDIAMTX CONFIG] RTSP Port set to: ${mediamtxSettings.rtspPort}`);
      }
      if (mediamtxSettings.hlsPort) {
        yamlContent = yamlContent.replace(/hlsAddress:\s*:\d+/g, `hlsAddress: :${mediamtxSettings.hlsPort}`);
        console.log(`[MEDIAMTX CONFIG] HLS Port set to: ${mediamtxSettings.hlsPort}`);
      }
      if (mediamtxSettings.apiPort) {
        yamlContent = yamlContent.replace(/apiAddress:\s*:\d+/g, `apiAddress: :${mediamtxSettings.apiPort}`);
        console.log(`[MEDIAMTX CONFIG] API Port set to: ${mediamtxSettings.apiPort}`);
      }

      // Update authentication
      const username = mediamtxSettings.username || '';
      const password = mediamtxSettings.password || '';
      
      yamlContent = yamlContent.replace(/publishUser:\s*.*/g, `publishUser: ${username}`);
      yamlContent = yamlContent.replace(/publishPass:\s*.*/g, `publishPass: ${password}`);
      yamlContent = yamlContent.replace(/readUser:\s*.*/g, `readUser: ${username}`);
      yamlContent = yamlContent.replace(/readPass:\s*.*/g, `readPass: ${password}`);
      
      console.log(`[MEDIAMTX CONFIG] Authentication: ${username ? 'Enabled' : 'Disabled'}`);

      await fs.writeFile(MEDIAMTX_CONFIG_FILE, yamlContent, 'utf8');
      console.log(`[MEDIAMTX CONFIG] Configuration file written successfully`);
      
      // Restart MediaMTX container to apply changes
      try {
        const restartCommand = 'docker restart mediamtx';
        console.log('='.repeat(80));
        console.log(`[DOCKER COMMAND] Executing: ${restartCommand}`);
        console.log('='.repeat(80));
        await execPromise(restartCommand);
        console.log('[DOCKER SUCCESS] MediaMTX container restarted successfully');
      } catch (err) {
        console.error('[DOCKER ERROR] Could not restart MediaMTX container:', err.message);
      }
      
      return { success: true, message: 'MediaMTX configuration updated. Container restarted.' };
    } catch (error) {
      console.error('[MEDIAMTX CONFIG ERROR] Error updating MediaMTX config:', error);
      throw error;
    }
  }

  async controlMediaMTX(action) {
    try {
      let command;
      switch(action) {
        case 'start':
          command = 'docker start mediamtx';
          break;
        case 'stop':
          command = 'docker stop mediamtx';
          break;
        case 'restart':
          command = 'docker restart mediamtx';
          break;
        default:
          throw new Error('Invalid action');
      }
      
      console.log('='.repeat(80));
      console.log(`[DOCKER COMMAND] Action: ${action}`);
      console.log(`Full command: ${command}`);
      console.log('='.repeat(80));
      
      const { stdout, stderr } = await execPromise(command);
      
      console.log(`[DOCKER SUCCESS] MediaMTX ${action}ed successfully`);
      if (stdout) console.log('[DOCKER STDOUT]:', stdout.trim());
      if (stderr) console.log('[DOCKER STDERR]:', stderr.trim());
      
      return { success: true, message: `MediaMTX ${action}ed successfully` };
    } catch (error) {
      console.error(`[DOCKER ERROR] Failed to ${action} MediaMTX:`, error.message);
      throw new Error(`Failed to ${action} MediaMTX: ${error.message}`);
    }
  }

  getDefaultConfig() {
    return {
      server: {
        name: 'Media Manager',
        ip: '',
        timezone: 'Europe/Rome'
      },
      mediamtx: {
        rtspPort: 554,
        hlsPort: 8888,
        apiPort: 9997,
        username: '',
        password: ''
      },
      dashboard: {
        logo: '',
        theme: 'auto',
        autoRefresh: true,
        refreshInterval: 5
      }
    };
  }

  deepMerge(target, source) {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}

module.exports = new ConfigController();