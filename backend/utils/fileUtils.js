const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class FileUtils {
  async readJSON(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  async writeJSON(filePath, data) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  async listDirectory(dirPath, extensions = null) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const result = [];

      // Add parent directory option if not root
      if (dirPath !== '/' && dirPath !== '/mnt') {
        const parentPath = path.dirname(dirPath);
        result.push({
          name: '..',
          path: parentPath,
          type: 'directory',
          isDirectory: true,
          isParent: true
        });
      }

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          result.push({
            name: entry.name,
            path: fullPath,
            type: 'directory',
            isDirectory: true
          });
        } else if (entry.isFile()) {
          if (!extensions || extensions.includes(path.extname(entry.name).toLowerCase())) {
            const stats = await fs.stat(fullPath);
            result.push({
              name: entry.name,
              path: fullPath,
              type: 'file',
              isDirectory: false,
              size: stats.size,
              modified: stats.mtime
            });
          }
        }
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to list directory: ${error.message}`);
    }
  }

  async listMountPoints() {
    try {
      const mounts = [];
      
      // List /mnt directory
      try {
        const mntEntries = await fs.readdir('/mnt', { withFileTypes: true });
        for (const entry of mntEntries) {
          if (entry.isDirectory()) {
            mounts.push({
              path: `/mnt/${entry.name}`,
              name: entry.name,
              type: 'local'
            });
          }
        }
      } catch (err) {
        console.log('No /mnt directory or empty');
      }

      // List mounted SMB shares
      try {
        const { stdout } = await execPromise('mount | grep cifs');
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const match = line.match(/^(.+?)\s+on\s+(.+?)\s+type/);
          if (match) {
            mounts.push({
              path: match[2],
              name: path.basename(match[2]),
              type: 'smb',
              source: match[1]
            });
          }
        }
      } catch (err) {
        // No SMB mounts
      }

      return mounts;
    } catch (error) {
      console.error('Error listing mount points:', error);
      return [];
    }
  }

  async checkPath(filePath) {
    try {
      await fs.access(filePath);
      const stats = await fs.stat(filePath);
      return {
        exists: true,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message
      };
    }
  }

  async getVideoInfo(filePath) {
    try {
      const { stdout } = await execPromise(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
      );
      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(`Failed to get video info: ${error.message}`);
    }
  }

  normalizeWindowsPath(windowsPath) {
    // Convert //SMB/share/path to /mnt/smb/share/path or appropriate Linux path
    if (windowsPath.startsWith('//') || windowsPath.startsWith('\\\\')) {
      return windowsPath.replace(/\\/g, '/').replace(/^\/\//, '/mnt/smb/');
    }
    return windowsPath;
  }
}

module.exports = new FileUtils();