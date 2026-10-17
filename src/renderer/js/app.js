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
    const actRefresh = document.getElementById('act-refresh');

    const setSidebarView = (activeBtn, title, explorerDisp, gitDisp, commitsDisp) => {
      document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
      activeBtn.classList.add('active');
      this.sidebarTitle.textContent = title;
      this.sidebarExplorer.style.display = explorerDisp;
      this.sidebarGit.style.display = gitDisp;
      this.sidebarCommits.style.display = commitsDisp;
    };

    actExplorer.onclick = () => setSidebarView(actExplorer, 'Explorer', 'block', 'none', 'none');
    actGit.onclick = () => setSidebarView(actGit, 'Source Control', 'none', 'block', 'none');
    actCommits.onclick = () => {
      setSidebarView(actCommits, 'Commit History', 'none', 'none', 'block');
      // Also switch diagram to Git DAG!
      const gitModeBtn = document.getElementById('diag-mode-git');
      if (gitModeBtn) gitModeBtn.click();
    };
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
    window.diagramRenderer.setData(diagramData, gitInfo ? gitInfo.logInfo : null);

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
}

window.app = new App();
