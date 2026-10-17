/**
 * GitDiagram 1s - Monaco Editor Controller
 * Embedded VS Code Monaco Editor with Tabs, Diff Viewer, and Media Preview
 */

class MonacoController {
  constructor() {
    this.editor = null;
    this.diffEditor = null;
    this.monaco = null;
    this.isInitialized = false;

    this.openTabs = []; // Array of { path, relativePath, name, language, isDirty }
    this.activeTab = null;
    this.models = new Map(); // path -> monaco text model

    this.container = document.getElementById('monaco-container');
    this.diffContainer = document.getElementById('monaco-diff-container');
    this.mediaContainer = document.getElementById('media-preview-container');
    this.mediaImg = document.getElementById('media-preview-img');
    this.mediaMeta = document.getElementById('media-preview-meta');
    this.tabsContainer = document.getElementById('editor-tabs-container');
    this.breadcrumbsContainer = document.getElementById('breadcrumbs-container');

    // Status bar elements
    this.sbCursor = document.getElementById('sb-cursor');
    this.sbLang = document.getElementById('sb-lang-text');
  }

  /**
   * Initialize Monaco Editor using AMD loader
   */
  async init() {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      if (typeof window.require === 'undefined') {
        console.warn('Monaco AMD loader not yet ready, waiting...');
        setTimeout(() => this.init().then(resolve).catch(reject), 100);
        return;
      }

      window.require.config({
        paths: {
          vs: '../../node_modules/monaco-editor/min/vs'
        }
      });

      window.require(['vs/editor/editor.main'], () => {
        this.monaco = window.monaco;

        // Define VS Code Dark Modern / GitHub Dark theme
        this.monaco.editor.defineTheme('github-dark-custom', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'ff7b72' },
            { token: 'string', foreground: 'a5d6ff' },
            { token: 'number', foreground: '79c0ff' },
            { token: 'type', foreground: 'ffa657' },
            { token: 'class', foreground: 'ffa657' },
            { token: 'function', foreground: 'd2a8ff' },
            { token: 'variable', foreground: 'c9d1d9' }
          ],
          colors: {
            'editor.background': '#0d1117',
            'editor.foreground': '#c9d1d9',
            'editorLineNumber.foreground': '#6e7681',
            'editorLineNumber.activeForeground': '#f0f6fc',
            'editor.selectionBackground': '#264f78',
            'editor.inactiveSelectionBackground': '#3a3d41',
            'editorCursor.foreground': '#58a6ff',
            'editorWhitespace.foreground': '#21262d',
            'editorIndentGuide.background1': '#21262d',
            'editorIndentGuide.activeBackground1': '#30363d'
          }
        });

        // Create Monaco Code Editor
        this.editor = this.monaco.editor.create(this.container, {
          theme: 'github-dark-custom',
          fontSize: 13,
          fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
          lineNumbers: 'on',
          roundedSelection: false,
          scrollBeyondLastLine: false,
          readOnly: false,
          automaticLayout: true,
          minimap: { enabled: true, maxColumn: 80, scale: 1 },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          bracketPairColorization: { enabled: true },
          renderWhitespace: 'selection'
        });

        // Create Monaco Diff Editor
        this.diffEditor = this.monaco.editor.createDiffEditor(this.diffContainer, {
          theme: 'github-dark-custom',
          fontSize: 13,
          fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
          readOnly: true,
          automaticLayout: true,
          renderSideBySide: true,
          originalEditable: false
        });

        // Track cursor position
        this.editor.onDidChangeCursorPosition((e) => {
          if (this.sbCursor) {
            this.sbCursor.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
          }
        });

