// Configuration Manager
const ConfigManager = {
  async init() {
    await this.loadConfig();
    this.setupEventListeners();
  },

  async loadConfig() {
    try {
      const config = await App.apiCall('/api/config');
      this.populateForm(config);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  },

  populateForm(config) {
    // Application config
    const appForm = document.getElementById('app-config-form');
    if (appForm && config.server) {
      appForm.elements['serverName'].value = config.server.name || 'Media Manager';
      appForm.elements['serverIp'].value = config.server.ip || '';
      appForm.elements['timezone'].value = config.server.timezone || 'Europe/Rome';
    }

    // Dashboard config
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

  setupEventListeners() {
    // MediaMTX controls
    document.getElementById('mediamtx-start')?.addEventListener('click', () => this.controlMediaMTX('start'));
    document.getElementById('mediamtx-restart')?.addEventListener('click', () => this.controlMediaMTX('restart'));
    document.getElementById('mediamtx-stop')?.addEventListener('click', () => this.controlMediaMTX('stop'));

    // App config form
    document.getElementById('app-config-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveAppConfig();
    });

    // Dashboard config form
    document.getElementById('dashboard-config-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveDashboardConfig();
    });

    // Logo upload
    document.getElementById('logo-upload')?.addEventListener('change', (e) => {
      this.uploadLogo(e.target.files[0]);
    });

    // Backup/restore
    document.getElementById('backup-btn')?.addEventListener('click', () => this.createBackup());
    document.getElementById('restore-btn')?.addEventListener('click', () => {
      document.getElementById('restore-file').click();
    });
    document.getElementById('restore-file')?.addEventListener('change', (e) => {
      this.restoreBackup(e.target.files[0]);
    });

    // Refresh interval slider
    const refreshInterval = document.getElementById('refreshInterval');
    if (refreshInterval) {
      refreshInterval.addEventListener('input', () => this.updateRefreshIntervalDisplay());
    }
  },

  updateRefreshIntervalDisplay() {
    const slider = document.getElementById('refreshInterval');
    const display = document.getElementById('refreshIntervalValue');
    if (slider && display) {
      display.textContent = slider.value;
    }
  },

  async controlMediaMTX(action) {
    try {
      App.showToast(`${action}ing MediaMTX...`, 'info');
      const result = await App.apiCall(`/api/mediamtx/${action}`, { method: 'POST' });
      App.showToast(result.message || `MediaMTX ${action}ed successfully`, 'success');
      
      // Wait a bit then reload dashboard
      setTimeout(() => {
        if (App.currentPage === 'dashboard') {
          Dashboard.refresh();
        }
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
      await App.apiCall('/api/config', {
        method: 'PUT',
        body: JSON.stringify(config)
      });
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
      await App.apiCall('/api/config', {
        method: 'PUT',
        body: JSON.stringify(config)
      });
      App.showToast('Dashboard settings saved', 'success');
      
      // Apply theme immediately
      ThemeManager.setTheme(config.dashboard.theme);
      
      // Restart auto-refresh
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
      const response = await fetch('/api/config/logo', {
        method: 'POST',
        body: formData
      });

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

    if (!confirm('Are you sure you want to restore from this backup? Current configuration will be overwritten.')) {
      return;
    }

    const formData = new FormData();
    formData.append('backup', file);

    try {
      const response = await fetch('/api/config/restore', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Restore failed');

      App.showToast('Backup restored successfully. Reloading...', 'success');
      
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      App.showToast('Failed to restore backup', 'danger');
    }
  }
};