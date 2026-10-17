/**
 * GitDiagram 1s - Main Application Coordinator
 */

class App {
  constructor() {
    this.currentFolderPath = null;
    this.currentScanResult = null;
    this.allFiles = [];

    // DOM Elements
    this.welcomeScreen = document.getElementById('welcome-screen');
    this.dropZone = document.getElementById('welcome-drop-zone');
    this.recentsList = document.getElementById('recents-list');
    this.repoNameText = document.getElementById('repo-name-text');
    this.sbFilesText = document.getElementById('sb-files-text');

    // Sidebar views
    this.sidebarTitle = document.getElementById('sidebar-section-title');
    this.sidebarExplorer = document.getElementById('sidebar-content-explorer');
    this.sidebarGit = document.getElementById('sidebar-content-git');
    this.sidebarCommits = document.getElementById('sidebar-content-commits');
    this.sidebarOutline = document.getElementById('sidebar-content-outline');

    // Panes
    this.codePane = document.getElementById('code-pane');
    this.diagramPane = document.getElementById('diagram-pane');
    this.stageResizer = document.getElementById('stage-resizer');
    this.sidebar = document.getElementById('sidebar');
    this.sidebarResizer = document.getElementById('sidebar-resizer');

    // Quick Search Modal
    this.quickSearchModal = document.getElementById('quick-search-modal');
    this.quickSearchInput = document.getElementById('quick-search-input');
    this.quickSearchResults = document.getElementById('quick-search-results');

    this.bindWindowControls();
    this.bindNavigation();
    this.bindResizers();
    this.bindQuickSearch();
    this.bindKeyboardShortcuts();
    this.loadRecents();
    this.setupFileWatcher();
    this.initGitHubModal();
  }

