/**
 * GitDiagram 1s - IDE Controller (Opt-In Developer Mode)
 *
 * Provides:
 * 1. Opt-In Mode Management: Defaults to lightweight, ultra-fast Viewer Mode;
 *    unlocks interactive Terminal, Command Palette, file editing, and status bar upon opt-in.
 * 2. Integrated Terminal Drawer: Embedded xterm.js instance running native system shell.
 * 3. Command Palette (Ctrl+Shift+P / F1): Fuzzy action launcher for developer tasks.
 * 4. IDE Status Bar: Real-time cursor coordinates, language, encoding, and terminal toggle.
 */

class IdeController {
  constructor() {
    // Mode State: Persisted in localStorage, defaults to false (Viewer Mode)
    this.isIdeMode = localStorage.getItem('gitdiagram_ide_mode') === 'true';

    // Terminal State
    this.xterm = null;
    this.fitAddon = null;
    this.terminalSessionId = 'term_main';
    this.isTerminalOpen = false;
    this.isTerminalSpawned = false;

    // UI Elements
    this.modeToggleBtn = document.getElementById('btn-ide-toggle');
    this.modeLabel = document.getElementById('ide-mode-label');
    this.optinModal = document.getElementById('ide-optin-modal');
    this.terminalDrawer = document.getElementById('terminal-drawer');
    this.statusBar = document.getElementById('ide-status-bar');
    this.commandPaletteModal = document.getElementById('command-palette-modal');
    this.commandPaletteInput = document.getElementById('command-palette-input');
    this.commandPaletteResults = document.getElementById('command-palette-results');

    // Status items
    this.statusBranchName = document.getElementById('status-branch-name');
    this.statusCursor = document.getElementById('status-cursor');
    this.statusEncoding = document.getElementById('status-encoding');
    this.statusLang = document.getElementById('status-lang');

    this.paletteCommands = [];
    this.selectedPaletteIndex = 0;
  }

  /**
   * Initialize controller, wire event listeners and setup keyboard shortcuts
   */
  init() {
    this.setupModeToggle();
    this.setupOptinModal();
    this.setupKeyboardShortcuts();
    this.setupCommandPalette();
    this.setupTerminalDrawer();

    // Apply initial state
    this.applyModeState(this.isIdeMode, false);
  }

  /**
   * Wire Mode Toggle in Title Bar
   */
  setupModeToggle() {
    if (!this.modeToggleBtn) return;

    this.modeToggleBtn.onclick = () => {
      if (!this.isIdeMode) {
        // Prompt user with the Opt-In explanation modal
        this.openOptinModal();
      } else {
        // Toggle back to Viewer Mode
        this.setIdeMode(false);
      }
    };
  }

  /**
   * Opt-in Confirmation Modal
   */
  setupOptinModal() {
    const btnClose = document.getElementById('btn-close-ide-optin');
    const btnCancel = document.getElementById('btn-cancel-ide-optin');
    const btnConfirm = document.getElementById('btn-confirm-ide-optin');

    if (btnClose) btnClose.onclick = () => this.closeOptinModal();
    if (btnCancel) btnCancel.onclick = () => this.closeOptinModal();
    if (btnConfirm) {
      btnConfirm.onclick = () => {
        this.closeOptinModal();
        this.setIdeMode(true);
      };
    }

    if (this.optinModal) {
      this.optinModal.onclick = (e) => {
        if (e.target === this.optinModal) this.closeOptinModal();
      };
    }
  }

  openOptinModal() {
    if (this.optinModal) this.optinModal.style.display = 'flex';
  }

  closeOptinModal() {
    if (this.optinModal) this.optinModal.style.display = 'none';
  }

  /**
   * Set IDE Mode ON or OFF
   */
  setIdeMode(enabled) {
    this.isIdeMode = !!enabled;
    localStorage.setItem('gitdiagram_ide_mode', String(this.isIdeMode));
    this.applyModeState(this.isIdeMode, true);
  }

