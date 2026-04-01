// Task Manager Controller - REWRITTEN FOR ZERO FLICKER
const TaskManager = {
  selectedFiles: [],
  currentPath: '/mnt',
  taskModal: null,
  fileBrowserModal: null,
  initializedPlayers: new Set(),
  lastPlaylistStates: new Map(),
  currentTasks: new Map(), // Track current state

  async init() {
    Logger.log('[TASK MANAGER] Initializing...');
    this.setupModals();
    this.setupEventListeners();
    
    // Check if we need a full reload
    const container = document.getElementById('tasks-container');
    const cardsInDOM = container.querySelectorAll('[data-task-id]').length;
    
    if (cardsInDOM === 0 || this.currentTasks.size === 0) {
      // Fresh load or returning to page after cleanup
      await this.loadTasks();
    } else {
      // Cards exist, just refresh values
      await this.refresh();
    }
  },

  cleanup() {
    Logger.log('[TASK CLEANUP] Cleaning up HLS players');
    this.destroyAllHLSPlayers();
    this.initializedPlayers.clear();
    this.lastPlaylistStates.clear();
    this.currentTasks.clear(); // Clear state tracking
  },

  destroyAllHLSPlayers() {
    const videos = document.querySelectorAll('video[id^="video-"]');
    videos.forEach(video => {
      if (video.hlsInstance) {
        video.hlsInstance.destroy();
        video.hlsInstance = null;
      }
      video.pause();
      video.src = '';
      video.load();
    });
  },

  setupModals() {
    this.taskModal = new bootstrap.Modal(document.getElementById('taskModal'));
    this.fileBrowserModal = new bootstrap.Modal(document.getElementById('fileBrowserModal'));
  },

  setupEventListeners() {
    document.getElementById('add-task-btn').addEventListener('click', () => this.showTaskModal());
    document.getElementById('delete-all-tasks-btn').addEventListener('click', () => this.deleteAllTasks());
    document.getElementById('save-task-btn').addEventListener('click', () => this.saveTask());
    document.getElementById('browse-files-btn').addEventListener('click', () => this.showFileBrowser('/mnt'));
    document.getElementById('browse-smb-btn').addEventListener('click', () => this.showSMBInput());
    document.getElementById('confirm-files-btn').addEventListener('click', () => this.confirmFileSelection());
  },

  showSMBInput() {
    const smbPath = prompt('Enter SMB path (e.g., //server/share or smb://server/share):\n\nNote: Make sure the share is mounted on the server.');
    if (smbPath) {
      this.showFileBrowser('/mnt/smb');
    }
  },

  async refresh() {
    try {
      const tasksPage = document.getElementById('tasks-page');
      if (!tasksPage || tasksPage.classList.contains('d-none')) {
        return;
      }

      Logger.log('[REFRESH] Fetching tasks...');
      const tasks = await App.apiCall('/api/tasks');
      
      // Use SURGICAL DOM updates instead of innerHTML rebuild
      this.syncTasks(tasks);
      
      Logger.log('[REFRESH] Complete');
    } catch (error) {
      console.error('[REFRESH] Error:', error);
    }
  },

  async loadTasks() {
    try {
      Logger.log('[LOAD TASKS] Initial load...');
      const tasks = await App.apiCall('/api/tasks');
      
      // Clear everything and rebuild
      const container = document.getElementById('tasks-container');
      container.innerHTML = '';
      this.currentTasks.clear();
      this.initializedPlayers.clear();
      
      if (tasks.length === 0) {
        container.innerHTML = '<div class="col-12"><p class="text-muted text-center">No tasks yet. Click "Nuovo Task" to create one.</p></div>';
        return;
      }
      
      // Create all cards fresh
      tasks.forEach(task => {
        this.currentTasks.set(task.id, task);
        const card = this.createTaskCardElement(task);
        container.appendChild(card);
        this.attachCardEventListeners(task);
        
        // Initialize HLS if running
        if (task.status === 'running' && task.hlsUrl) {
          setTimeout(() => {
            this.initOptimizedHLSPlayer(task.id, `${task.hlsUrl}/index.m3u8`);
          }, 300);
        }
      });
      
      Logger.log('[LOAD TASKS] Complete');
    } catch (error) {
      console.error('[LOAD TASKS] Error:', error);
    }
  },

  syncTasks(tasks) {
    // SURGICAL SYNC: Add/remove/update cards without destroying DOM
    const container = document.getElementById('tasks-container');
    const newTaskIds = new Set(tasks.map(t => t.id));
    const existingTaskIds = new Set(this.currentTasks.keys());

    // 1. REMOVE cards for deleted tasks
    for (const id of existingTaskIds) {
      if (!newTaskIds.has(id)) {
        Logger.log(`[SYNC] Removing task ${id}`);
        const card = container.querySelector(`[data-task-id="${id}"]`);
        if (card) {
          // Destroy player before removing
          const video = document.getElementById(`video-${id}`);
          if (video && video.hlsInstance) {
            video.hlsInstance.destroy();
            video.hlsInstance = null;
          }
          this.initializedPlayers.delete(id);
          card.remove();
        }
        this.currentTasks.delete(id);
      }
    }

    // 2. ADD cards for new tasks OR tasks whose cards are missing from DOM
    for (const task of tasks) {
      const cardExistsInDOM = container.querySelector(`[data-task-id="${task.id}"]`) !== null;
      
      if (!existingTaskIds.has(task.id) || !cardExistsInDOM) {
        if (!cardExistsInDOM && existingTaskIds.has(task.id)) {
          Logger.log(`[SYNC] Card missing from DOM for task ${task.id}, recreating`);
        } else {
          Logger.log(`[SYNC] Adding new task ${task.id}`);
        }
        
        this.currentTasks.set(task.id, task);
        const card = this.createTaskCardElement(task);
        container.appendChild(card);
        this.attachCardEventListeners(task);
        
        if (task.status === 'running' && task.hlsUrl) {
          setTimeout(() => {
            this.initOptimizedHLSPlayer(task.id, `${task.hlsUrl}/index.m3u8`);
          }, 300);
        }
      }
    }

    // 3. UPDATE existing cards that are actually in the DOM
    for (const task of tasks) {
      const cardExistsInDOM = container.querySelector(`[data-task-id="${task.id}"]`) !== null;
      
      if (existingTaskIds.has(task.id) && cardExistsInDOM) {
        this.updateTaskCardValues(task);
        this.currentTasks.set(task.id, task);
      }
    }
  },

  updateTaskCardValues(task) {
    // CRITICAL: Search ONLY in tasks-container, not entire document (dashboard has cards too!)
    const container = document.getElementById('tasks-container');
    const card = container.querySelector(`[data-task-id="${task.id}"]`);
    
    if (!card) {
      console.error(`[UPDATE VALUES] Card not found in tasks-container for task ${task.id}`);
      return;
    }

    const oldTask = this.currentTasks.get(task.id);
    
    // Update header color
    const header = card.querySelector('.card-header');
    if (header) {
      let headerClass, textClass;
      
      if (task.error) {
        headerClass = 'bg-danger';
        textClass = 'text-white';
      } else if (task.status === 'running') {
        headerClass = 'bg-warning';
        textClass = 'text-dark';
      } else if (task.status === 'completed') {
        headerClass = 'bg-success';
        textClass = 'text-white';
      } else {
        headerClass = 'bg-secondary';
        textClass = 'text-white';
      }
      
      header.className = `card-header ${headerClass} ${textClass} d-flex justify-content-between align-items-center`;
    }
    
    // Update uptime
    const uptimeEl = card.querySelector('.task-uptime');
    if (uptimeEl) {
      if (task.status === 'running') {
        uptimeEl.innerHTML = `<i class="bi bi-clock"></i> ${Utils.formatDuration(task.uptime || 0)}`;
        uptimeEl.classList.remove('d-none');
      } else {
        uptimeEl.classList.add('d-none');
      }
    }
    
    // Update connected clients
    const clientsEl = card.querySelector('.task-clients-count');
    if (clientsEl) {
      clientsEl.textContent = task.connectedClients || 0;
    }
    
    // Update active file
    const fileEl = card.querySelector('.task-active-file');
    if (fileEl) {
      fileEl.textContent = task.activeFile || task.files[0] || 'N/A';
    }
    
    // Update playlist if changed
    const playlistContainer = card.querySelector('.task-playlist-container');
    if (playlistContainer && task.files && task.files.length > 1) {
      const playlistKey = `${task.id}-playlist`;
      const currentState = JSON.stringify({ files: task.files, activeFile: task.activeFile });
      const lastState = this.lastPlaylistStates.get(playlistKey);
      
      if (lastState !== currentState) {
        playlistContainer.innerHTML = this.renderPlaylist(task);
        this.lastPlaylistStates.set(playlistKey, currentState);
      }
    }
    
    // Update error
    const cardBody = card.querySelector('.card-body');
    let errorEl = card.querySelector('.task-error');
    
    if (task.error && !errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'alert alert-danger alert-sm mb-2 task-error';
      errorEl.innerHTML = `<i class="bi bi-exclamation-triangle"></i> <small>${this.escapeHtml(task.error)}</small>`;
      cardBody.insertBefore(errorEl, cardBody.firstChild);
    } else if (task.error && errorEl) {
      errorEl.innerHTML = `<i class="bi bi-exclamation-triangle"></i> <small>${this.escapeHtml(task.error)}</small>`;
    } else if (!task.error && errorEl) {
      errorEl.remove();
    }
    
    // Handle status change: stopped → running
    if (oldTask && oldTask.status !== task.status) {
      if (task.status === 'running') {
        Logger.log(`[UPDATE] Task ${task.id} started - creating video element`);
        if (card) {
          this.createVideoElement(card, task);
          
          // Initialize player
          if (task.hlsUrl) {
            setTimeout(() => {
              this.initOptimizedHLSPlayer(task.id, `${task.hlsUrl}/index.m3u8`);
            }, 500);
          }
        } else {
          console.error(`[UPDATE] Cannot create video element - card is null for task ${task.id}`);
        }
      } else if (task.status === 'stopped') {
        Logger.log(`[UPDATE] Task ${task.id} stopped - removing video element`);
        if (card) {
          this.removeVideoElement(card, task.id);
        } else {
          console.error(`[UPDATE] Cannot remove video element - card is null for task ${task.id}`);
        }
      }
    }
    
    // Update button states
    const startBtn = card.querySelector(`#start-${task.id}`);
    const stopBtn = card.querySelector(`#stop-${task.id}`);
    const editBtn = card.querySelector(`#edit-${task.id}`);
    const deleteBtn = card.querySelector(`#delete-${task.id}`);
    
    if (task.status === 'running') {
      if (startBtn) startBtn.classList.add('d-none');
      if (stopBtn) stopBtn.classList.remove('d-none');
      if (editBtn) editBtn.disabled = true;
      if (deleteBtn) deleteBtn.disabled = true;
    } else {
      if (startBtn) startBtn.classList.remove('d-none');
      if (stopBtn) stopBtn.classList.add('d-none');
      if (editBtn) editBtn.disabled = false;
      if (deleteBtn) deleteBtn.disabled = false;
    }
  },

  createVideoElement(card, task) {
    const cardBody = card.querySelector('.card-body');
    
    if (!cardBody) {
      console.error(`[CREATE VIDEO] card-body not found for task ${task.id}`);
      return;
    }
    
    // Remove placeholder if exists
    const placeholder = cardBody.querySelector('.mb-3.bg-secondary');
    if (placeholder) {
      placeholder.remove();
    }
    
    // Check if video already exists
    if (document.getElementById(`video-${task.id}`)) {
      return;
    }
    
    // Create video container and element
    const videoContainer = document.createElement('div');
    videoContainer.className = 'mb-3 position-relative video-container';
    videoContainer.style.background = '#000';
    videoContainer.style.aspectRatio = '4/3';
    
    const video = document.createElement('video');
    video.id = `video-${task.id}`;
    video.className = 'w-100 h-100 task-video';
    video.muted = true;
    video.playsInline = true;
    video.style.objectFit = 'contain';
    
    videoContainer.appendChild(video);
    
    // Insert at the beginning
    const errorEl = cardBody.querySelector('.task-error');
    if (errorEl) {
      cardBody.insertBefore(videoContainer, errorEl.nextSibling);
    } else {
      cardBody.insertBefore(videoContainer, cardBody.firstChild);
    }
  },

  removeVideoElement(card, taskId) {
    // Destroy player
    const video = document.getElementById(`video-${taskId}`);
    if (video && video.hlsInstance) {
      video.hlsInstance.destroy();
      video.hlsInstance = null;
    }
    this.initializedPlayers.delete(taskId);
    
    // Remove video container
    const videoContainer = card.querySelector('.video-container');
    if (videoContainer) {
      videoContainer.remove();
    }
    
    // Add placeholder
    const cardBody = card.querySelector('.card-body');
    if (!cardBody) {
      console.error(`[REMOVE VIDEO] card-body not found for task ${taskId}`);
      return;
    }
    
    const errorEl = cardBody.querySelector('.task-error');
    
    const placeholder = document.createElement('div');
    placeholder.className = 'mb-3 bg-secondary text-white text-center rounded d-flex align-items-center justify-content-center';
    placeholder.style.aspectRatio = '4/3';
    placeholder.innerHTML = '<span class="text-muted">No Preview</span>';
    
    if (errorEl) {
      cardBody.insertBefore(placeholder, errorEl.nextSibling);
    } else {
      cardBody.insertBefore(placeholder, cardBody.firstChild);
    }
  },

  createTaskCardElement(task) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4 mb-4';
    col.setAttribute('data-task-id', task.id);
    
    const isRunning = task.status === 'running';
    const isCompleted = task.status === 'completed';
    const rtspUrl = task.rtspUrl || 'N/A';
    const isPlaylist = task.files && task.files.length > 1;
    const clientsCount = task.connectedClients || 0;
    
    let headerClass = 'bg-secondary text-white';
    let statusIcon = 'bi-stop-circle';
    let statusText = 'Stopped';
    
    if (task.error) {
      headerClass = 'bg-danger text-white';
      statusIcon = 'bi-exclamation-circle';
      statusText = 'Error';
    } else if (isRunning) {
      headerClass = 'bg-warning text-dark';
      statusIcon = 'bi-play-circle-fill';
      statusText = 'Running';
    } else if (isCompleted) {
      headerClass = 'bg-success text-white';
      statusIcon = 'bi-check-circle-fill';
      statusText = 'Completed';
    }
    
    col.innerHTML = `
      <div class="card h-100">
        <div class="card-header ${headerClass} d-flex justify-content-between align-items-center">
          <h6 class="mb-0">${this.escapeHtml(task.name)}</h6>
          <div class="d-flex align-items-center gap-2">
            ${task.loop ? '<i class="bi bi-arrow-repeat" title="Loop enabled"></i>' : ''}
            ${isPlaylist ? '<i class="bi bi-collection-play" title="Playlist"></i><span class="badge bg-light text-dark ms-1">' + task.files.length + '</span>' : ''}
            <i class="bi bi-people-fill" title="Connected clients"></i>
            <span class="badge bg-light text-dark task-clients-count">${clientsCount}</span>
          </div>
        </div>
        <div class="card-body">
          ${task.error ? `
            <div class="alert alert-danger alert-sm mb-2 task-error">
              <i class="bi bi-exclamation-triangle"></i> <small>${this.escapeHtml(task.error)}</small>
            </div>
          ` : ''}
          
          ${isRunning ? `
            <div class="mb-3 position-relative video-container" style="background: #000; aspect-ratio: 4/3;">
              <video id="video-${task.id}" 
                     class="w-100 h-100 task-video" 
                     muted 
                     playsinline
                     style="object-fit: contain;">
              </video>
            </div>
          ` : isCompleted ? `
            <div class="mb-3 bg-success bg-opacity-10 border border-success rounded p-3 text-center">
              <i class="bi bi-check-circle-fill text-success" style="font-size: 3rem;"></i>
              <h5 class="mt-2 text-success">Task Completed</h5>
              <p class="text-muted small mb-0">
                <i class="bi bi-clock"></i> Total: ${Utils.formatDuration(task.uptime || 0)}
                ${isPlaylist ? ` | ${task.files.length} files processed` : ''}
              </p>
            </div>
          ` : '<div class="mb-3 bg-secondary text-white text-center rounded d-flex align-items-center justify-content-center" style="aspect-ratio: 4/3;"><span class="text-muted">No Preview</span></div>'}
          
          <div class="mb-2">
            <small class="text-muted task-uptime ${isRunning ? '' : 'd-none'}">
              <i class="bi bi-clock"></i> ${Utils.formatDuration(task.uptime || 0)}
            </small>
            
            ${isPlaylist ? `<div class="task-playlist-container">${this.renderPlaylist(task)}</div>` : `
              <small class="text-muted d-block">
                <i class="bi bi-file-play"></i> <span class="task-active-file">${this.escapeHtml(task.activeFile || task.files[0] || 'N/A')}</span>
              </small>
            `}
            
            ${task.startDateTime ? `<small class="text-muted d-block"><i class="bi bi-calendar-event"></i> ${new Date(task.startDateTime).toLocaleString('it-IT')}</small>` : ''}
            ${task.seekTime && task.seekTime !== '00:00:00' ? `<small class="text-muted d-block"><i class="bi bi-skip-start"></i> ${task.seekTime}</small>` : ''}
          </div>
          
          <div class="mb-2">
            <div class="input-group input-group-sm">
              <span class="input-group-text"><i class="bi bi-broadcast"></i></span>
              <input type="text" class="form-control form-control-sm font-monospace" value="${rtspUrl}" readonly>
              <button class="btn btn-outline-secondary" type="button" id="copy-rtsp-${task.id}" title="Copy RTSP URL">
                <i class="bi bi-clipboard"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="card-footer">
          <div class="btn-group w-100" role="group">
            <button class="btn btn-sm btn-success ${isRunning ? 'd-none' : ''}" id="start-${task.id}" title="Start Task">
              <i class="bi bi-play-fill"></i>
            </button>
            <button class="btn btn-sm btn-danger ${isRunning ? '' : 'd-none'}" id="stop-${task.id}" title="Stop Task">
              <i class="bi bi-stop-fill"></i>
            </button>
            <button class="btn btn-sm btn-primary" id="edit-${task.id}" title="Edit Task" ${isRunning ? 'disabled' : ''}>
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" id="delete-${task.id}" title="Delete Task" ${isRunning ? 'disabled' : ''}>
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
    
    // Track playlist state
    if (isPlaylist) {
      this.lastPlaylistStates.set(`${task.id}-playlist`, JSON.stringify({
        files: task.files,
        activeFile: task.activeFile
      }));
    }
    
    return col;
  },

  attachCardEventListeners(task) {
    const startBtn = document.getElementById(`start-${task.id}`);
    const stopBtn = document.getElementById(`stop-${task.id}`);
    const editBtn = document.getElementById(`edit-${task.id}`);
    const deleteBtn = document.getElementById(`delete-${task.id}`);
    const copyBtn = document.getElementById(`copy-rtsp-${task.id}`);
    
    if (startBtn) {
      startBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.startTask(task.id);
      });
    }
    
    if (stopBtn) {
      stopBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.stopTask(task.id);
      });
    }
    
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.editTask(task);
      });
    }
    
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.deleteTask(task.id);
      });
    }
    
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        Utils.copyToClipboard(task.rtspUrl);
      });
    }
  },

  initOptimizedHLSPlayer(taskId, hlsUrl, retryCount = 0) {
    Logger.log(`[HLS INIT] Initializing player for task ${taskId} (attempt ${retryCount + 1})`);
    
    const video = document.getElementById(`video-${taskId}`);
    if (!video) {
      console.error(`[HLS INIT] Video element not found for task ${taskId}`);
      return;
    }
    
    if (!hlsUrl) {
      console.error(`[HLS INIT] No HLS URL provided for task ${taskId}`);
      return;
    }

    // Check if already initialized
    if (this.initializedPlayers.has(taskId)) {
      Logger.log(`[HLS INIT] Player already initialized for task ${taskId}, skipping`);
      return;
    }
    
    // Add small delay to avoid race conditions with multiple simultaneous initializations
    const initDelay = retryCount * 500; // 0ms, 500ms, 1000ms, 1500ms
    
    setTimeout(() => {
      if (Hls.isSupported()) {
        const hls = new Hls({
          debug: false,
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 10,
          maxBufferLength: 10,
          maxMaxBufferLength: 15,
          maxBufferSize: 10 * 1000 * 1000,
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 1,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 3,
          maxFragLookUpTolerance: 0.2,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
          liveDurationInfinity: false,
          startLevel: -1,
          autoStartLoad: true,
          testBandwidth: false,
          progressive: true,
          manifestLoadingTimeOut: 10000,
          manifestLoadingMaxRetry: 3,
          manifestLoadingRetryDelay: 1000,
          levelLoadingTimeOut: 10000,
          levelLoadingMaxRetry: 3,
          levelLoadingRetryDelay: 1000
        });
        
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          Logger.log(`[HLS INIT] Manifest parsed for task ${taskId}`);
          this.initializedPlayers.add(taskId);
          video.play().catch(() => {});
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch(data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (data.response && data.response.code === 404) {
                  hls.destroy();
                  video.hlsInstance = null;
                  this.initializedPlayers.delete(taskId);
                  video.poster = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225"%3E%3Crect fill="%23dc3545" width="400" height="225"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23fff" font-size="16"%3EStream Ended%3C/text%3E%3C/svg%3E';
                  break;
                }
                // Retry on network error (max 3 attempts)
                if (retryCount < 3) {
                  Logger.log(`[HLS ERROR] Network error for ${taskId}, retrying in 2s...`);
                  hls.destroy();
                  video.hlsInstance = null;
                  this.initializedPlayers.delete(taskId);
                  setTimeout(() => this.initOptimizedHLSPlayer(taskId, hlsUrl, retryCount + 1), 2000);
                } else {
                  setTimeout(() => {
                    if (hls && !hls.destroyed) {
                      hls.startLoad();
                    }
                  }, 2000);
                }
                break;
                
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
                
              default:
                hls.destroy();
                video.hlsInstance = null;
                this.initializedPlayers.delete(taskId);
                video.poster = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225"%3E%3Crect fill="%23dc3545" width="400" height="225"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23fff" font-size="16"%3EStream Error%3C/text%3E%3C/svg%3E';
                break;
            }
          }
        });
        
        hls.on(Hls.Events.FRAG_LOADED, () => {
          if (video.paused) {
            video.play().catch(() => {});
          }
        });
        
        video.hlsInstance = hls;
        video.dataset.taskId = taskId;
        
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
          this.initializedPlayers.add(taskId);
          video.play().catch(() => {});
        });
        video.dataset.taskId = taskId;
      }
    }, initDelay); // Close setTimeout
  },

  renderPlaylist(task) {
    if (!task.files || task.files.length <= 1) return '';
    
    const currentIndex = task.activeFile ? task.files.indexOf(task.activeFile) : 0;
    
    return `
      <div class="mt-2 playlist-container">
        <small class="text-muted d-block mb-1">
          <i class="bi bi-collection-play me-1"></i>Playlist (${task.files.length} files)
        </small>
        <div class="playlist-items" style="max-height: 150px; overflow-y: auto;">
          ${task.files.map((file, idx) => {
            const fileName = file.split('/').pop();
            const isActive = idx === currentIndex && task.status === 'running';
            const isCompleted = idx < currentIndex && task.status === 'running';
            const isPending = idx > currentIndex || task.status === 'stopped';
            
            return `
              <div class="playlist-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isPending ? 'pending' : ''} d-flex align-items-center py-1 px-2 mb-1 rounded">
                <span class="playlist-icon me-2">
                  ${isCompleted ? '<i class="bi bi-check-circle-fill text-success"></i>' : 
                    isActive ? '<i class="bi bi-play-circle-fill text-primary"></i>' : 
                    '<i class="bi bi-circle text-muted"></i>'}
                </span>
                <span class="playlist-filename flex-grow-1 ${isActive ? 'fw-bold text-primary' : ''} ${isCompleted ? 'text-muted text-decoration-line-through' : ''}" 
                      title="${this.escapeHtml(file)}"
                      style="font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${this.escapeHtml(fileName)}
                </span>
                <span class="playlist-badge badge ${isActive ? 'bg-primary' : isCompleted ? 'bg-success' : 'bg-secondary'} ms-2" style="font-size: 0.65rem;">
                  ${isActive ? 'Playing' : isCompleted ? 'Done' : 'Pending'}
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  showTaskModal(task = null) {
    const form = document.getElementById('task-form');
    form.reset();
    
    document.getElementById('task-id').value = '';
    this.selectedFiles = []; // Reset selected files
    
    // Setup chips container if it doesn't exist
    const textarea = document.getElementById('task-files');
    if (textarea && !document.getElementById('task-files-chips')) {
      textarea.style.display = 'none'; // Hide textarea
      const chipsContainer = document.createElement('div');
      chipsContainer.id = 'task-files-chips';
      chipsContainer.className = 'mb-2 p-2 border rounded';
      chipsContainer.style.minHeight = '38px';
      textarea.parentNode.insertBefore(chipsContainer, textarea);
    }
    
    if (task) {
      document.getElementById('taskModalLabel').textContent = 'Edit Task';
      document.getElementById('task-id').value = task.id;
      document.getElementById('task-name').value = task.name;
      
      // Setup files as chips instead of textarea
      this.selectedFiles = Array.isArray(task.files) ? [...task.files] : [task.files];
      this.updateFileChips();
      
      // FIX TIMEZONE: use local time instead of UTC
      if (task.startDateTime) {
        const dt = new Date(task.startDateTime);
        // Format as YYYY-MM-DDTHH:MM in LOCAL timezone
        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        const hours = String(dt.getHours()).padStart(2, '0');
        const minutes = String(dt.getMinutes()).padStart(2, '0');
        const formatted = `${year}-${month}-${day}T${hours}:${minutes}`;
        document.getElementById('task-start-datetime').value = formatted;
      } else {
        document.getElementById('task-start-datetime').value = '';
      }
      
      document.getElementById('task-seek-time').value = task.seekTime || '00:00:00';
      document.getElementById('task-loop').checked = task.loop || false;
    } else {
      document.getElementById('taskModalLabel').textContent = 'New Task';
      document.getElementById('task-name').value = '';
      this.selectedFiles = [];
      this.updateFileChips();
      document.getElementById('task-start-datetime').value = '';
      document.getElementById('task-seek-time').value = '00:00:00';
      document.getElementById('task-loop').checked = false;
    }
    
    this.taskModal.show();
  },

  async saveTask() {
    const form = document.getElementById('task-form');
    const formData = new FormData(form);
    
    const taskId = formData.get('taskId');
    const taskName = formData.get('name')?.trim();
    
    // VALIDATION
    if (!taskName) {
      App.showToast('Task name is required', 'danger');
      return;
    }
    
    if (this.selectedFiles.length === 0) {
      App.showToast('At least one file is required', 'danger');
      return;
    }
    
    const taskData = {
      name: taskName,
      files: this.selectedFiles,
      startDateTime: formData.get('startDateTime') || null,
      seekTime: formData.get('seekTime') || '00:00:00',
      loop: formData.get('loop') === 'on'
    };
    
    try {
      if (taskId) {
        await App.apiCall(`/api/tasks/${taskId}`, {
          method: 'PUT',
          body: JSON.stringify(taskData)
        });
        App.showToast('Task updated successfully', 'success');
      } else {
        await App.apiCall('/api/tasks', {
          method: 'POST',
          body: JSON.stringify(taskData)
        });
        App.showToast('Task created successfully', 'success');
      }
      
      this.taskModal.hide();
      await this.loadTasks();
    } catch (error) {
      App.showToast(error.message || 'Error saving task', 'danger');
    }
  },

  async startTask(taskId) {
    try {
      await App.apiCall(`/api/tasks/${taskId}/start`, { 
        method: 'POST',
        body: JSON.stringify({})
      });
      App.showToast('Task started successfully', 'success');
      // Use refresh instead of full reload
      setTimeout(() => this.refresh(), 2000);
    } catch (error) {
      App.showToast(`Error starting task: ${error.message}`, 'danger');
    }
  },

  async stopTask(taskId) {
    try {
      await App.apiCall(`/api/tasks/${taskId}/stop`, { method: 'POST' });
      App.showToast('Task stopped', 'success');
      // Use refresh instead of full reload
      setTimeout(() => this.refresh(), 1000);
    } catch (error) {
      App.showToast('Error stopping task', 'danger');
    }
  },

  editTask(task) {
    this.showTaskModal(task);
  },

  async deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
      await App.apiCall(`/api/tasks/${taskId}`, { method: 'DELETE' });
      App.showToast('Task deleted', 'success');
      await this.loadTasks();
    } catch (error) {
      App.showToast('Error deleting task', 'danger');
    }
  },

  async deleteAllTasks() {
    if (!confirm('Are you sure you want to delete ALL tasks? This cannot be undone.')) return;
    
    try {
      await App.apiCall('/api/tasks', { method: 'DELETE' });
      App.showToast('All tasks deleted', 'success');
      await this.loadTasks();
    } catch (error) {
      App.showToast('Error deleting tasks', 'danger');
    }
  },

  async showFileBrowser(startPath = '/mnt') {
    this.selectedFiles = [];
    this.currentPath = startPath;
    await this.loadDirectory(this.currentPath);
    this.fileBrowserModal.show();
  },

  async loadDirectory(path) {
    try {
      const data = await App.apiCall(`/api/tasks/files/browse?path=${encodeURIComponent(path)}`);
      this.currentPath = data.path;
      document.getElementById('current-path').textContent = this.currentPath;
      
      const fileList = document.getElementById('file-list');
      fileList.innerHTML = data.files.map(file => `
        <button class="list-group-item list-group-item-action" data-path="${file.path}" data-type="${file.type}">
          <i class="bi ${file.isDirectory ? 'bi-folder' : 'bi-file-earmark-play'}"></i>
          ${this.escapeHtml(file.name)}
          ${file.isDirectory ? '' : `<small class="text-muted">(${Utils.formatBytes(file.size)})</small>`}
        </button>
      `).join('');
      
      fileList.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const path = e.currentTarget.dataset.path;
          const type = e.currentTarget.dataset.type;
          
          if (type === 'directory') {
            this.loadDirectory(path);
          } else {
            this.toggleFileSelection(path);
            e.currentTarget.classList.toggle('active');
          }
        });
      });
    } catch (error) {
      App.showToast('Error loading directory', 'danger');
    }
  },

  toggleFileSelection(filePath) {
    const index = this.selectedFiles.indexOf(filePath);
    if (index > -1) {
      this.selectedFiles.splice(index, 1);
    } else {
      this.selectedFiles.push(filePath);
    }
    this.updateSelectedFilesDisplay();
  },

  updateSelectedFilesDisplay() {
    const container = document.getElementById('selected-files');
    if (this.selectedFiles.length === 0) {
      container.innerHTML = '<small class="text-muted">No files selected</small>';
    } else {
      container.innerHTML = this.selectedFiles.map(f => 
        `<div class="badge bg-primary me-1 mb-1">${this.escapeHtml(f.split('/').pop())}</div>`
      ).join('');
    }
  },

  confirmFileSelection() {
    if (this.selectedFiles.length === 0) {
      App.showToast('No files selected', 'warning');
      return;
    }
    
    // Update chips display in the task modal
    this.updateFileChips();
    this.fileBrowserModal.hide();
  },

  // Update file chips display in task modal with X buttons
  updateFileChips() {
    const container = document.getElementById('task-files-chips');
    if (!container) return;
    
    if (this.selectedFiles.length === 0) {
      container.innerHTML = '<small class="text-muted">No files added. Click "Browse Files" to add.</small>';
    } else {
      container.innerHTML = this.selectedFiles.map((file, index) => {
        const fileName = file.split('/').pop();
        return `
          <span class="badge bg-primary me-1 mb-1 d-inline-flex align-items-center">
            <span class="me-1" title="${this.escapeHtml(file)}">${this.escapeHtml(fileName)}</span>
            <button type="button" class="btn-close btn-close-white" 
                    onclick="TaskManager.removeFileFromTask(${index})" 
                    style="font-size: 0.6rem; padding: 0; margin: 0;"
                    title="Remove file"></button>
          </span>
        `;
      }).join('');
    }
  },

  // Remove file from selectedFiles array
  removeFileFromTask(index) {
    if (index >= 0 && index < this.selectedFiles.length) {
      this.selectedFiles.splice(index, 1);
      this.updateFileChips();
    }
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
