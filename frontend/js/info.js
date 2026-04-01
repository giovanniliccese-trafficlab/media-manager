// Minimal Safe Info Controller - Only Logs Management
const InfoManager = {
  chart: null,
  historyData: {
    labels: [],
    cpu: [],
    ram: [],
    gpu: []
  },
  currentLogType: 'all',

  async init() {
    this.setupTabs();
    await this.initServerTab();
    // Only initialize logs - nothing else to avoid DOM errors
    await this.initLogsTab();
  },

  async initLogsTab() {
    this.currentLogType = 'all';
    this.setupLogTypeFilters();
    this.setupLogsRefreshButton();
    await this.loadLogs();
  },

  setupLogTypeFilters() {
    document.querySelectorAll('input[name="logTypeFilter"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.currentLogType = e.target.value;
        this.loadLogs();
      });
    });
  },

  setupLogsRefreshButton() {
    const refreshBtn = document.getElementById('logs-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadLogs());
    }
  },

  async loadLogs() {
    try {
      const container = document.getElementById('error-logs-container');
      if (!container) return;
      
      container.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div> Loading...</div>';
      
      const type = this.currentLogType || 'all';
      const data = await App.apiCall(`/api/logs?type=${type}&limit=200`);
      const logs = data.logs || [];
      
      this.displayLogs(logs, type);
    } catch (error) {
      console.error('Error loading logs:', error);
      const container = document.getElementById('error-logs-container');
      if (container) {
        container.innerHTML = '<div class="alert alert-warning">Could not load logs</div>';
      }
    }
  },

  displayLogs(logs, type) {
    const container = document.getElementById('error-logs-container');
    if (!container) return;
    
    if (!logs || logs.length === 0) {
      container.innerHTML = `<div class="alert alert-info">No ${type === 'all' ? '' : type.replace('_', ' ')} logs found</div>`;
      return;
    }
    
    let html = '<div class="list-group">';
    
    logs.forEach(log => {
      const badgeClass = this.getLogTypeBadgeClass(log.type);
      const iconClass = this.getLogTypeIcon(log.type);
      const date = new Date(log.timestamp);
      const formattedDate = date.toLocaleString('it-IT');
      
      html += `
        <div class="list-group-item list-group-item-action">
          <div class="d-flex w-100 justify-content-between align-items-start">
            <div class="flex-grow-1">
              <span class="badge ${badgeClass} me-2">
                <i class="${iconClass}"></i> ${this.formatLogType(log.type)}
              </span>
              <strong>${this.escapeHtml(log.taskName || 'System')}</strong>
              ${log.fileName ? `<span class="text-muted">→ ${this.escapeHtml(log.fileName)}</span>` : ''}
            </div>
            <small class="text-muted">${formattedDate}</small>
          </div>
          ${this.renderLogDetails(log)}
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
  },

  renderLogDetails(log) {
    switch(log.type) {
      case 'task_complete':
        return `
          <div class="mt-2">
            <small class="text-success">
              <i class="bi bi-check-circle"></i> Completed in ${log.totalDurationFormatted || log.totalDuration + 's'}
              ${log.filesProcessed ? ` | ${log.filesProcessed} files processed` : ''}
            </small>
          </div>
        `;
      
      case 'file_complete':
        return `
          <div class="mt-2">
            <small class="text-muted">
              File ${log.fileIndex}/${log.totalFiles} completed in ${log.durationFormatted || log.duration + 's'}
            </small>
          </div>
        `;
      
      case 'task_start':
        return `
          <div class="mt-2">
            <small class="text-info">
              <i class="bi bi-play-circle"></i> Started with ${log.filesCount} file(s)
              ${log.files && log.files.length > 0 ? '<br>Files: ' + log.files.join(', ') : ''}
            </small>
          </div>
        `;
      
      case 'error':
        return `
          <div class="mt-2">
            <small class="text-danger">
              <i class="bi bi-exclamation-triangle"></i> ${this.escapeHtml(log.message || log.error)}
            </small>
            ${log.stack ? `<details class="mt-1"><summary class="text-muted" style="cursor: pointer;">Stack trace</summary><pre class="small mt-1 mb-0">${this.escapeHtml(log.stack)}</pre></details>` : ''}
          </div>
        `;
      
      case 'task_stopped':
        return `
          <div class="mt-2">
            <small class="text-warning">
              <i class="bi bi-stop-circle"></i> Stopped (${log.reason})
            </small>
          </div>
        `;
      
      case 'file_start':
        return `
          <div class="mt-2">
            <small class="text-secondary">
              <i class="bi bi-file-play"></i> File ${log.fileIndex}/${log.totalFiles} started
            </small>
          </div>
        `;
      
      default:
        return '';
    }
  },

  getLogTypeBadgeClass(type) {
    const classes = {
      'task_complete': 'bg-success',
      'task_start': 'bg-info',
      'file_start': 'bg-secondary',
      'file_complete': 'bg-primary',
      'error': 'bg-danger',
      'task_stopped': 'bg-warning'
    };
    return classes[type] || 'bg-secondary';
  },

  getLogTypeIcon(type) {
    const icons = {
      'task_complete': 'bi-check-circle-fill',
      'task_start': 'bi-play-circle-fill',
      'file_start': 'bi-file-play',
      'file_complete': 'bi-file-earmark-check',
      'error': 'bi-exclamation-triangle-fill',
      'task_stopped': 'bi-stop-circle-fill'
    };
    return icons[type] || 'bi-info-circle';
  },

  formatLogType(type) {
    const formats = {
      'task_complete': 'Completed',
      'task_start': 'Started',
      'file_start': 'File Start',
      'file_complete': 'File Done',
      'error': 'Error',
      'task_stopped': 'Stopped'
    };
    return formats[type] || type;
  },

  async refresh() {
    const activeTab = document.querySelector('#info-tabs .nav-link.active');
    if (!activeTab) return;
    
    const tabId = activeTab.getAttribute('data-bs-target');
    
    switch(tabId) {
      case '#info-server-tab':
        await this.refreshServerTab();
        break;
    }
  },

  setupTabs() {
    document.querySelectorAll('#info-tabs .nav-link').forEach(tab => {
      tab.addEventListener('shown.bs.tab', async (e) => {
        const tabId = e.target.getAttribute('data-bs-target');
        
        switch(tabId) {
          case '#info-server-tab':
            await this.initServerTab();
            break;
          case '#info-config-tab':
            await this.initConfigTab();
            break;
          case '#info-logs-tab':
            await this.initLogsTab();
            break;
          case '#info-about-tab':
            break;
        }
      });
    });
  },

  // ========== SERVER TAB ==========
  async initServerTab() {
    this.initChart();
    await this.loadSystemInfo();
    await this.loadHistory();   // ← loads 24h from SQLite
    this.startTimeUpdate();
  },

  async refreshServerTab() {
    await this.loadSystemInfo();
    await this.appendLivePoint(); // ← on auto-refresh, only add latest point
  },

  initChart() {
    const ctx = document.getElementById('resource-chart');
    if (!ctx) return;
    if (this.chart) return;

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'CPU %',
            data: [],
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            tension: 0.4,
            pointRadius: 0,       // Hide dots for dense historical data
            borderWidth: 1.5
          },
          {
            label: 'RAM %',
            data: [],
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 1.5
          },
          {
            label: 'GPU %',
            data: [],
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: false,          // Disable animation for smooth live updates
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (value) => value + '%'
            }
          },
          x: {
            display: true,
            ticks: {
              maxTicksLimit: 12,   // Show ~12 labels max to avoid crowding
              maxRotation: 0
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        }
      }
    });
  },

  async loadSystemInfo() {
    try {
      const data = await App.apiCall('/api/monitoring/system');
      this.displaySystemInfo(data);
    } catch (error) {
      console.error('Error loading system info:', error);
    }
  },

  formatUptime(seconds) {
    const totalSecs = Math.floor(seconds); // Rimuove decimali
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    
    const parts = [];
    if (days > 0) parts.push(`${days} giorn${days === 1 ? 'o' : 'i'}`);
    if (hours > 0) parts.push(`${hours} or${hours === 1 ? 'a' : 'e'}`);
    if (minutes > 0) parts.push(`${minutes} minut${minutes === 1 ? 'o' : 'i'}`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} second${secs === 1 ? 'o' : 'i'}`);
    
    return parts.join(', ');
  },

  displaySystemInfo(data) {
    const container = document.getElementById('system-info');
    if (!container) return;

    container.innerHTML = `
      <table class="table table-sm">
        <tbody>
          <tr>
            <th style="width: 30%">Hostname</th>
            <td>${this.escapeHtml(data.os?.hostname || 'N/A')}</td>
          </tr>
          <tr>
            <th>Platform</th>
            <td>${this.escapeHtml(data.os?.platform || 'N/A')} ${this.escapeHtml(data.os?.distro || '')}</td>
          </tr>
          <tr>
            <th>Architecture</th>
            <td>${this.escapeHtml(data.os?.arch || 'N/A')}</td>
          </tr>
          <tr>
            <th>CPU</th>
            <td>${this.escapeHtml(data.cpu?.brand || 'N/A')} (${data.cpu?.cores || 0} cores)</td>
          </tr>
          <tr>
            <th>Total RAM</th>
            <td>${Utils.formatBytes(data.memory?.total || 0)}</td>
          </tr>
          <tr>
            <th>Uptime</th>
            <td>${this.formatUptime(data.time?.uptime || 0)}</td>
          </tr>
        </tbody>
      </table>
    `;
  },

  startTimeUpdate() {
    const updateTime = async () => {
      try {
        const config = await App.apiCall('/api/config');
        const now = new Date();
        const dateTimeString = now.toLocaleString('it-IT', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: config.server?.timezone || 'Europe/Rome',
          timeZoneName: 'short'
        });
        
        const datetimeEl = document.getElementById('server-datetime');
        const timezoneEl = document.getElementById('server-timezone');
        
        if (datetimeEl) datetimeEl.textContent = dateTimeString;
        if (timezoneEl) timezoneEl.textContent = `Timezone: ${config.server?.timezone || 'Europe/Rome'}`;
      } catch (error) {
        console.error('Error updating time:', error);
      }
    };

    updateTime();
    if (this.timeInterval) clearInterval(this.timeInterval);
    this.timeInterval = setInterval(updateTime, 1000);
  },

  // Load full history from SQLite and populate the chart
  async loadHistory() {
    if (!this.chart) return;
    
    try {
      // Get chart time range from config (in minutes)
      const config = await App.apiCall('/api/config');
      const minutes = config.monitoring?.chartTimeRange || 1440; // default 24h
      const hours = minutes / 60;
      
      const data = await App.apiCall(`/api/monitoring/history?hours=${hours}`);
      const samples = data.samples || [];

      Logger.log(`[INFO] Loaded ${samples.length} historical data points from DB (${minutes} minutes)`);

      // Reset history data
      this.historyData = { labels: [], cpu: [], ram: [], gpu: [] };

      samples.forEach(sample => {
        const label = this.formatTimestamp(sample.timestamp);
        this.historyData.labels.push(label);
        this.historyData.cpu.push(sample.cpu);
        this.historyData.ram.push(sample.ram);
        this.historyData.gpu.push(sample.gpu);
      });

      this.updateChart();
    } catch (error) {
      console.error('Error loading history from DB:', error);
    }
  },

  // Append only the latest live point (called on auto-refresh)
  async appendLivePoint() {
    if (!this.chart) return;
    
    try {
      const data = await App.apiCall('/api/monitoring/load');
      
      const label = new Date().toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit'
      });

      this.historyData.labels.push(label);
      this.historyData.cpu.push(Math.round(data.cpu?.currentLoad || 0));
      this.historyData.ram.push(Math.round(parseFloat(data.memory?.usedPercent || 0)));
      this.historyData.gpu.push(Math.round(data.gpu?.utilizationGpu || 0));

      // Keep max 24h worth of data (1440 minutes)
      const MAX_POINTS = 1440;
      if (this.historyData.labels.length > MAX_POINTS) {
        this.historyData.labels.shift();
        this.historyData.cpu.shift();
        this.historyData.ram.shift();
        this.historyData.gpu.shift();
      }

      this.updateChart();
    } catch (error) {
      console.error('Error appending live point:', error);
    }
  },

  // Format ISO timestamp to HH:mm label
  formatTimestamp(isoString) {
    try {
      return new Date(isoString).toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '--:--';
    }
  },

  updateChart() {
    if (!this.chart) return;
    this.chart.data.labels = this.historyData.labels;
    this.chart.data.datasets[0].data = this.historyData.cpu;
    this.chart.data.datasets[1].data = this.historyData.ram;
    this.chart.data.datasets[2].data = this.historyData.gpu;
    this.chart.update('none');
  },

  // ========== CONFIG TAB ==========
  async initConfigTab() {
    await this.loadConfig();
    this.setupConfigEventListeners();
    await this.loadMonitoringConfig();
  },

  async loadConfig() {
    try {
      const config = await App.apiCall('/api/config');
      this.populateConfigForm(config);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  },

  populateConfigForm(config) {
    const appForm = document.getElementById('app-config-form');
    if (appForm && config.server) {
      appForm.elements['serverName'].value = config.server.name || 'Media Manager';
      appForm.elements['serverIp'].value = config.server.ip || '';
      appForm.elements['timezone'].value = config.server.timezone || 'Europe/Rome';
    }

    const dashboardForm = document.getElementById('dashboard-config-form');
    if (dashboardForm && config.dashboard) {
      dashboardForm.elements['logoUrl'].value = config.dashboard.logo || '';
      dashboardForm.elements['theme'].value = config.dashboard.theme || 'auto';
      dashboardForm.elements['autoRefresh'].checked = config.dashboard.autoRefresh !== false;
      
      const refreshIntervalSlider = dashboardForm.elements['refreshInterval'];
      const refreshIntervalValue = document.getElementById('refreshIntervalValue');
      if (refreshIntervalSlider) {
        refreshIntervalSlider.value = config.dashboard.refreshInterval || 5;
        if (refreshIntervalValue) {
          refreshIntervalValue.textContent = refreshIntervalSlider.value;
        }
      }
    }
  },

  setupConfigEventListeners() {
    document.getElementById('mediamtx-start')?.addEventListener('click', () => this.controlMediaMTX('start'));
    document.getElementById('mediamtx-restart')?.addEventListener('click', () => this.controlMediaMTX('restart'));
    document.getElementById('mediamtx-stop')?.addEventListener('click', () => this.controlMediaMTX('stop'));

    const appForm = document.getElementById('app-config-form');
    if (appForm) {
      appForm.removeEventListener('submit', this.handleAppConfigSubmit);
      appForm.addEventListener('submit', this.handleAppConfigSubmit.bind(this));
    }

    const dashForm = document.getElementById('dashboard-config-form');
    if (dashForm) {
      dashForm.removeEventListener('submit', this.handleDashboardConfigSubmit);
      dashForm.addEventListener('submit', this.handleDashboardConfigSubmit.bind(this));
    }

    const logoUpload = document.getElementById('logo-upload');
    if (logoUpload) {
      logoUpload.removeEventListener('change', this.handleLogoUpload);
      logoUpload.addEventListener('change', this.handleLogoUpload.bind(this));
    }

    document.getElementById('backup-btn')?.addEventListener('click', () => this.createBackup());
    document.getElementById('restore-btn')?.addEventListener('click', () => {
      document.getElementById('restore-file').click();
    });
    
    const restoreFile = document.getElementById('restore-file');
    if (restoreFile) {
      restoreFile.removeEventListener('change', this.handleRestore);
      restoreFile.addEventListener('change', this.handleRestore.bind(this));
    }

    const refreshInterval = document.getElementById('refreshInterval');
    if (refreshInterval) {
      refreshInterval.addEventListener('input', () => this.updateRefreshIntervalDisplay());
    }

    // Monitoring config listeners
    this.setupMonitoringConfigListeners();
  },

  async loadMonitoringConfig() {
    try {
      const config = await App.apiCall('/api/config');
      const interval = config.monitoring?.collectionInterval || 60;
      const chartRange = config.monitoring?.chartTimeRange || 1440;
      const logsEnabled = config.monitoring?.enableConsoleLogs !== false;
      
      const slider = document.getElementById('collectionInterval');
      const badge = document.getElementById('collectionIntervalBadge');
      const display = document.getElementById('collectionIntervalValue');
      const chartSelect = document.getElementById('chartTimeRange');
      const logsCheckbox = document.getElementById('enableConsoleLogs');
      
      if (slider) slider.value = interval;
      if (badge) badge.textContent = this.formatInterval(interval);
      if (display) display.innerHTML = `Current: <strong>${this.formatInterval(interval)}</strong>`;
      if (chartSelect) chartSelect.value = chartRange;
      if (logsCheckbox) logsCheckbox.checked = logsEnabled;
      
      // Update Logger global state
      if (typeof Logger !== 'undefined') {
        Logger.enabled = logsEnabled;
      }
    } catch (error) {
      console.error('Error loading monitoring config:', error);
    }
  },

  formatInterval(seconds) {
    if (seconds < 60) return `${seconds}s`;
    return '1 min';
  },

  setupMonitoringConfigListeners() {
    const slider = document.getElementById('collectionInterval');
    const badge = document.getElementById('collectionIntervalBadge');
    const display = document.getElementById('collectionIntervalValue');

    if (slider) {
      slider.addEventListener('input', () => {
        const val = parseInt(slider.value);
        const label = this.formatInterval(val);
        if (badge) badge.textContent = label;
        if (display) display.innerHTML = `Current: <strong>${label}</strong>`;
      });
    }

    const form = document.getElementById('monitoring-config-form');
    if (form) {
      form.removeEventListener('submit', this._monitoringSubmitHandler);
      this._monitoringSubmitHandler = (e) => { e.preventDefault(); this.saveMonitoringConfig(); };
      form.addEventListener('submit', this._monitoringSubmitHandler);
    }
  },

  async saveMonitoringConfig() {
    const slider = document.getElementById('collectionInterval');
    const chartSelect = document.getElementById('chartTimeRange');
    const logsCheckbox = document.getElementById('enableConsoleLogs');
    
    if (!slider) return;
    
    const interval = parseInt(slider.value);
    const chartRange = parseInt(chartSelect?.value || 1440);
    const logsEnabled = logsCheckbox?.checked !== false;
    
    try {
      // Save interval via API
      await App.apiCall('/api/monitoring/interval', {
        method: 'PUT',
        body: JSON.stringify({ interval })
      });
      
      // Save chart range and console logs via config
      const config = await App.apiCall('/api/config');
      if (!config.monitoring) config.monitoring = {};
      config.monitoring.chartTimeRange = chartRange;
      config.monitoring.enableConsoleLogs = logsEnabled;
      
      await App.apiCall('/api/config', {
        method: 'PUT',
        body: JSON.stringify(config)
      });
      
      // Update Logger immediately
      if (typeof Logger !== 'undefined') {
        Logger.enabled = logsEnabled;
      }
      
      // Reload chart with new time range
      await this.loadHistory();
      
      App.showToast(`Settings saved. Reload page to fully apply console logging changes.`, 'success');
    } catch (error) {
      App.showToast('Failed to save monitoring settings', 'danger');
    }
  },

  handleAppConfigSubmit(e) { e.preventDefault(); this.saveAppConfig(); },
  handleDashboardConfigSubmit(e) { e.preventDefault(); this.saveDashboardConfig(); },
  handleLogoUpload(e) { this.uploadLogo(e.target.files[0]); },
  handleRestore(e) { this.restoreBackup(e.target.files[0]); },

  updateRefreshIntervalDisplay() {
    const slider = document.getElementById('refreshInterval');
    const display = document.getElementById('refreshIntervalValue');
    if (slider && display) display.textContent = slider.value;
  },

  async controlMediaMTX(action) {
    try {
      App.showToast(`${action}ing MediaMTX...`, 'info');
      const result = await App.apiCall(`/api/mediamtx/${action}`, { method: 'POST' });
      App.showToast(result.message || `MediaMTX ${action}ed successfully`, 'success');
      setTimeout(() => {
        if (App.currentPage === 'dashboard') Dashboard.refresh();
      }, 2000);
    } catch (error) {
      App.showToast(`Failed to ${action} MediaMTX: ${error.message}`, 'danger');
    }
  },

  async saveAppConfig() {
    const form = document.getElementById('app-config-form');
    const formData = new FormData(form);
    
    const config = {
      server: {
        name: formData.get('serverName'),
        ip: formData.get('serverIp'),
        timezone: formData.get('timezone')
      }
    };

    try {
      await App.apiCall('/api/config', { method: 'PUT', body: JSON.stringify(config) });
      App.showToast('Configuration saved', 'success');
      await App.loadConfig();
    } catch (error) {
      App.showToast('Failed to save configuration', 'danger');
    }
  },

  async saveDashboardConfig() {
    const form = document.getElementById('dashboard-config-form');
    const formData = new FormData(form);
    
    const config = {
      dashboard: {
        logo: formData.get('logoUrl'),
        theme: formData.get('theme'),
        autoRefresh: formData.get('autoRefresh') === 'on',
        refreshInterval: parseInt(formData.get('refreshInterval'))
      }
    };

    try {
      await App.apiCall('/api/config', { method: 'PUT', body: JSON.stringify(config) });
      App.showToast('Dashboard settings saved', 'success');
      ThemeManager.setTheme(config.dashboard.theme);
      await App.loadConfig();
      App.startAutoRefresh();
    } catch (error) {
      App.showToast('Failed to save dashboard settings', 'danger');
    }
  },

  async uploadLogo(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('logo', file);
    try {
      const response = await fetch('/api/config/logo', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      document.getElementById('dashboard-config-form').elements['logoUrl'].value = data.logoPath;
      App.showToast('Logo uploaded successfully', 'success');
    } catch (error) {
      App.showToast('Failed to upload logo', 'danger');
    }
  },

  async createBackup() {
    try {
      const response = await fetch('/api/config/backup', { method: 'POST' });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `media-manager-backup-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      App.showToast('Backup created successfully', 'success');
    } catch (error) {
      App.showToast('Failed to create backup', 'danger');
    }
  },

  async restoreBackup(file) {
    if (!file) return;
    if (!confirm('Are you sure you want to restore from this backup? Current configuration will be overwritten.')) return;

    const formData = new FormData();
    formData.append('backup', file);
    try {
      const response = await fetch('/api/config/restore', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Restore failed');
      App.showToast('Backup restored successfully. Reloading...', 'success');
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      App.showToast('Failed to restore backup', 'danger');
    }
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};