        this.isInitialized = true;
        resolve();
      });
    });
  }

  /**
   * Open file in editor
   */
  async openFile(filePath, relativePath = null) {
    if (!this.isInitialized) await this.init();

    // Check if file is already open
    let tab = this.openTabs.find(t => t.path === filePath);
    if (!tab) {
      try {
        const fileData = await window.api.readFile(filePath);
        tab = {
          path: filePath,
          relativePath: relativePath || filePath,
          name: fileData.name,
          extension: fileData.extension,
          language: fileData.language,
          isBinary: fileData.isBinary,
          content: fileData.content,
          size: fileData.size
        };
        this.openTabs.push(tab);
      } catch (err) {
        console.error('Failed to open file:', err);
        return;
      }
    }

    this.setActiveTab(tab);
  }

  /**
   * Set active tab and switch editor view
   */
  setActiveTab(tab) {
    this.activeTab = tab;
    this.renderTabs();
    this.updateBreadcrumbs(tab.relativePath);

    // Switch to normal editor containers
    this.diffContainer.style.display = 'none';

    if (tab.isBinary) {
      this.container.style.display = 'none';
      this.mediaContainer.style.display = 'flex';

      const isImage = /\.(png|jpe?g|gif|webp|ico|svg|bmp)$/i.test(tab.extension);
      if (isImage) {
        this.mediaImg.src = `file://${tab.path.replace(/\\/g, '/')}`;
        this.mediaImg.style.display = 'block';
        this.mediaMeta.textContent = `${tab.name} • ${(tab.size / 1024).toFixed(1)} KB`;
      } else {
        this.mediaImg.style.display = 'none';
        this.mediaMeta.textContent = `Binary file (${tab.extension}) • ${(tab.size / 1024).toFixed(1)} KB (Cannot display in editor)`;
      }
      return;
    }

    this.mediaContainer.style.display = 'none';
    this.container.style.display = 'block';

    // Get or create model
    let model = this.models.get(tab.path);
    if (!model) {
      const uri = this.monaco.Uri.file(tab.path);
      model = this.monaco.editor.getModel(uri) || this.monaco.editor.createModel(tab.content, tab.language, uri);
      this.models.set(tab.path, model);
    }

    this.editor.setModel(model);
    this.editor.focus();

    if (this.sbLang) {
      this.sbLang.textContent = tab.language.charAt(0).toUpperCase() + tab.language.slice(1);
    }

    // Trigger layout
    setTimeout(() => this.editor.layout(), 20);
  }

  /**
   * Open Side-by-Side Diff View for Git Changes
   */
  async openDiff(filePath, originalContent, modifiedContent, title = '') {
    if (!this.isInitialized) await this.init();

    this.container.style.display = 'none';
    this.mediaContainer.style.display = 'none';
    this.diffContainer.style.display = 'block';

    const lang = filePath ? this.getLanguageFromPath(filePath) : 'plaintext';

    const origModel = this.monaco.editor.createModel(originalContent || '', lang);
    const modModel = this.monaco.editor.createModel(modifiedContent || '', lang);

    this.diffEditor.setModel({
      original: origModel,
      modified: modModel
    });

    this.updateBreadcrumbs(`Git Diff: ${title || filePath}`);
    setTimeout(() => this.diffEditor.layout(), 20);
  }

  /**
   * Close a tab
   */
  closeTab(tab, event) {
    if (event) event.stopPropagation();

    const index = this.openTabs.indexOf(tab);
    if (index === -1) return;

    this.openTabs.splice(index, 1);

    if (this.activeTab === tab) {
      if (this.openTabs.length > 0) {
        const nextTab = this.openTabs[Math.max(0, index - 1)];
        this.setActiveTab(nextTab);
      } else {
        this.activeTab = null;
        this.container.style.display = 'none';
        this.mediaContainer.style.display = 'none';
        this.diffContainer.style.display = 'none';
        this.breadcrumbsContainer.innerHTML = '<span class="breadcrumb-item">Ready</span>';
      }
    }

    this.renderTabs();
  }

  /**
   * Render editor tabs
   */
  renderTabs() {
    this.tabsContainer.innerHTML = '';
    for (const tab of this.openTabs) {
      const tabEl = document.createElement('div');
      tabEl.className = `editor-tab ${this.activeTab === tab ? 'active' : ''}`;
      tabEl.title = tab.path;

      // File icon
      const icon = document.createElement('span');
      icon.innerHTML = this.getFileIconSvg(tab.extension);

      const name = document.createElement('span');
      name.textContent = tab.name;

      const closeBtn = document.createElement('span');
      closeBtn.className = 'tab-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.onclick = (e) => this.closeTab(tab, e);

      tabEl.appendChild(icon);
      tabEl.appendChild(name);
      tabEl.appendChild(closeBtn);

      tabEl.onclick = () => this.setActiveTab(tab);
      this.tabsContainer.appendChild(tabEl);
    }
  }

  /**
   * Update Breadcrumbs
   */
  updateBreadcrumbs(relPath) {
    if (!relPath) {
      this.breadcrumbsContainer.innerHTML = '<span class="breadcrumb-item">Ready</span>';
      return;
    }

    const parts = relPath.replace(/\\/g, '/').split('/');
    this.breadcrumbsContainer.innerHTML = '';

    parts.forEach((part, index) => {
      const item = document.createElement('span');
      item.className = 'breadcrumb-item';
      item.textContent = part;
      this.breadcrumbsContainer.appendChild(item);

      if (index < parts.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-separator';
        sep.textContent = '›';
        this.breadcrumbsContainer.appendChild(sep);
      }
    });
  }

  /**
   * Helper to detect language
   */
  getLanguageFromPath(filePath) {
    const ext = '.' + filePath.split('.').pop().toLowerCase();
    const map = {
      '.js': 'javascript', '.ts': 'typescript', '.jsx': 'javascript', '.tsx': 'typescript',
      '.py': 'python', '.json': 'json', '.html': 'html', '.css': 'css', '.md': 'markdown',
      '.go': 'go', '.rs': 'rust', '.cpp': 'cpp', '.c': 'c', '.java': 'java'
    };
    return map[ext] || 'plaintext';
  }

  /**
   * File extension icon helper
   */
  getFileIconSvg(ext) {
    const e = (ext || '').toLowerCase();
    if (['.ts', '.tsx'].includes(e)) {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="#3178c6"><rect width="24" height="24" rx="4" fill="#3178c6"/><text x="4" y="17" fill="#fff" font-size="12" font-family="sans-serif" font-weight="bold">TS</text></svg>';
    }
    if (['.js', '.jsx', '.mjs'].includes(e)) {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="#f7df1e"><rect width="24" height="24" rx="4" fill="#f7df1e"/><text x="4" y="17" fill="#000" font-size="12" font-family="sans-serif" font-weight="bold">JS</text></svg>';
    }
    if (['.py'].includes(e)) {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="#3776ab"><rect width="24" height="24" rx="4" fill="#3776ab"/><text x="4" y="17" fill="#ffd43b" font-size="12" font-family="sans-serif" font-weight="bold">PY</text></svg>';
    }
    if (['.json'].includes(e)) {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="#cbcb41"><text x="2" y="17" fill="#cbcb41" font-size="14" font-weight="bold">{}</text></svg>';
    }
    if (['.css', '.scss', '.less'].includes(e)) {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="#264de4"><text x="2" y="17" fill="#264de4" font-size="13" font-weight="bold">#</text></svg>';
    }
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>';
  }

  layout() {
    if (this.editor) this.editor.layout();
    if (this.diffEditor) this.diffEditor.layout();
  }
}

window.monacoController = new MonacoController();
