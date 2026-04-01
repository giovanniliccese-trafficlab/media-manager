// Server Monitoring Controller
const ServerMonitor = {
  chart: null,
  historyData: {
    labels: [],
    cpu: [],
    ram: [],
    gpu: []
  },

  async init() {
    this.initChart();
    await this.loadSystemInfo();
    await this.loadHistory();
    this.startTimeUpdate();
  },

  async refresh() {
    await this.loadSystemInfo();
    await this.updateHistory();
  },

  initChart() {
    const ctx = document.getElementById('resource-chart');
    if (!ctx) return;

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
            tension: 0.4
          },
          {
            label: 'RAM %',
            data: [],
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            tension: 0.4
          },
          {
            label: 'GPU %',
            data: [],
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (value) => value + '%'
            }
          },
          x: {
            display: true
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
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${days.toString().padStart(2, '0')} ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  displaySystemInfo(data) {
    const container = document.getElementById('system-info');
    if (!container) return;

    container.innerHTML = `
      <table class="table table-sm">
        <tbody>
          <tr>
            <th>Hostname</th>
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
    setInterval(updateTime, 1000);
  },

  async loadHistory() {
    try {
      const data = await App.apiCall('/api/monitoring/load');
      this.addDataPoint(data);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  },

  async updateHistory() {
    try {
      const data = await App.apiCall('/api/monitoring/load');
      this.addDataPoint(data);
    } catch (error) {
      console.error('Error updating history:', error);
    }
  },

  addDataPoint(data) {
    if (!this.chart) return;

    const time = new Date().toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    this.historyData.labels.push(time);
    this.historyData.cpu.push(Math.round(data.cpu?.currentLoad || 0));
    this.historyData.ram.push(Math.round(parseFloat(data.memory?.usedPercent || 0)));
    this.historyData.gpu.push(Math.round(data.gpu?.utilizationGpu || 0));

    // Keep only last 20 data points
    const maxPoints = 20;
    if (this.historyData.labels.length > maxPoints) {
      this.historyData.labels.shift();
      this.historyData.cpu.shift();
      this.historyData.ram.shift();
      this.historyData.gpu.shift();
    }

    this.chart.data.labels = this.historyData.labels;
    this.chart.data.datasets[0].data = this.historyData.cpu;
    this.chart.data.datasets[1].data = this.historyData.ram;
    this.chart.data.datasets[2].data = this.historyData.gpu;
    this.chart.update('none');
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};