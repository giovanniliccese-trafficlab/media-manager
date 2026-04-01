const { exec, spawn } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class ProcessUtils {
  async killProcess(pid, signal = 'SIGTERM') {
    try {
      process.kill(pid, signal);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async findProcessByName(name) {
    try {
      const { stdout } = await execPromise(`ps aux | grep "${name}" | grep -v grep`);
      const lines = stdout.trim().split('\n');
      return lines.map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          pid: parseInt(parts[1]),
          cpu: parseFloat(parts[2]),
          mem: parseFloat(parts[3]),
          command: parts.slice(10).join(' ')
        };
      });
    } catch (error) {
      return [];
    }
  }

  async getProcessInfo(pid) {
    try {
      const { stdout } = await execPromise(`ps -p ${pid} -o pid,ppid,user,%cpu,%mem,etime,command`);
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) return null;
      
      const data = lines[1].trim().split(/\s+/);
      return {
        pid: parseInt(data[0]),
        ppid: parseInt(data[1]),
        user: data[2],
        cpu: parseFloat(data[3]),
        mem: parseFloat(data[4]),
        etime: data[5],
        command: data.slice(6).join(' ')
      };
    } catch (error) {
      return null;
    }
  }

  spawnDetached(command, args, options = {}) {
    return spawn(command, args, {
      ...options,
      detached: true,
      stdio: 'ignore'
    });
  }
}

module.exports = new ProcessUtils();