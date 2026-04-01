// Dashboard Controller
const Dashboard = {
  async init() {
    await this.loadSystemLoad();
    await this.loadMediaMTXStatus();
    await this.loadTasks();
  },

  async refresh() {
    await this.loadSystemLoad();
    await this.loadMediaMTXStatus();
    await this.refreshTasksList();
  },

  async refreshTasksList() {
    try {
      const tasks = await App.apiCall('/api/tasks');
      const tasksList = document.getElementById('tasks-list');
      
      if (tasks.length === 0) {
        tasksList.innerHTML = '<p class="text-muted">No tasks configured</p>';
        return;
      }
      
      // Update only values, not entire HTML
      tasks.forEach(task => {
        const existingItem = tasksList.querySelector(`[data-task-id="${task.id}"]`);
        if (!existingItem) {
          // Task doesn't exist, need full reload
          this.loadTasks();
          return;
        }
        
        // Update status badge
        const statusBadge = existingItem.querySelector('.task-status-badge');
        if (statusBadge) {
          statusBadge.className = `badge task-status-badge ${task.status === 'running' ? 'bg-success' : 'bg-secondary'}`;
          statusBadge.textContent = task.status === 'running' ? 'Running' : 'Stopped';
        }
        
        // Update uptime
        const uptimeText = existingItem.querySelector('.task-uptime');
        if (uptimeText) {
          if (task.status === 'running') {
            uptimeText.textContent = `Uptime: ${Utils.formatDuration(task.uptime || 0)}`;
            uptimeText.classList.remove('d-none');
          } else {
            uptimeText.classList.add('d-none');
          }
        }
        
        // Update active file
        const fileText = existingItem.querySelector('.task-file');
        if (fileText) {
          fileText.textContent = task.activeFile || task.files[0] || 'N/A';
        }
        
        // Update icon
        const icon = existingItem.querySelector('.task-icon');
        if (icon) {
          if (task.status === 'running') {
            icon.className = 'bi bi-play-fill text-success fs-4 task-icon';
          } else {
            icon.className = 'bi bi-stop-fill text-secondary fs-4 task-icon';
          }
        }
      });
      
    } catch (error) {
      Logger.error('Error refreshing tasks:', error);
    }
  },

  async loadSystemLoad() {
    try {
      const data = await App.apiCall('/api/monitoring/load');
      
      // Update CPU
      const cpuPercent = Math.round(data.cpu.currentLoad);
      const cpuProgress = document.getElementById('cpu-progress');
      cpuProgress.style.width = `${cpuPercent}%`;
      cpuProgress.textContent = `${cpuPercent}%`;
      cpuProgress.className = `progress-bar ${this.getProgressColor(cpuPercent)}`;
      
      // Update RAM
      const ramPercent = Math.round(parseFloat(data.memory.usedPercent));
      const ramProgress = document.getElementById('ram-progress');
      ramProgress.style.width = `${ramPercent}%`;
      ramProgress.textContent = `${ramPercent}%`;
      ramProgress.className = `progress-bar ${this.getProgressColor(ramPercent)}`;
      
      // Update GPU
      const gpuPercent = Math.round(data.gpu.utilizationGpu || 0);
      const gpuProgress = document.getElementById('gpu-progress');
      gpuProgress.style.width = `${gpuPercent}%`;
      gpuProgress.textContent = gpuPercent > 0 ? `${gpuPercent}%` : 'N/A';
      gpuProgress.className = `progress-bar ${this.getProgressColor(gpuPercent)}`;
      
    } catch (error) {
      Logger.error('Error loading system load:', error);
    }
  },

  async loadMediaMTXStatus() {
    try {
      const data = await App.apiCall('/api/monitoring/mediamtx');
      const statusEl = document.getElementById('mediamtx-status');
      
      if (data.running) {
        statusEl.className = 'progress-bar bg-success';
        statusEl.textContent = 'Running';
      } else {
        statusEl.className = 'progress-bar bg-danger';
        statusEl.textContent = 'Stopped';
      }
    } catch (error) {
      const statusEl = document.getElementById('mediamtx-status');
      statusEl.className = 'progress-bar bg-danger';
      statusEl.textContent = 'Error';
    }
  },

  async loadTasks() {
    try {
      const tasks = await App.apiCall('/api/tasks');
      const tasksList = document.getElementById('tasks-list');
      
      if (tasks.length === 0) {
        tasksList.innerHTML = '<p class="text-muted">No tasks configured</p>';
        return;
      }
      
      tasksList.innerHTML = tasks.map(task => `
        <div class="list-group-item" data-task-id="${task.id}">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <h6 class="mb-1">${this.escapeHtml(task.name)}</h6>
              <small class="text-muted d-block">
                <span class="badge task-status-badge ${task.status === 'running' ? 'bg-success' : 'bg-secondary'}">
                  ${task.status === 'running' ? 'Running' : 'Stopped'}
                </span>
                <span class="task-uptime ${task.status === 'running' ? '' : 'd-none'}"> - Uptime: ${Utils.formatDuration(task.uptime || 0)}</span>
              </small>
              <small class="text-muted d-block">File: <span class="task-file">${this.escapeHtml(task.activeFile || task.files[0] || 'N/A')}</span></small>
              <small class="text-muted d-block font-monospace">RTSP: ${this.escapeHtml(task.rtspUrl || 'N/A')}</small>
            </div>
            <div>
              <i class="${task.status === 'running' ? 'bi bi-play-fill text-success' : 'bi bi-stop-fill text-secondary'} fs-4 task-icon"></i>
            </div>
          </div>
        </div>
      `).join('');
      
    } catch (error) {
      Logger.error('Error loading tasks:', error);
    }
  },

  getProgressColor(percent) {
    if (percent < 50) return 'bg-success';
    if (percent < 75) return 'bg-warning';
    return 'bg-danger';
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};