  /**
   * Apply visual and behavioral changes based on mode
   */
  applyModeState(enabled, showToastNotice = false) {
    // 1. Update Title Bar Button
    if (this.modeToggleBtn && this.modeLabel) {
      if (enabled) {
        this.modeToggleBtn.classList.add('is-ide-active');
        this.modeLabel.textContent = 'IDE Mode';
        this.modeToggleBtn.title = 'IDE Mode Active (Terminal, Editing, Command Palette). Click to switch to Viewer Mode.';
      } else {
        this.modeToggleBtn.classList.remove('is-ide-active');
        this.modeLabel.textContent = 'Viewer Mode';
        this.modeToggleBtn.title = 'Lightweight Viewer Mode. Click to enable IDE features.';
      }
    }

    // 2. Status Bar Visibility
    if (this.statusBar) {
      this.statusBar.style.display = enabled ? 'flex' : 'none';
    }

    // 3. Editor Read-Only / Editable Mode
    if (window.monacoController) {
      window.monacoController.setReadOnly(!enabled);
    }

    // 4. Terminal Handling
    if (!enabled) {
      this.closeTerminal();
      if (this.isTerminalSpawned && window.api && window.api.terminal) {
        window.api.terminal.killAll();
        this.isTerminalSpawned = false;
      }
    }

    if (showToastNotice && window.diagramRenderer) {
      const msg = enabled
        ? 'IDE Mode Enabled! Press Ctrl+` for Terminal or Ctrl+Shift+P for Command Palette'
        : 'Switched to Lightweight Viewer Mode';
      window.diagramRenderer.showToast(msg);
    }
  }

