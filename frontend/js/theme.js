// Theme Manager
const ThemeManager = {
  init() {
    this.loadTheme();
    this.setupToggle();
  },

  loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    this.setTheme(savedTheme);
  },

  setTheme(theme) {
    const html = document.documentElement;
    
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.setAttribute('data-bs-theme', prefersDark ? 'dark' : 'light');
    } else {
      html.setAttribute('data-bs-theme', theme);
    }
    
    localStorage.setItem('theme', theme);
    this.updateToggleIcon(theme);
  },

  setupToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      const current = localStorage.getItem('theme') || 'auto';
      let next;
      
      switch(current) {
        case 'auto':
          next = 'light';
          break;
        case 'light':
          next = 'dark';
          break;
        case 'dark':
          next = 'auto';
          break;
        default:
          next = 'auto';
      }
      
      this.setTheme(next);
    });
  },

  updateToggleIcon(theme) {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    let icon;
    switch(theme) {
      case 'light':
        icon = 'bi-sun';
        break;
      case 'dark':
        icon = 'bi-moon';
        break;
      default:
        icon = 'bi-circle-half';
    }
    
    toggle.querySelector('i').className = `bi ${icon}`;
  }
};

// Initialize theme on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
} else {
  ThemeManager.init();
}