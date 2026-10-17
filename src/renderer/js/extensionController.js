/**
 * Vision IDE - VS Code Extensions & Theme Controller
 * Browse Open VSX, install .vsix, manage extensions, and apply VS Code themes to Monaco
 */

class ExtensionController {
  constructor() {
    this.container = document.getElementById('sidebar-content-extensions');
    this.searchInput = document.getElementById('ext-search-input');
    this.tabInstalled = document.getElementById('ext-tab-installed');
    this.tabMarketplace = document.getElementById('ext-tab-marketplace');
    this.installedCountBadge = document.getElementById('ext-count-installed');
    this.listContainer = document.getElementById('ext-list-container');
    this.btnInstallVsix = document.getElementById('btn-install-vsix');
    this.btnPickTheme = document.getElementById('btn-pick-theme');

    this.currentTab = 'installed'; // 'installed' | 'marketplace'
    this.installedExtensions = [];
    this.searchTimer = null;
    this.registeredSnippets = [];

    this.bindEvents();
  }

  async init() {
    await this.refreshInstalled();
    await this.loadActiveTheme();
    await this.registerSnippets();
  }

  bindEvents() {
    if (this.tabInstalled) {
      this.tabInstalled.onclick = () => {
        this.currentTab = 'installed';
        this.tabInstalled.classList.add('active');
        this.tabInstalled.style.color = 'var(--text-primary)';
        this.tabMarketplace.classList.remove('active');
        this.tabMarketplace.style.color = 'var(--text-muted)';
        this.renderInstalled();
      };
    }

    if (this.tabMarketplace) {
      this.tabMarketplace.onclick = () => {
        this.currentTab = 'marketplace';
        this.tabMarketplace.classList.add('active');
        this.tabMarketplace.style.color = 'var(--text-primary)';
        this.tabInstalled.classList.remove('active');
        this.tabInstalled.style.color = 'var(--text-muted)';
        this.searchMarketplace(this.searchInput ? this.searchInput.value : '');
      };
    }

    if (this.searchInput) {
      this.searchInput.oninput = (e) => {
        const q = e.target.value.trim();
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
          if (this.currentTab === 'marketplace') {
            this.searchMarketplace(q);
          } else {
            this.renderInstalled(q);
          }
        }, 400);
      };
    }

    if (this.btnInstallVsix) {
      this.btnInstallVsix.onclick = async () => {
        try {
          const res = await window.api.extensions.installVsix();
          if (res && res.success) {
            window.app.showToast(`Installed ${res.extension.displayName || res.extension.name}`);
            await this.refreshInstalled();
            if (this.currentTab === 'installed') this.renderInstalled();
          } else if (res && res.error) {
            alert(`Failed to install VSIX: ${res.error}`);
          }
        } catch (e) {
          alert(`Error installing VSIX: ${e.message}`);
        }
      };
    }

    if (this.btnPickTheme) {
      this.btnPickTheme.onclick = () => this.showThemePickerModal();
    }
  }

  async refreshInstalled() {
    try {
      this.installedExtensions = await window.api.extensions.getInstalled();
      if (this.installedCountBadge) {
        this.installedCountBadge.textContent = this.installedExtensions.length;
      }
    } catch (e) {
      console.warn('Failed to fetch installed extensions:', e);
    }
  }

  renderInstalled(filter = '') {
    if (!this.listContainer) return;
    this.listContainer.innerHTML = '';

    const q = filter.toLowerCase();
    const list = this.installedExtensions.filter(e => {
      if (!q) return true;
      return (e.displayName && e.displayName.toLowerCase().includes(q)) ||
             (e.name && e.name.toLowerCase().includes(q)) ||
             (e.publisher && e.publisher.toLowerCase().includes(q));
    });

    if (list.length === 0) {
      this.listContainer.innerHTML = `
        <div style="padding: 24px 12px; text-align: center; color: var(--text-muted); font-size: 12px;">
          ${filter ? 'No installed extensions match your search.' : 'No extensions installed yet.<br>Search the Open VSX Marketplace or install a .vsix file.'}
        </div>
      `;
      return;
    }

    for (const ext of list) {
      const card = document.createElement('div');
      card.className = 'ext-card';
      card.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 10px;
        margin-bottom: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      `;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; font-size: 12px; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              ${escapeHtml(ext.displayName || ext.name)}
            </div>
            <div style="font-size: 11px; color: var(--text-muted);">
              ${escapeHtml(ext.publisher)} • v${escapeHtml(ext.version)}
            </div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="btn-toggle-ext" style="font-size: 10px; padding: 2px 6px; border-radius: 3px; border: 1px solid var(--border-color); background: transparent; color: ${ext.enabled ? '#3fb950' : '#8b949e'}; cursor: pointer;">
              ${ext.enabled ? 'Enabled' : 'Disabled'}
            </button>
            <button class="btn-uninstall-ext" style="font-size: 10px; padding: 2px 6px; border-radius: 3px; border: 1px solid #f85149; background: rgba(248, 81, 73, 0.1); color: #f85149; cursor: pointer;">
              Uninstall
            </button>
          </div>
        </div>
        <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${escapeHtml(ext.description || 'No description provided.')}
        </div>
        ${ext.themesCount > 0 ? `<div style="font-size: 10px; color: #58a6ff;">🎨 Contributes ${ext.themesCount} color theme(s)</div>` : ''}
      `;

      const btnToggle = card.querySelector('.btn-toggle-ext');
      btnToggle.onclick = async () => {
        const nextState = !ext.enabled;
        await window.api.extensions.toggle(ext.id, nextState);
        ext.enabled = nextState;
        this.renderInstalled(filter);
      };

      const btnUninstall = card.querySelector('.btn-uninstall-ext');
      btnUninstall.onclick = async () => {
        if (confirm(`Uninstall ${ext.displayName || ext.name}?`)) {
          await window.api.extensions.uninstall(ext.id);
          await this.refreshInstalled();
          this.renderInstalled(filter);
        }
      };

      this.listContainer.appendChild(card);
    }
  }

  async searchMarketplace(query = '') {
    if (!this.listContainer) return;
    this.listContainer.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">
        Searching Open VSX Registry...
      </div>
    `;

    try {
      const res = await window.api.extensions.search(query, 1);
      if (res.error) {
        this.listContainer.innerHTML = `<div style="padding: 16px; color: var(--accent-red); font-size: 12px;">${escapeHtml(res.error)}</div>`;
        return;
      }

      if (!res.extensions || res.extensions.length === 0) {
        this.listContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">No extensions found for "${escapeHtml(query)}"</div>`;
        return;
      }

      this.listContainer.innerHTML = '';
      for (const ext of res.extensions) {
        const isInstalled = this.installedExtensions.some(e => e.id === ext.id);

        const card = document.createElement('div');
        card.className = 'ext-card';
        card.style.cssText = `
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 10px;
          margin-bottom: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        `;

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div style="display: flex; gap: 8px; flex: 1; min-width: 0;">
              ${ext.iconUrl ? `<img src="${escapeHtml(ext.iconUrl)}" style="width: 28px; height: 28px; border-radius: 4px; object-fit: contain;">` : `<div style="width: 28px; height: 28px; border-radius: 4px; background: rgba(88,166,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 14px;">📦</div>`}
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 600; font-size: 12px; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                  ${escapeHtml(ext.displayName || ext.name)}
                </div>
                <div style="font-size: 11px; color: var(--text-muted);">
                  ${escapeHtml(ext.publisher)} • v${escapeHtml(ext.version)}
                </div>
              </div>
            </div>
            <button class="btn-install-marketplace" style="font-size: 11px; padding: 4px 10px; border-radius: 4px; font-weight: 600; cursor: pointer; border: 1px solid var(--border-color); background: ${isInstalled ? 'transparent' : 'var(--accent-blue)'}; color: ${isInstalled ? 'var(--text-muted)' : '#ffffff'};" ${isInstalled ? 'disabled' : ''}>
              ${isInstalled ? 'Installed' : 'Install'}
            </button>
          </div>
          <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(ext.description || 'No description.')}
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted);">
            <span>⬇ ${ext.downloads.toLocaleString()} downloads</span>
            <span>★ ${(ext.rating || 0).toFixed(1)}</span>
          </div>
        `;

        const btnInstall = card.querySelector('.btn-install-marketplace');
        if (!isInstalled) {
          btnInstall.onclick = async () => {
            btnInstall.textContent = 'Installing...';
            btnInstall.disabled = true;
            try {
              const installRes = await window.api.extensions.installMarketplace(ext.id);
              if (installRes && installRes.success) {
                btnInstall.textContent = 'Installed';
                btnInstall.style.background = 'transparent';
                btnInstall.style.color = 'var(--text-muted)';
                window.app.showToast(`Installed ${ext.displayName || ext.name}!`);
                await this.refreshInstalled();
              } else {
                btnInstall.textContent = 'Install';
                btnInstall.disabled = false;
                alert(`Install failed: ${installRes.error || 'Unknown error'}`);
              }
            } catch (err) {
              btnInstall.textContent = 'Install';
              btnInstall.disabled = false;
              alert(`Error: ${err.message}`);
            }
          };
        }

        this.listContainer.appendChild(card);
      }
    } catch (e) {
      this.listContainer.innerHTML = `<div style="padding: 16px; color: var(--accent-red); font-size: 12px;">Failed to search: ${escapeHtml(e.message)}</div>`;
    }
  }

  async showThemePickerModal() {
    let modal = document.getElementById('modal-theme-picker');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-theme-picker';
      modal.className = 'modal-overlay';
      modal.style.display = 'none';
      document.body.appendChild(modal);
    }

    const themes = await window.api.extensions.getThemes();

    modal.innerHTML = `
      <div class="modal-card" style="width: 480px; max-width: 90vw;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">🎨</span>
            <h3 style="font-size: 14px; font-weight: 600; margin: 0; color: var(--text-primary);">Select Color Theme</h3>
          </div>
          <button class="modal-close-btn">&times;</button>
        </div>
        <div style="padding: 12px; max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">
          ${themes.map(t => `
            <div class="theme-option-item" data-id="${escapeHtml(t.id)}" style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: var(--bg-secondary);">
              <div>
                <div style="font-weight: 600; font-size: 12px; color: var(--text-primary);">${escapeHtml(t.label)}</div>
                <div style="font-size: 10px; color: var(--text-muted);">${t.isBuiltin ? 'Built-in Theme' : `Extension: ${escapeHtml(t.extensionId)}`}</div>
              </div>
              <span style="font-size: 11px; padding: 2px 6px; border-radius: 10px; background: rgba(88,166,255,0.1); color: #58a6ff;">${t.uiTheme === 'vs' ? 'Light' : 'Dark'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    modal.querySelector('.modal-close-btn').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

    modal.querySelectorAll('.theme-option-item').forEach(item => {
      item.onclick = async () => {
        const themeId = item.dataset.id;
        await this.applyTheme(themeId);
        modal.style.display = 'none';
        window.app.showToast(`Theme applied: ${item.querySelector('div').textContent.trim()}`);
      };
    });
  }

  async applyTheme(themeKey) {
    const def = await window.api.extensions.setTheme(themeKey);
    if (!def) return;

    if (window.monacoController && window.monacoController.monaco) {
      const monaco = window.monacoController.monaco;
      if (def.isCustom) {
        monaco.editor.defineTheme(def.id, {
          base: def.base,
          inherit: true,
          rules: def.rules,
          colors: def.colors
        });
        monaco.editor.setTheme(def.id);
      } else {
        monaco.editor.setTheme(def.id);
      }
    }

    // Apply UI theme variables if provided
    if (def.uiColors) {
      const root = document.documentElement;
      if (def.uiColors.bgPrimary) root.style.setProperty('--bg-primary', def.uiColors.bgPrimary);
      if (def.uiColors.bgSecondary) root.style.setProperty('--bg-secondary', def.uiColors.bgSecondary);
      if (def.uiColors.textPrimary) root.style.setProperty('--text-primary', def.uiColors.textPrimary);
      if (def.uiColors.textMuted) root.style.setProperty('--text-muted', def.uiColors.textMuted);
      if (def.uiColors.borderColor) root.style.setProperty('--border-color', def.uiColors.borderColor);
      if (def.uiColors.accentColor) root.style.setProperty('--accent-blue', def.uiColors.accentColor);
    }
  }

  async loadActiveTheme() {
    try {
      const themes = await window.api.extensions.getThemes();
      if (themes && themes.length > 0) {
        // Theme was saved in extensionService settings
      }
    } catch (e) {}
  }

  async registerSnippets() {
    try {
      const snippetGroups = await window.api.extensions.getSnippets();
      if (!snippetGroups || snippetGroups.length === 0) return;

      if (window.monacoController && window.monacoController.monaco) {
        const monaco = window.monacoController.monaco;
        for (const group of snippetGroups) {
          if (!group.language || !group.snippets) continue;
          const suggestions = [];
          for (const [name, snip] of Object.entries(group.snippets)) {
            const body = Array.isArray(snip.body) ? snip.body.join('\n') : snip.body;
            suggestions.push({
              label: snip.prefix || name,
              kind: monaco.languages.CompletionItemKind.Snippet,
              documentation: snip.description || name,
              insertText: body,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            });
          }

          monaco.languages.registerCompletionItemProvider(group.language, {
            provideCompletionItems: () => ({ suggestions })
          });
        }
      }
    } catch (e) {}
  }
}

window.ExtensionController = ExtensionController;
window.extensionController = new ExtensionController();
