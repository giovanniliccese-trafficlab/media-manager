// Centralized logging system - can be disabled from config
const Logger = {
  enabled: true,
  
  async checkConfig() {
    try {
      const response = await fetch('/api/config');
      const config = await response.json();
      this.enabled = config.monitoring?.enableConsoleLogs !== false;
    } catch (e) {
      this.enabled = true; // Default to enabled if config fails
    }
  },
  
  log(...args) {
    if (this.enabled) console.log(...args);
  },
  
  warn(...args) {
    if (this.enabled) console.warn(...args);
  },
  
  error(...args) {
    console.error(...args); // Always show errors
  }
};

// Initialize logger
Logger.checkConfig();

// Main Application Controller
const App = {
  config: {},
  refreshInterval: null,
  currentPage: 'dashboard',
  activeControllers: new Map(),

  async init() {
    await this.loadConfig();
    this.setupNavigation();
    this.setupFooterClock();
    this.setupSidebarCollapse(); // Auto-close sidebar on mobile
    this.startAutoRefresh();
    this.loadPage('dashboard');
  },

  async loadConfig() {
    try {
      const response = await fetch('/api/config');
      this.config = await response.json();
      
      document.getElementById('server-name').textContent = this.config.server?.name || 'Media Manager';
      
      if (this.config.dashboard?.logo) {
        const logo = document.getElementById('navbar-logo');
        logo.src = this.config.dashboard.logo;
        logo.classList.remove('d-none');
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  },

  setupNavigation() {
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = e.currentTarget.dataset.page;
        this.loadPage(page);
        
        document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        // Auto-close sidebar on mobile after clicking a link
        if (window.innerWidth < 768) {
          this.closeSidebar();
        }
      });
    });
  },

  setupSidebarCollapse() {
    const sidebar = document.getElementById('sidebarMenu');
    const backdrop = document.getElementById('sidebarBackdrop');
    const closeBtn = document.getElementById('sidebarCloseBtn');
    
    // Show sidebar on desktop by default
    if (sidebar && window.innerWidth >= 768) {
      sidebar.classList.add('show');
    }
    
    // Close button handler
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.closeSidebar();
      });
    }
    
    // Backdrop click handler
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        this.closeSidebar();
      });
    }
    
    // Listen for sidebar show/hide events to toggle backdrop
    if (sidebar) {
      sidebar.addEventListener('show.bs.collapse', () => {
        if (backdrop && window.innerWidth < 768) {
          backdrop.classList.add('show');
        }
      });
      
      sidebar.addEventListener('hide.bs.collapse', () => {
        if (backdrop) {
          backdrop.classList.remove('show');
        }
      });
    }
  },
  
  closeSidebar() {
    const sidebar = document.getElementById('sidebarMenu');
    const backdrop = document.getElementById('sidebarBackdrop');
    
    if (sidebar) {
      const bsCollapse = bootstrap.Collapse.getInstance(sidebar);
      if (bsCollapse) {
        bsCollapse.hide();
      } else {
        sidebar.classList.remove('show');
      }
    }
    
    if (backdrop) {
      backdrop.classList.remove('show');
    }
  },

  loadPage(pageName) {
    this.cleanupCurrentPage();
    
    this.currentPage = pageName;
    
    document.querySelectorAll('.page-content').forEach(page => {
      page.classList.add('d-none');
    });
    
    const page = document.getElementById(`${pageName}-page`);
    if (page) {
      page.classList.remove('d-none');
      
      switch(pageName) {
        case 'dashboard':
          Dashboard.init();
          this.activeControllers.set('dashboard', Dashboard);
          break;
        case 'tasks':
          TaskManager.init();
          this.activeControllers.set('tasks', TaskManager);
          break;
        case 'info':
          InfoManager.init();
          this.activeControllers.set('info', InfoManager);
          break;
      }
    }
  },

  cleanupCurrentPage() {
    const currentController = this.activeControllers.get(this.currentPage);
    
    if (currentController && typeof currentController.cleanup === 'function') {
      Logger.log(`[CLEANUP] Cleaning up ${this.currentPage} page`);
      currentController.cleanup();
    }
    
    if (this.currentPage === 'tasks') {
      this.cleanupHLSPlayers();
    }
    
    this.activeControllers.clear();
  },

  cleanupHLSPlayers() {
    const videos = document.querySelectorAll('video[id^="video-"]');
    videos.forEach(video => {
      if (video.hlsInstance) {
        Logger.log(`[HLS CLEANUP] Destroying player for ${video.id}`);
        video.hlsInstance.destroy();
        video.hlsInstance = null;
      }
      video.pause();
      video.src = '';
      video.load();
    });
    Logger.log(`[HLS CLEANUP] Destroyed ${videos.length} HLS players`);
  },

  setupFooterClock() {
    const updateClock = () => {
      const now = new Date();
      const timeString = now.toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: this.config.server?.timezone || 'Europe/Rome'
      });
      
      const dateString = now.toLocaleDateString('it-IT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: this.config.server?.timezone || 'Europe/Rome'
      });
      
      const sidebarDatetime = document.getElementById('sidebar-datetime');
      const sidebarTimezone = document.getElementById('sidebar-timezone');
      
      if (sidebarDatetime) sidebarDatetime.textContent = `${dateString} ${timeString}`;
      if (sidebarTimezone) sidebarTimezone.textContent = this.config.server?.timezone || 'Europe/Rome';
    };
    
    updateClock();
    setInterval(updateClock, 1000);
  },

  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    if (this.config.dashboard?.autoRefresh) {
      const interval = (this.config.dashboard?.refreshInterval || 5) * 1000;
      this.refreshInterval = setInterval(() => {
        this.refreshCurrentPage();
      }, interval);
    }
  },

  refreshCurrentPage() {
    // RIMOSSO IL CONTROLLO document.hasFocus() - aggiorna sempre
    
    const currentController = this.activeControllers.get(this.currentPage);
    
    if (currentController && typeof currentController.refresh === 'function') {
      Logger.log(`[AUTO-REFRESH] Refreshing ${this.currentPage} page`);
      currentController.refresh();
    }
  },

  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} position-fixed top-0 start-50 translate-middle-x mt-3`;
    toast.style.zIndex = '9999';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  },

  async apiCall(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API call error:', error);
      this.showToast(`Error: ${error.message}`, 'danger');
      throw error;
    }
  }
};

// Utility functions
const Utils = {
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },

  formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  },

  copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        App.showToast('Copied to clipboard', 'success');
      }).catch(err => {
        console.error('Failed to copy:', err);
        this.copyToClipboardFallback(text);
      });
    } else {
      this.copyToClipboardFallback(text);
    }
  },

  copyToClipboardFallback(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      App.showToast('Copied to clipboard', 'success');
    } catch (err) {
      console.error('Fallback: Failed to copy', err);
      App.showToast('Failed to copy. Please copy manually.', 'warning');
    }
    document.body.removeChild(textArea);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});