  /**
   * Global Keyboard Shortcuts
   */
  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ctrl + ` (Backquote) -> Toggle Integrated Terminal
      if (e.ctrlKey && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault();
        if (!this.isIdeMode) {
          this.openOptinModal();
        } else {
          this.toggleTerminal();
        }
        return;
      }

      // Ctrl + Shift + P or F1 -> Command Palette
      if ((e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) || e.key === 'F1') {
        e.preventDefault();
        if (!this.isIdeMode) {
          this.openOptinModal();
        } else {
          this.openCommandPalette();
        }
        return;
      }

      // Escape -> Close any open modals
      if (e.key === 'Escape') {
        if (this.commandPaletteModal && this.commandPaletteModal.style.display === 'flex') {
          this.closeCommandPalette();
        }
        if (this.optinModal && this.optinModal.style.display === 'flex') {
          this.closeOptinModal();
        }
      }
    });
  }

  /**
   * Integrated Terminal Drawer
   */
  setupTerminalDrawer() {
    const btnClose = document.getElementById('btn-term-close');
    const btnClear = document.getElementById('btn-term-clear');
    const btnTest = document.getElementById('btn-term-test');
    const btnToggleStatus = document.getElementById('btn-toggle-terminal-status');

    if (btnClose) btnClose.onclick = () => this.closeTerminal();
    if (btnClear) btnClear.onclick = () => this.clearTerminal();
    if (btnTest) btnTest.onclick = () => this.runTerminalCommand('npm test\r\n');
    if (btnToggleStatus) btnToggleStatus.onclick = () => this.toggleTerminal();
  }

  initXterm() {
    if (this.xterm) return;

    const container = document.getElementById('xterm-container');
    if (!container || typeof window.Terminal === 'undefined') return;

    this.xterm = new window.Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        selectionBackground: 'rgba(56, 139, 253, 0.4)',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5bb',
        white: '#b1bac4'
      },
      fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      convertEol: true
    });

    if (typeof window.FitAddon !== 'undefined' && window.FitAddon.FitAddon) {
      this.fitAddon = new window.FitAddon.FitAddon();
      this.xterm.loadAddon(this.fitAddon);
    }

    this.xterm.open(container);

    // Send keystrokes to backend process
    this.xterm.onData((data) => {
      if (window.api && window.api.terminal) {
        window.api.terminal.write(this.terminalSessionId, data);
      }
    });

    // Receive output from backend process
    if (window.api && window.api.terminal) {
      window.api.terminal.onData(({ sessionId, data }) => {
        if (sessionId === this.terminalSessionId && this.xterm) {
          this.xterm.write(data);
        }
      });

      window.api.terminal.onExit(({ sessionId, code }) => {
        if (sessionId === this.terminalSessionId && this.xterm) {
          this.xterm.write(`\r\n[Process terminated with exit code ${code}]\r\n`);
          this.isTerminalSpawned = false;
        }
      });
    }

    setTimeout(() => {
      if (this.fitAddon) this.fitAddon.fit();
    }, 100);
  }

  async openTerminal() {
    if (!this.isIdeMode) {
      this.openOptinModal();
      return;
    }

    if (!this.terminalDrawer) return;
    this.terminalDrawer.style.display = 'flex';
    this.isTerminalOpen = true;

    this.initXterm();

    // Spawn backend shell if not yet spawned
    if (!this.isTerminalSpawned && window.api && window.api.terminal) {
      const cwd = window.app && window.app.currentRepoPath ? window.app.currentRepoPath : null;
      const res = await window.api.terminal.spawn(this.terminalSessionId, cwd);
      if (res.success) {
        this.isTerminalSpawned = true;
        const termTitle = document.getElementById('terminal-title');
        if (termTitle) termTitle.textContent = `Terminal (${res.shell || 'Shell'})`;
      }
    }

    setTimeout(() => {
      if (this.fitAddon) this.fitAddon.fit();
      if (this.xterm) this.xterm.focus();
    }, 80);
  }

  closeTerminal() {
    if (this.terminalDrawer) {
      this.terminalDrawer.style.display = 'none';
      this.isTerminalOpen = false;
    }
  }

  toggleTerminal() {
    if (this.isTerminalOpen) {
      this.closeTerminal();
    } else {
      this.openTerminal();
    }
  }

  clearTerminal() {
    if (this.xterm) {
      this.xterm.clear();
    }
  }

  runTerminalCommand(cmd) {
    if (!this.isTerminalOpen) {
      this.openTerminal();
    }
    setTimeout(() => {
      if (window.api && window.api.terminal) {
        window.api.terminal.write(this.terminalSessionId, cmd);
      }
    }, 200);
  }

  /**
   * Command Palette (Ctrl+Shift+P)
   */
  setupCommandPalette() {
    this.paletteCommands = [
      {
        id: 'term-toggle',
        title: 'Terminal: Toggle Integrated Terminal',
        hint: 'Ctrl+`',
        icon: '💻',
        action: () => this.toggleTerminal()
      },
      {
        id: 'term-test',
        title: 'Project: Run Test Suite (npm test)',
        hint: 'Terminal',
        icon: '🧪',
        action: () => this.runTerminalCommand('npm test\r\n')
      },
      {
        id: 'term-start',
        title: 'Project: Run Start Server (npm start)',
        hint: 'Terminal',
        icon: '▶',
        action: () => this.runTerminalCommand('npm start\r\n')
      },
      {
        id: 'file-save',
        title: 'File: Save Active File',
        hint: 'Ctrl+S',
        icon: '💾',
        action: () => {
          if (window.monacoController) window.monacoController.saveActiveFile();
        }
      },
      {
        id: 'file-search',
        title: 'File: Quick Open / Search File',
        hint: 'Ctrl+P',
        icon: '📄',
        action: () => {
          if (window.app) window.app.openQuickSearch();
        }
      },
      {
        id: 'git-branch',
        title: 'Git: Switch Branch',
        hint: 'Git',
        icon: '🌿',
        action: () => {
          if (window.gitController) window.gitController.openBranchModal();
        }
      },
      {
        id: 'diagram-symbols',
        title: 'Diagram: Toggle Code vs Symbols Mode',
        hint: 'GitDiagram',
        icon: '🔍',
        action: () => {
          if (window.diagramRenderer) {
            const next = window.diagramRenderer.currentMode === 'sym' ? 'arch' : 'sym';
            window.diagramRenderer.setMode(next);
          }
        }
      },
      {
        id: 'diagram-export-svg',
        title: 'Diagram: Export as SVG Image',
        hint: 'Export',
        icon: '🖼',
        action: () => {
          if (window.diagramRenderer) window.diagramRenderer.exportSVG();
        }
      },
      {
        id: 'diagram-export-mermaid',
        title: 'Diagram: Export as Mermaid Markdown',
        hint: 'Export',
        icon: '📝',
        action: () => {
          if (window.diagramRenderer) window.diagramRenderer.exportMermaid();
        }
      },
      {
        id: 'mode-viewer',
        title: 'Mode: Switch to Lightweight Viewer Mode',
        hint: 'Lightweight',
        icon: '⚡',
        action: () => this.setIdeMode(false)
      },
      {
        id: 'theme-picker',
        title: 'Preferences: Color Theme',
        hint: 'Theme',
        icon: '🎨',
        action: () => {
          if (window.extensionController) window.extensionController.showThemePickerModal();
        }
      },
      {
        id: 'ext-show',
        title: 'Extensions: Show Installed Extensions',
        hint: 'Ctrl+Shift+X',
        icon: '📦',
        action: () => {
          if (window.app) window.app.switchSidebarTab('extensions');
        }
      },
      {
        id: 'ext-install-vsix',
        title: 'Extensions: Install from VSIX...',
        hint: 'VSIX',
        icon: '📥',
        action: () => {
          if (window.extensionController && window.extensionController.btnInstallVsix) {
            window.extensionController.btnInstallVsix.click();
          }
        }
      },
      {
        id: 'ai-chat',
        title: 'AI: Chat with Vision IDE Agent',
        hint: 'Ctrl+Shift+I',
        icon: '🤖',
        action: () => {
          if (window.app) window.app.switchSidebarTab('ai');
        }
      },
      {
        id: 'ai-settings',
        title: 'AI: Configure Providers & Subscriptions',
        hint: 'Settings',
        icon: '⚙️',
        action: () => {
          if (window.aiController) window.aiController.showSettingsModal();
        }
      },
      {
        id: 'ai-explain-diagram',
        title: 'AI: Explain Architecture Diagram',
        hint: 'Agent',
        icon: '🗺️',
        action: () => {
          if (window.app) window.app.switchSidebarTab('ai');
          if (window.aiController) {
            window.aiController.sendMessage('Explain the overall codebase architecture and modules shown in the diagram.');
          }
        }
      }
    ];

    if (this.commandPaletteInput) {
      this.commandPaletteInput.addEventListener('input', (e) => {
        this.filterPaletteCommands(e.target.value);
      });

      this.commandPaletteInput.addEventListener('keydown', (e) => {
        const items = this.commandPaletteResults ? this.commandPaletteResults.querySelectorAll('.palette-item') : [];
        if (!items || items.length === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.selectedPaletteIndex = (this.selectedPaletteIndex + 1) % items.length;
          this.highlightPaletteItem(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.selectedPaletteIndex = (this.selectedPaletteIndex - 1 + items.length) % items.length;
          this.highlightPaletteItem(items);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const activeItem = items[this.selectedPaletteIndex];
          if (activeItem) activeItem.click();
        }
      });
    }

    if (this.commandPaletteModal) {
      this.commandPaletteModal.onclick = (e) => {
        if (e.target === this.commandPaletteModal) this.closeCommandPalette();
      };
    }
  }

  openCommandPalette() {
    if (!this.commandPaletteModal || !this.commandPaletteInput) return;
    this.commandPaletteModal.style.display = 'flex';
    this.commandPaletteInput.value = '';
    this.filterPaletteCommands('');
    setTimeout(() => this.commandPaletteInput.focus(), 50);
  }

  closeCommandPalette() {
    if (this.commandPaletteModal) this.commandPaletteModal.style.display = 'none';
  }

  filterPaletteCommands(query) {
    if (!this.commandPaletteResults) return;
    this.commandPaletteResults.innerHTML = '';
    const q = (query || '').toLowerCase().trim();

    const filtered = this.paletteCommands.filter(c => {
      return !q || c.title.toLowerCase().includes(q) || (c.hint && c.hint.toLowerCase().includes(q));
    });

    if (filtered.length === 0) {
      this.commandPaletteResults.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12px;">No matching commands</div>';
      return;
    }

    this.selectedPaletteIndex = 0;

    filtered.forEach((cmd, idx) => {
      const item = document.createElement('div');
      item.className = `palette-item ${idx === 0 ? 'selected' : ''}`;
      item.style.cssText = 'padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-radius: 4px; color: var(--text-secondary); font-size: 12px; transition: background 0.1s;';

      const esc = typeof escapeHtml === 'function' ? escapeHtml : str => str;
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span>${cmd.icon}</span>
          <span style="color: var(--text-primary); font-weight: 500;">${esc(cmd.title)}</span>
        </div>
        ${cmd.hint ? `<kbd style="background: var(--bg-primary); border: 1px solid var(--border-subtle); padding: 2px 6px; border-radius: 3px; font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">${esc(cmd.hint)}</kbd>` : ''}
      `;

      item.onclick = () => {
        this.closeCommandPalette();
        cmd.action();
      };

      item.onmouseenter = () => {
        this.selectedPaletteIndex = idx;
        const all = this.commandPaletteResults.querySelectorAll('.palette-item');
        this.highlightPaletteItem(all);
      };

      this.commandPaletteResults.appendChild(item);
    });
  }

  highlightPaletteItem(items) {
    items.forEach((el, i) => {
      if (i === this.selectedPaletteIndex) {
        el.style.background = 'var(--bg-hover)';
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.style.background = 'transparent';
      }
    });
  }

  /**
   * Update Status Bar information
   */
  updateStatusBar(data = {}) {
    if (data.branch && this.statusBranchName) {
      this.statusBranchName.textContent = data.branch;
    }
    if (data.cursor && this.statusCursor) {
      this.statusCursor.textContent = data.cursor;
    }
    if (data.language && this.statusLang) {
      this.statusLang.textContent = data.language;
    }
    if (data.encoding && this.statusEncoding) {
      this.statusEncoding.textContent = data.encoding;
    }
  }
}

window.ideController = new IdeController();