  /**
   * Windows Native Window Controls
   */
  bindWindowControls() {
    document.getElementById('win-min').onclick = () => window.api.minimizeWindow();
    document.getElementById('win-max').onclick = () => window.api.maximizeWindow();
    document.getElementById('win-close').onclick = () => window.api.closeWindow();

    document.getElementById('btn-open-folder').onclick = () => this.promptOpenFolder();
    document.getElementById('btn-welcome-open').onclick = () => this.promptOpenFolder();

    // Drag and Drop folder onto welcome screen
    if (this.dropZone) {
      this.dropZone.ondragover = (e) => {
        e.preventDefault();
        this.dropZone.classList.add('dragover');
      };
      this.dropZone.ondragleave = () => this.dropZone.classList.remove('dragover');
      this.dropZone.ondrop = (e) => {
        e.preventDefault();
        this.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const droppedPath = e.dataTransfer.files[0].path;
          if (droppedPath) this.openRepository(droppedPath);
        }
      };
    }
  }

  /**
   * Activity Bar View Switching
   */
  bindNavigation() {
    const actExplorer = document.getElementById('act-explorer');
    const actGit = document.getElementById('act-git');
    const actCommits = document.getElementById('act-commits');
    const actOutline = document.getElementById('act-outline');
    const actRefresh = document.getElementById('act-refresh');

    const setSidebarView = (activeBtn, title, explorerDisp, gitDisp, commitsDisp, outlineDisp = 'none') => {
      document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
      activeBtn.classList.add('active');
      this.sidebarTitle.textContent = title;
      this.sidebarExplorer.style.display = explorerDisp;
      this.sidebarGit.style.display = gitDisp;
      this.sidebarCommits.style.display = commitsDisp;
      if (this.sidebarOutline) this.sidebarOutline.style.display = outlineDisp;
    };

    actExplorer.onclick = () => setSidebarView(actExplorer, 'Explorer', 'block', 'none', 'none', 'none');
    actGit.onclick = () => setSidebarView(actGit, 'Source Control', 'none', 'block', 'none', 'none');
    actCommits.onclick = () => {
      setSidebarView(actCommits, 'Commit History', 'none', 'none', 'block', 'none');
      // Also switch diagram to Git DAG!
      const gitModeBtn = document.getElementById('diag-mode-git');
      if (gitModeBtn) gitModeBtn.click();
    };
    if (actOutline) {
      actOutline.onclick = () => {
        setSidebarView(actOutline, 'Symbols & Outline', 'none', 'none', 'none', 'block');
        if (window.monacoController && window.monacoController.activeTab) {
          window.outlineController.loadSymbols(window.monacoController.activeTab.path, window.monacoController.activeTab.relativePath);
        }
      };
    }
    actRefresh.onclick = () => this.reloadRepository();

    // View Mode Switcher: Split / Code / Diagram
    const modeSplit = document.getElementById('mode-split');
    const modeCode = document.getElementById('mode-code');
    const modeDiagram = document.getElementById('mode-diagram');

    modeSplit.onclick = () => {
      this.setViewMode('split');
      [modeSplit, modeCode, modeDiagram].forEach(b => b.classList.remove('active'));
      modeSplit.classList.add('active');
    };

    modeCode.onclick = () => {
      this.setViewMode('code');
      [modeSplit, modeCode, modeDiagram].forEach(b => b.classList.remove('active'));
      modeCode.classList.add('active');
    };

    modeDiagram.onclick = () => {
      this.setViewMode('diagram');
      [modeSplit, modeCode, modeDiagram].forEach(b => b.classList.remove('active'));
      modeDiagram.classList.add('active');
    };
  }

  /**
   * Set View Mode Layout
   */
  setViewMode(mode) {
    if (mode === 'split') {
      this.codePane.style.display = 'flex';
      this.diagramPane.style.display = 'flex';
      this.stageResizer.style.display = 'block';
      this.codePane.style.flex = '1';
      this.diagramPane.style.flex = '1';
    } else if (mode === 'code') {
      this.codePane.style.display = 'flex';
      this.diagramPane.style.display = 'none';
      this.stageResizer.style.display = 'none';
      this.codePane.style.flex = '1';
    } else if (mode === 'diagram') {
      this.codePane.style.display = 'none';
      this.diagramPane.style.display = 'flex';
      this.stageResizer.style.display = 'none';
      this.diagramPane.style.flex = '1';
    }

    setTimeout(() => {
      if (window.monacoController) window.monacoController.layout();
      if (window.diagramRenderer) window.diagramRenderer.fitToScreen();
    }, 50);
  }

  /**
   * Draggable Resizers for Stage and Sidebar
   */
  bindResizers() {
    // Stage Split Resizer
    let isDraggingStage = false;
    this.stageResizer.onmousedown = (e) => {
      isDraggingStage = true;
      this.stageResizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
    };

    // Sidebar Resizer
    let isDraggingSidebar = false;
    this.sidebarResizer.onmousedown = (e) => {
      isDraggingSidebar = true;
      document.body.style.cursor = 'col-resize';
    };

    window.onmousemove = (e) => {
      if (isDraggingStage) {
        const stageRect = document.getElementById('stage').getBoundingClientRect();
        const offsetX = e.clientX - stageRect.left;
        const totalWidth = stageRect.width;
        const leftPercent = Math.max(15, Math.min(85, (offsetX / totalWidth) * 100));

        this.codePane.style.flex = `0 0 ${leftPercent}%`;
        this.diagramPane.style.flex = `0 0 ${100 - leftPercent}%`;
        if (window.monacoController) window.monacoController.layout();
      }

      if (isDraggingSidebar) {
        const activityBarWidth = 48;
        const newWidth = Math.max(180, Math.min(500, e.clientX - activityBarWidth));
        this.sidebar.style.width = `${newWidth}px`;
      }
    };

    window.onmouseup = () => {
      if (isDraggingStage) {
        isDraggingStage = false;
        this.stageResizer.classList.remove('dragging');
        document.body.style.cursor = 'default';
        if (window.monacoController) window.monacoController.layout();
        if (window.diagramRenderer) window.diagramRenderer.fitToScreen();
      }
      if (isDraggingSidebar) {
        isDraggingSidebar = false;
        document.body.style.cursor = 'default';
      }
    };
  }

  /**
   * Quick Search Modal (Ctrl+P)
   */
  bindQuickSearch() {
    const trigger = document.getElementById('quick-search-trigger');
    if (trigger) trigger.onclick = () => this.openQuickSearch();

    this.quickSearchModal.onclick = (e) => {
      if (e.target === this.quickSearchModal) this.closeQuickSearch();
    };

    this.quickSearchInput.oninput = (e) => {
      this.renderQuickSearchResults(e.target.value.trim().toLowerCase());
    };

    this.quickSearchInput.onkeydown = (e) => {
      if (e.key === 'Escape') this.closeQuickSearch();
      if (e.key === 'Enter') {
        const first = this.quickSearchResults.querySelector('.quick-search-item');
        if (first) first.click();
      }
    };
  }

  openQuickSearch() {
    if (!this.allFiles || this.allFiles.length === 0) return;
    this.quickSearchModal.style.display = 'flex';
    this.quickSearchInput.value = '';
    this.renderQuickSearchResults('');
    setTimeout(() => this.quickSearchInput.focus(), 50);
  }

  closeQuickSearch() {
    this.quickSearchModal.style.display = 'none';
  }

  renderQuickSearchResults(query) {
    this.quickSearchResults.innerHTML = '';
    const filtered = this.allFiles.filter(f => !query || f.relativePath.toLowerCase().includes(query)).slice(0, 40);

    for (const f of filtered) {
      const item = document.createElement('div');
      item.className = 'quick-search-item';
      item.style.cssText = 'padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-radius: 4px; color: var(--text-secondary); font-size: 12px;';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>📄</span>
          <span style="color: var(--text-primary); font-weight: 500;">${f.name}</span>
          <span style="color: var(--text-muted); font-size: 11px;">${f.relativePath}</span>
        </div>
        <span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);">${f.lines ? f.lines + 'L' : ''}</span>
      `;

      item.onmouseenter = () => item.style.background = 'var(--bg-hover)';
      item.onmouseleave = () => item.style.background = 'transparent';

      item.onclick = () => {
        this.closeQuickSearch();
        window.monacoController.openFile(f.path, f.relativePath);
        if (window.fileExplorer) window.fileExplorer.highlightFile(f.relativePath);
        if (window.diagramRenderer) window.diagramRenderer.selectNodeByPath(f.relativePath);
      };

      this.quickSearchResults.appendChild(item);
    }
  }

  /**
   * Keyboard Shortcuts
   */
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ctrl+O: Open folder
      if (e.ctrlKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        this.promptOpenFolder();
      }
      // Ctrl+P: Quick Search
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        this.openQuickSearch();
      }
      // Ctrl+R: Refresh repo
      if (e.ctrlKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        this.reloadRepository();
      }
      // Ctrl+B: Toggle sidebar
      if (e.ctrlKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        this.sidebar.style.display = this.sidebar.style.display === 'none' ? 'flex' : 'none';
        if (window.monacoController) window.monacoController.layout();
      }
    });
  }

  /**
   * Load Recent Repositories
   */
  async loadRecents() {
    const recents = await window.api.getRecentFolders();
    if (!this.recentsList) return;
    this.recentsList.innerHTML = '';

    if (!recents || recents.length === 0) {
      this.recentsList.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">No recent repositories yet</span>';
      return;
    }

    for (const folder of recents) {
      const item = document.createElement('div');
      item.className = 'recent-item';
      const name = folder.split(/[\\/]/).pop();
      item.innerHTML = `
        <span style="font-weight: 500; color: var(--text-primary);">${name}</span>
        <span style="font-size: 10px; color: var(--text-muted);">${folder}</span>
      `;
      item.onclick = () => this.openRepository(folder);
      this.recentsList.appendChild(item);
    }
  }

  /**
   * Prompt user with native Folder Picker
   */
  async promptOpenFolder() {
    const folderPath = await window.api.openFolderDialog();
    if (folderPath) {
      await this.openRepository(folderPath);
    }
  }

  /**
   * Open and analyze repository
   */
  async openRepository(folderPath) {
    this.currentFolderPath = folderPath;
    this.welcomeScreen.style.display = 'none';

    // 1. Scan filesystem
    this.currentScanResult = await window.api.scanRepository(folderPath);
    this.allFiles = this.currentScanResult.files || [];

    // Update Titlebar & Status
    const repoName = this.currentScanResult.rootName || 'Repository';
    this.repoNameText.textContent = repoName;
    this.repoNameText.title = folderPath;
    document.title = `${repoName} — GitDiagram 1s`;

    if (this.sbFilesText) {
      this.sbFilesText.textContent = `${this.allFiles.length} files • ${(this.currentScanResult.stats.totalLines || 0).toLocaleString()} lines`;
    }

    // 2. Load Git Status & Log
    const gitInfo = await window.gitController.loadGitInfo(folderPath);

    // 3. Populate File Explorer
    window.fileExplorer.setData(this.currentScanResult.tree, gitInfo ? gitInfo.gitStatus : null);

    // 4. Generate & Render Architecture Diagram
    const diagramData = await window.api.generateDiagram(folderPath, this.allFiles);
    window.diagramRenderer.setData(diagramData, gitInfo ? gitInfo.logInfo : null, folderPath, this.allFiles);

    // 5. Auto-open primary entry point in Monaco Editor
    await window.monacoController.init();
    const entryFile = this.findBestEntryPoint(this.allFiles);
    if (entryFile) {
      window.monacoController.openFile(entryFile.path, entryFile.relativePath);
      window.fileExplorer.highlightFile(entryFile.relativePath);
    }

    this.loadRecents();
  }

  /**
   * Reload current repository
   */
  async reloadRepository() {
    if (this.currentFolderPath) {
      await this.openRepository(this.currentFolderPath);
      if (window.diagramRenderer) {
        window.diagramRenderer.showToast('Repository reloaded');
      }
    }
  }

  /**
   * Automatically select best entry file to open on repo load
   */
  findBestEntryPoint(files) {
    if (!files || files.length === 0) return null;

    // Preference list
    const preferred = ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', 'server.js', 'package.json', 'README.md', 'main.py', 'main.go', 'main.rs'];
    for (const name of preferred) {
      const match = files.find(f => f.name.toLowerCase() === name.toLowerCase());
      if (match) return match;
    }
    return files.find(f => !f.isBinary) || files[0];
  }

  setupFileWatcher() {
    window.api.onRepoChanged(() => {
      // Debounced background update
      if (this.currentFolderPath) {
        this.reloadRepository();
      }
    });
  }

  /**
   * GitHub Remote & Private Repositories Integration
   */
  async initGitHubModal() {
    const modal = document.getElementById('remote-repo-modal');
    const btnOpenRemote = document.getElementById('btn-open-remote');
    const btnWelcomeRemote = document.getElementById('btn-welcome-remote');
    const btnClose = document.getElementById('btn-close-remote-modal');
    const btnAuth = document.getElementById('btn-github-auth');

    // Tabs
    const tabUrl = document.getElementById('modal-tab-url');
    const tabMyRepos = document.getElementById('modal-tab-myrepos');
    const tabAuth = document.getElementById('modal-tab-auth');

    const contentUrl = document.getElementById('modal-content-url');
    const contentMyRepos = document.getElementById('modal-content-myrepos');
    const contentAuth = document.getElementById('modal-content-auth');

    // Inputs & Buttons
    const repoInput = document.getElementById('remote-repo-input');
    const btnFetch = document.getElementById('btn-fetch-remote');
    const progressContainer = document.getElementById('remote-repo-progress');
    const progressText = document.getElementById('remote-progress-text');
    const tokenInput = document.getElementById('github-token-input');
    const btnSaveToken = document.getElementById('btn-save-token');
    const btnLogout = document.getElementById('btn-github-logout');
    const authLabel = document.getElementById('github-auth-label');

    const userCard = document.getElementById('github-user-card');
    const userAvatar = document.getElementById('github-user-avatar');
    const userName = document.getElementById('github-user-name');
    const userMeta = document.getElementById('github-user-meta');
    const myReposList = document.getElementById('my-repos-list');
    const filterMyRepos = document.getElementById('filter-my-repos');

    let cachedUserRepos = [];

    // Switch Modal Tabs
    const switchTab = (activeTab, activeContent) => {
      [tabUrl, tabMyRepos, tabAuth].forEach(t => t.classList.remove('active'));
      [contentUrl, contentMyRepos, contentAuth].forEach(c => c.style.display = 'none');
      activeTab.classList.add('active');
      activeContent.style.display = 'flex';
    };

    tabUrl.onclick = () => switchTab(tabUrl, contentUrl);
    tabMyRepos.onclick = async () => {
      switchTab(tabMyRepos, contentMyRepos);
      await loadUserRepos();
    };
    tabAuth.onclick = () => switchTab(tabAuth, contentAuth);

    const openModal = (tab = 'url') => {
      modal.style.display = 'flex';
      progressContainer.style.display = 'none';
      if (tab === 'url') tabUrl.click();
      else if (tab === 'auth') tabAuth.click();
      else if (tab === 'myrepos') tabMyRepos.click();
    };

    const closeModal = () => {
      modal.style.display = 'none';
      progressContainer.style.display = 'none';
    };

    if (btnOpenRemote) btnOpenRemote.onclick = () => openModal('url');
    if (btnWelcomeRemote) btnWelcomeRemote.onclick = () => openModal('url');
    if (btnAuth) btnAuth.onclick = () => openModal('auth');
    if (btnClose) btnClose.onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    // Quick suggestion pills
    document.querySelectorAll('.quick-repo-pill').forEach(pill => {
      pill.onclick = () => {
        repoInput.value = pill.dataset.repo;
        btnFetch.click();
      };
    });

    // Listen to cloning progress events from main process
    window.api.github.onProgress((msg) => {
      progressContainer.style.display = 'flex';
      progressText.textContent = msg;
    });

    // Check existing authentication
    const checkAuthStatus = async () => {
      const user = await window.api.github.getUser();
      if (user && user.login) {
        authLabel.textContent = `@${user.login}`;
        authLabel.title = `Logged in as @${user.login}`;
        userCard.style.display = 'flex';
        userAvatar.src = user.avatar_url;
        userName.textContent = user.name ? `${user.name} (@${user.login})` : `@${user.login}`;
        userMeta.textContent = `${user.public_repos} public repos • ${user.total_private_repos} private repos`;
      } else {
        authLabel.textContent = 'Login';
        authLabel.title = 'Authenticate with GitHub';
        userCard.style.display = 'none';
      }
    };
    await checkAuthStatus();

    // Save Token / Authenticate
    btnSaveToken.onclick = async () => {
      const token = tokenInput.value.trim();
      if (!token) return;

      btnSaveToken.disabled = true;
      btnSaveToken.textContent = 'Verifying...';

      const res = await window.api.github.setToken(token);
      btnSaveToken.disabled = false;
      btnSaveToken.textContent = 'Save & Authenticate';

      if (res.success && res.user) {
        tokenInput.value = '';
        await checkAuthStatus();
        if (window.diagramRenderer) {
          window.diagramRenderer.showToast(`Logged in as @${res.user.login}`);
        }
        tabMyRepos.click();
      } else {
        alert(res.error || 'Failed to authenticate token with GitHub.');
      }
    };

    // Logout
    btnLogout.onclick = async () => {
      await window.api.github.logout();
      await checkAuthStatus();
      myReposList.innerHTML = '';
      if (window.diagramRenderer) {
        window.diagramRenderer.showToast('Logged out of GitHub');
      }
    };

    // Load User's Repositories (Public + Private)
    const loadUserRepos = async () => {
      myReposList.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px;">Loading repositories from GitHub...</div>';
      const res = await window.api.github.getUserRepos();
      if (!res.success) {
        myReposList.innerHTML = `
          <div style="padding: 14px; text-align: center; color: var(--text-secondary); font-size: 12px;">
            <p>${res.error}</p>
            <button id="btn-goto-auth" class="btn-primary" style="margin-top: 10px; font-size: 11px;">Enter GitHub Token</button>
          </div>
        `;
        const gotoAuth = document.getElementById('btn-goto-auth');
        if (gotoAuth) gotoAuth.onclick = () => tabAuth.click();
        return;
      }

      cachedUserRepos = res.repos || [];
      renderUserReposList(cachedUserRepos);
    };

    const renderUserReposList = (repos) => {
      myReposList.innerHTML = '';
      if (repos.length === 0) {
        myReposList.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px;">No repositories found.</div>';
        return;
      }

      for (const r of repos) {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 6px; cursor: pointer; background: var(--bg-primary); border: 1px solid var(--border-subtle); transition: all 0.12s ease;';

        const left = document.createElement('div');
        left.style.cssText = 'display: flex; align-items: center; gap: 8px; overflow: hidden;';

        const icon = document.createElement('span');
        icon.innerHTML = r.private ? '🔒' : '📦';
        icon.title = r.private ? 'Private Repository' : 'Public Repository';

        const title = document.createElement('span');
        title.style.cssText = 'font-weight: 500; color: var(--text-primary); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        title.textContent = r.fullName;

        left.appendChild(icon);
        left.appendChild(title);

        const right = document.createElement('div');
        right.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); flex-shrink: 0;';

        if (r.language) {
          const lang = document.createElement('span');
          lang.textContent = r.language;
          right.appendChild(lang);
        }

        if (r.stars > 0) {
          const stars = document.createElement('span');
          stars.innerHTML = `★ ${r.stars}`;
          right.appendChild(stars);
        }

        item.appendChild(left);
        item.appendChild(right);

        item.onmouseenter = () => item.style.borderColor = 'var(--accent-blue)';
        item.onmouseleave = () => item.style.borderColor = 'var(--border-subtle)';

        item.onclick = async () => {
          closeModal();
          await fetchAndOpen(r.fullName);
        };

        myReposList.appendChild(item);
      }
    };

    if (filterMyRepos) {
      filterMyRepos.oninput = (e) => {
        const q = e.target.value.trim().toLowerCase();
        const filtered = cachedUserRepos.filter(r => r.fullName.toLowerCase().includes(q));
        renderUserReposList(filtered);
      };
    }

    // Fetch & Clone remote repository
    const fetchAndOpen = async (repoSlug) => {
      progressContainer.style.display = 'flex';
      progressText.textContent = `Fetching ${repoSlug}...`;
      btnFetch.disabled = true;

      try {
        const res = await window.api.github.fetchRemoteRepo(repoSlug);
        progressContainer.style.display = 'none';
        btnFetch.disabled = false;

        if (res.success && res.path) {
          closeModal();
          await this.openRepository(res.path);
          if (window.diagramRenderer) {
            window.diagramRenderer.showToast(`Loaded ${res.fullName}!`);
          }
        } else {
          alert(`Failed to load repository: ${res.error || 'Unknown error'}`);
        }
      } catch (err) {
        progressContainer.style.display = 'none';
        btnFetch.disabled = false;
        alert(`Error: ${err.message}`);
      }
    };

    btnFetch.onclick = () => {
      const slug = repoInput.value.trim();
      if (slug) fetchAndOpen(slug);
    };

    repoInput.onkeydown = (e) => {
      if (e.key === 'Enter') btnFetch.click();
    };
  }
}

window.app = new App();
