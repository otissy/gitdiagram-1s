/**
 * GitDiagram 1s - Symbols & Outline Controller
 * Displays defined classes, methods, functions, variables, constants, and interfaces
 * with instant jump-to-line navigation in Monaco Editor.
 */

class OutlineController {
  constructor() {
    this.container = document.getElementById('symbols-outline-container');
    this.currentFilePath = null;
    this.currentRelativePath = null;
    this.currentSymbols = [];
    this.currentCalls = [];
    this.activeFilter = 'all'; // 'all' | 'class' | 'function' | 'variable'
    this.searchQuery = '';

    const filterInput = document.getElementById('file-filter-input');
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        if (window.app && window.app.sidebarOutline && window.app.sidebarOutline.style.display !== 'none') {
          this.setSearch(e.target.value);
        }
      });
    }
  }

  /**
   * Load and extract symbols for active file
   */
  async loadSymbols(filePath, relativePath) {
    if (!filePath || filePath === this.currentFilePath) return;

    this.currentFilePath = filePath;
    this.currentRelativePath = relativePath || filePath;

    if (!this.container) return;
    this.container.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px;">Extracting symbols...</div>';

    try {
      const res = await window.api.getFileSymbols(filePath);
      this.currentSymbols = res.symbols || [];
      this.currentCalls = res.calls || [];
      this.render();
    } catch (err) {
      this.container.innerHTML = `<div style="padding: 12px; color: var(--accent-red); font-size: 12px;">Failed to extract symbols: ${err.message}</div>`;
    }
  }

  /**
   * Set symbol kind filter
   */
  setFilter(kind) {
    this.activeFilter = kind;
    this.render();
  }

  /**
   * Filter by search query
   */
  setSearch(query) {
    this.searchQuery = (query || '').toLowerCase().trim();
    this.render();
  }

  /**
   * Render outline UI
   */
  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (!this.currentSymbols || this.currentSymbols.length === 0) {
      this.container.innerHTML = `
        <div class="outline-container">
          <div class="outline-file-header">
            <span>📄</span>
            <span>${this.currentRelativePath || 'No file selected'}</span>
          </div>
          <div style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 12px;">
            No symbols (classes, functions, variables) found in this file.
          </div>
        </div>
      `;
      return;
    }

    const totalCount = this.currentSymbols.length;
    const classCount = this.currentSymbols.filter(s => s.kind === 'class').length;
    const funcCount = this.currentSymbols.filter(s => s.kind === 'function' || s.kind === 'method').length;
    const varCount = this.currentSymbols.filter(s => s.kind === 'variable' || s.kind === 'constant').length;

    const wrap = document.createElement('div');
    wrap.className = 'outline-container';

    // File Header
    const header = document.createElement('div');
    header.className = 'outline-file-header';
    header.innerHTML = `
      <span>📄</span>
      <span style="font-weight: 600; color: var(--text-primary);">${this.currentRelativePath}</span>
      <span style="font-size: 10px; color: var(--text-muted); margin-left: auto;">${totalCount} symbols</span>
    `;
    wrap.appendChild(header);

    // Filter pills bar
    const filterBar = document.createElement('div');
    filterBar.className = 'outline-filter-bar';
    filterBar.innerHTML = `
      <button class="outline-filter-pill ${this.activeFilter === 'all' ? 'active' : ''}" data-kind="all">All (${totalCount})</button>
      <button class="outline-filter-pill ${this.activeFilter === 'class' ? 'active' : ''}" data-kind="class">Classes (${classCount})</button>
      <button class="outline-filter-pill ${this.activeFilter === 'function' ? 'active' : ''}" data-kind="function">Functions (${funcCount})</button>
      <button class="outline-filter-pill ${this.activeFilter === 'variable' ? 'active' : ''}" data-kind="variable">Vars (${varCount})</button>
    `;

    filterBar.querySelectorAll('.outline-filter-pill').forEach(btn => {
      btn.onclick = () => this.setFilter(btn.dataset.kind);
    });
    wrap.appendChild(filterBar);

    // Filter symbols based on activeFilter and searchQuery
    let filtered = this.currentSymbols.filter(s => {
      if (this.activeFilter === 'class') return s.kind === 'class' || s.kind === 'interface';
      if (this.activeFilter === 'function') return s.kind === 'function' || s.kind === 'method';
      if (this.activeFilter === 'variable') return s.kind === 'variable' || s.kind === 'constant';
      return true;
    });

    if (this.searchQuery) {
      filtered = filtered.filter(s => s.name.toLowerCase().includes(this.searchQuery) || (s.shortName && s.shortName.toLowerCase().includes(this.searchQuery)));
    }

    // List of Symbols
    const list = document.createElement('div');
    list.className = 'outline-list';

    // Group methods under their classes if 'all' or 'class' view
    const classes = filtered.filter(s => s.kind === 'class');
    const methods = filtered.filter(s => s.kind === 'method');
    const nonMethodSymbols = filtered.filter(s => s.kind !== 'method');

    // Render helper for single symbol row
    const createSymbolRow = (s, isMethod = false) => {
      const row = document.createElement('div');
      row.className = `outline-item ${isMethod ? 'is-method' : ''}`;
      row.title = `${s.kind.toUpperCase()}: ${s.name} (Line ${s.line})`;

      // Badge icon
      const badge = document.createElement('span');
      badge.className = `symbol-kind-badge symbol-kind-${s.kind}`;
      badge.textContent = this.getBadgeText(s.kind);

      // Name
      const name = document.createElement('span');
      name.className = 'outline-symbol-name';
      name.textContent = s.shortName || s.name;

      // Params if function or method
      let params = null;
      if (s.params !== undefined && s.params !== null) {
        params = document.createElement('span');
        params.className = 'outline-symbol-params';
        params.textContent = `(${s.params})`;
      }

      // Line number badge
      const lineBadge = document.createElement('span');
      lineBadge.className = 'outline-symbol-line';
      lineBadge.textContent = `:${s.line}`;

      row.appendChild(badge);
      row.appendChild(name);
      if (params) row.appendChild(params);
      row.appendChild(lineBadge);

      // Click to jump in Monaco Editor!
      row.onclick = () => {
        document.querySelectorAll('.outline-item').forEach(el => el.classList.remove('active'));
        row.classList.add('active');

        // Instant Monaco jump
        window.monacoController.openFileAndReveal(this.currentFilePath, this.currentRelativePath, s.line, s.name);

        // Highlight in Diagram if in symbols mode
        if (window.diagramRenderer && window.diagramRenderer.currentMode === 'sym') {
          window.diagramRenderer.highlightSymbolNode(s.name);
        }
      };

      return row;
    };

    // Render tree with hierarchy
    const renderedMethods = new Set();

    for (const sym of nonMethodSymbols) {
      const row = createSymbolRow(sym);
      list.appendChild(row);

      // If class, nest its methods underneath
      if (sym.kind === 'class') {
        const classMethods = methods.filter(m => m.parentSymbol === sym.name);
        for (const m of classMethods) {
          renderedMethods.add(m);
          list.appendChild(createSymbolRow(m, true));
        }
      }
    }

    // Any orphaned methods not under a class
    for (const m of methods) {
      if (!renderedMethods.has(m)) {
        list.appendChild(createSymbolRow(m, false));
      }
    }

    wrap.appendChild(list);
    this.container.appendChild(wrap);
  }

  getBadgeText(kind) {
    switch (kind) {
      case 'class': return 'C';
      case 'method': return 'M';
      case 'function': return 'ƒ';
      case 'variable': return 'V';
      case 'constant': return 'K';
      case 'interface': return 'I';
      default: return 'S';
    }
  }
}

window.outlineController = new OutlineController();
