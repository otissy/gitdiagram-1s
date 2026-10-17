/**
 * Vision IDE - AI Agent & Subscription Controller
 * Supports Antigravity, Anthropic Claude, OpenAI, Google Gemini, Ollama, LM Studio, OpenRouter
 */

class AiController {
  constructor() {
    this.container = document.getElementById('sidebar-content-ai');
    this.chatMessages = document.getElementById('ai-chat-messages');
    this.chatInput = document.getElementById('ai-chat-input');
    this.btnSend = document.getElementById('btn-ai-send');
    this.btnSettings = document.getElementById('btn-ai-settings');
    this.providerPill = document.getElementById('ai-active-provider-pill');
    this.providerLabel = document.getElementById('ai-provider-label');
    this.modelTag = document.getElementById('ai-model-tag');

    this.currentResponseEl = null;
    this.currentResponseText = '';
    this.isStreaming = false;
    this.config = null;

    this.bindEvents();
    this.initStreamingListeners();
  }

  async init() {
    await this.refreshConfig();
    this.renderWelcome();
  }

  async refreshConfig() {
    try {
      this.config = await window.api.ai.getConfig();
      if (this.providerLabel) {
        const names = {
          antigravity: '⚡ Antigravity',
          anthropic: '🟣 Claude 3.5',
          openai: '🟢 OpenAI',
          gemini: '🔵 Gemini',
          ollama: '🦙 Ollama',
          lmstudio: '🧪 LM Studio',
          openrouter: '🌐 OpenRouter'
        };
        this.providerLabel.textContent = names[this.config.activeProvider] || this.config.activeProvider;
      }
      if (this.modelTag) {
        this.modelTag.textContent = this.config.models[this.config.activeProvider] || 'auto';
      }
    } catch (e) {
      console.warn('Failed to load AI config:', e);
    }
  }

  bindEvents() {
    if (this.btnSend) {
      this.btnSend.onclick = () => this.sendMessage();
    }

    if (this.chatInput) {
      this.chatInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      };
    }

    if (this.btnSettings) {
      this.btnSettings.onclick = () => this.showSettingsModal();
    }

    // Quick action chips
    document.querySelectorAll('.ai-chip').forEach(chip => {
      chip.onclick = () => {
        const prompt = chip.dataset.prompt;
        if (prompt) {
          this.sendMessage(prompt);
        }
      };
    });
  }

  initStreamingListeners() {
    window.api.ai.onChunk((chunk) => {
      if (!this.currentResponseEl) {
        this.currentResponseEl = this.appendMessage('assistant', '');
      }
      this.currentResponseText += chunk;
      this.currentResponseEl.innerHTML = this.formatMarkdown(this.currentResponseText);
      this.bindCodeBlockButtons(this.currentResponseEl);
      this.scrollToBottom();
    });

    window.api.ai.onDone(() => {
      this.isStreaming = false;
      if (this.btnSend) {
        this.btnSend.textContent = 'Send';
        this.btnSend.classList.remove('btn-danger');
      }
      this.currentResponseEl = null;
      this.currentResponseText = '';
    });

    window.api.ai.onError((err) => {
      this.isStreaming = false;
      if (this.btnSend) {
        this.btnSend.textContent = 'Send';
        this.btnSend.classList.remove('btn-danger');
      }
      this.appendMessage('system', `Error: ${err}`);
      this.currentResponseEl = null;
      this.currentResponseText = '';
    });
  }

  renderWelcome() {
    if (!this.chatMessages || this.chatMessages.children.length > 0) return;
    this.appendMessage('assistant', `
### 👋 Welcome to Vision IDE Agent
I can help you explore this codebase, analyze diagrams, find bugs, or write code.

- **Configured AI Provider:** \`${this.providerLabel ? this.providerLabel.textContent : 'Antigravity'}\`
- Click the **⚙️ Settings icon** above to bring your own subscription:
  - ⚡ **Antigravity CLI** (\`agy\`)
  - 🟣 **Anthropic** (Claude 3.5 / 3.7 Sonnet)
  - 🟢 **OpenAI** (GPT-4o, o1)
  - 🔵 **Google Gemini** (Gemini 1.5 Pro/Flash)
  - 🦙 **Ollama / LM Studio** (Local open-source models)
    `);
  }

  async sendMessage(customPrompt = null) {
    if (this.isStreaming) {
      // Abort
      await window.api.ai.abort();
      this.isStreaming = false;
      if (this.btnSend) this.btnSend.textContent = 'Send';
      return;
    }

    const text = customPrompt || (this.chatInput ? this.chatInput.value.trim() : '');
    if (!text) return;

    if (this.chatInput && !customPrompt) {
      this.chatInput.value = '';
    }

    this.appendMessage('user', text);
    this.isStreaming = true;
    if (this.btnSend) {
      this.btnSend.textContent = 'Stop';
      this.btnSend.classList.add('btn-danger');
    }

    // Gather active workspace context
    const context = {
      repoName: window.app ? window.app.currentRepoName : '',
      activeFilePath: null,
      language: null,
      fileContent: null,
      selectedText: null
    };

    if (window.monacoController && window.monacoController.activeTab) {
      context.activeFilePath = window.monacoController.activeTab.relativePath;
      context.language = window.monacoController.activeTab.language;

      if (window.monacoController.editor) {
        const sel = window.monacoController.editor.getSelection();
        const model = window.monacoController.editor.getModel();
        if (model) {
          if (sel && !sel.isEmpty()) {
            context.selectedText = model.getValueInRange(sel);
          }
          context.fileContent = model.getValue().slice(0, 10000);
        }
      }
    }

    this.currentResponseEl = null;
    this.currentResponseText = '';

    await window.api.ai.chat(text, context);
  }

  appendMessage(role, text) {
    if (!this.chatMessages) return null;

    const msg = document.createElement('div');
    msg.className = `ai-msg ai-msg-${role}`;
    msg.style.cssText = `
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.5;
      max-width: 95%;
      word-break: break-word;
      ${role === 'user'
        ? 'background: #1f6feb; color: #ffffff; align-self: flex-end; margin-left: 20px;'
        : role === 'system'
        ? 'background: rgba(248,81,73,0.1); border: 1px solid #f85149; color: #f85149; align-self: center;'
        : 'background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); align-self: flex-start; margin-right: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);'}
    `;

    msg.innerHTML = role === 'user' ? escapeHtml(text).replace(/\n/g, '<br>') : this.formatMarkdown(text);
    if (role === 'assistant') {
      this.bindCodeBlockButtons(msg);
    }

    this.chatMessages.appendChild(msg);
    this.scrollToBottom();
    return msg;
  }

  formatMarkdown(content) {
    if (!content) return '';

    // Simple robust markdown parser for code blocks and inline formatting
    let html = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Fenced code blocks ```lang ... ```
    html = html.replace(/```([a-zA-Z0-9_\-\.]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `
        <div class="ai-code-block" style="margin: 8px 0; border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; background: #0d1117;">
          <div style="background: rgba(255,255,255,0.05); padding: 4px 10px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); border-bottom: 1px solid var(--border-color);">
            <span>${lang || 'code'}</span>
            <div style="display: flex; gap: 6px;">
              <button class="btn-copy-code" style="background: transparent; border: 1px solid var(--border-color); border-radius: 3px; color: var(--text-muted); cursor: pointer; padding: 2px 6px; font-size: 10px;">Copy</button>
              <button class="btn-insert-code" style="background: rgba(88,166,255,0.15); border: 1px solid #58a6ff; border-radius: 3px; color: #58a6ff; cursor: pointer; padding: 2px 6px; font-size: 10px;">Insert in Editor</button>
            </div>
          </div>
          <pre style="margin: 0; padding: 10px; font-family: 'Cascadia Code', Consolas, monospace; font-size: 11px; overflow-x: auto; color: #c9d1d9;"><code>${code}</code></pre>
        </div>
      `;
    });

    // Inline `code`
    html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 11px;">$1</code>');

    // Bold **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Headings
    html = html.replace(/^### (.*$)/gim, '<h4 style="margin: 6px 0; color: #58a6ff; font-size: 13px;">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 style="margin: 8px 0; color: #58a6ff; font-size: 14px;">$1</h3>');

    // Lists
    html = html.replace(/^\- (.*$)/gim, '• $1<br>');

    // Paragraph breaks
    html = html.replace(/\n\n/g, '<br><br>');

    return html;
  }

  bindCodeBlockButtons(container) {
    container.querySelectorAll('.ai-code-block').forEach(block => {
      const code = block.querySelector('code').textContent;
      const btnCopy = block.querySelector('.btn-copy-code');
      const btnInsert = block.querySelector('.btn-insert-code');

      if (btnCopy) {
        btnCopy.onclick = () => {
          navigator.clipboard.writeText(code);
          btnCopy.textContent = 'Copied!';
          setTimeout(() => btnCopy.textContent = 'Copy', 1500);
        };
      }

      if (btnInsert) {
        btnInsert.onclick = () => {
          if (window.monacoController && window.monacoController.editor) {
            const ed = window.monacoController.editor;
            const selection = ed.getSelection();
            ed.executeEdits('ai-agent', [{ range: selection, text: code, forceMoveMarkers: true }]);
            window.app.showToast('Inserted code into editor');
          }
        };
      }
    });
  }

  scrollToBottom() {
    if (this.chatMessages) {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
  }

  async showSettingsModal() {
    let modal = document.getElementById('modal-ai-settings');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-ai-settings';
      modal.className = 'modal-overlay';
      modal.style.display = 'none';
      document.body.appendChild(modal);
    }

    const conf = await window.api.ai.getConfig();

    modal.innerHTML = `
      <div class="modal-card" style="width: 520px; max-width: 95vw;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">🤖</span>
            <h3 style="font-size: 14px; font-weight: 600; margin: 0; color: var(--text-primary);">AI Subscriptions & Providers</h3>
          </div>
          <button class="modal-close-btn">&times;</button>
        </div>
        <div style="padding: 16px; font-size: 12px; display: flex; flex-direction: column; gap: 14px; max-height: 70vh; overflow-y: auto;">
          <!-- Provider Picker -->
          <div>
            <label style="font-weight: 600; display: block; margin-bottom: 6px; color: var(--text-primary);">Active AI Provider</label>
            <select id="setting-ai-provider" style="width: 100%; padding: 8px; border-radius: 6px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
              <option value="antigravity" ${conf.activeProvider === 'antigravity' ? 'selected' : ''}>⚡ Google Antigravity (Local agy CLI)</option>
              <option value="anthropic" ${conf.activeProvider === 'anthropic' ? 'selected' : ''}>🟣 Anthropic Claude (Claude 3.5 / 3.7 Sonnet)</option>
              <option value="openai" ${conf.activeProvider === 'openai' ? 'selected' : ''}>🟢 OpenAI (GPT-4o, o1, o3-mini)</option>
              <option value="gemini" ${conf.activeProvider === 'gemini' ? 'selected' : ''}>🔵 Google Gemini (Gemini 1.5 Pro, Flash)</option>
              <option value="ollama" ${conf.activeProvider === 'ollama' ? 'selected' : ''}>🦙 Ollama (Local open-source models)</option>
              <option value="lmstudio" ${conf.activeProvider === 'lmstudio' ? 'selected' : ''}>🧪 LM Studio (Local localhost:1234)</option>
              <option value="openrouter" ${conf.activeProvider === 'openrouter' ? 'selected' : ''}>🌐 OpenRouter / DeepSeek</option>
            </select>
          </div>

          <!-- Antigravity status -->
          <div id="section-antigravity-info" style="background: rgba(88,166,255,0.08); border: 1px solid rgba(88,166,255,0.3); border-radius: 6px; padding: 10px; font-size: 11px;">
            <div style="font-weight: 600; color: #58a6ff; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
              <span>⚡ Google Antigravity Agent Engine</span>
              <a href="#" id="link-antigravity-gh" style="color: #58a6ff; font-weight: normal; text-decoration: underline;">github.com/google-antigravity</a>
            </div>
            <div>Status: ${conf.antigravityAvailable ? '🟢 Installed at ' + escapeHtml(conf.antigravityCliPath) : '🟡 agy CLI not found in default paths'}</div>
            <div style="margin-top: 6px; color: var(--text-muted); line-height: 1.4;">
              Harnesses the reasoning, execution, and orchestration capabilities of Google Antigravity (<a href="#" id="link-antigravity-cli" style="color: #79c0ff;">antigravity-cli</a> &amp; <a href="#" id="link-antigravity-sdk" style="color: #79c0ff;">antigravity-sdk-python</a>).
            </div>
          </div>

          <!-- API Keys -->
          <div id="section-api-keys">
            <label style="font-weight: 600; display: block; margin-bottom: 6px; color: var(--text-primary);">API Keys (Stored securely in local app data)</label>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div>
                <span style="font-size: 11px; color: var(--text-muted);">Anthropic Claude API Key:</span>
                <input type="password" id="key-anthropic" placeholder="${conf.keysMasked.anthropic || 'sk-ant-...'}" style="width: 100%; padding: 6px; border-radius: 4px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
              </div>
              <div>
                <span style="font-size: 11px; color: var(--text-muted);">OpenAI API Key:</span>
                <input type="password" id="key-openai" placeholder="${conf.keysMasked.openai || 'sk-proj-...'}" style="width: 100%; padding: 6px; border-radius: 4px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
              </div>
              <div>
                <span style="font-size: 11px; color: var(--text-muted);">Google Gemini API Key:</span>
                <input type="password" id="key-gemini" placeholder="${conf.keysMasked.gemini || 'AIzaSy...'}" style="width: 100%; padding: 6px; border-radius: 4px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
              </div>
              <div>
                <span style="font-size: 11px; color: var(--text-muted);">OpenRouter API Key:</span>
                <input type="password" id="key-openrouter" placeholder="${conf.keysMasked.openrouter || 'sk-or-...'}" style="width: 100%; padding: 6px; border-radius: 4px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
              </div>
            </div>
          </div>

          <!-- Local Endpoints -->
          <div id="section-endpoints">
            <label style="font-weight: 600; display: block; margin-bottom: 6px; color: var(--text-primary);">Local & Custom Endpoints</label>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div>
                <span style="font-size: 11px; color: var(--text-muted);">Ollama Base URL:</span>
                <input type="text" id="ep-ollama" value="${escapeHtml(conf.endpoints.ollama || 'http://localhost:11434')}" style="width: 100%; padding: 6px; border-radius: 4px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
              </div>
              <div>
                <span style="font-size: 11px; color: var(--text-muted);">LM Studio Base URL:</span>
                <input type="text" id="ep-lmstudio" value="${escapeHtml(conf.endpoints.lmstudio || 'http://localhost:1234/v1')}" style="width: 100%; padding: 6px; border-radius: 4px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary);">
              </div>
            </div>
          </div>

          <!-- Test Connection Status -->
          <div id="ai-test-status" style="font-size: 11px; display: none; padding: 8px; border-radius: 4px;"></div>
        </div>
        <div class="modal-footer" style="padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); background: var(--bg-secondary);">
          <button id="btn-ai-test-conn" class="btn-secondary" style="font-size: 12px; padding: 6px 14px;">Test Connection</button>
          <div style="display: flex; gap: 8px;">
            <button id="btn-ai-cancel-settings" class="btn-secondary" style="font-size: 12px; padding: 6px 14px;">Cancel</button>
            <button id="btn-ai-save-settings" class="btn-primary" style="font-size: 12px; padding: 6px 16px;">Save Settings</button>
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    const closeBtn = modal.querySelector('.modal-close-btn');
    const cancelBtn = modal.querySelector('#btn-ai-cancel-settings');
    const saveBtn = modal.querySelector('#btn-ai-save-settings');
    const testBtn = modal.querySelector('#btn-ai-test-conn');
    const statusBox = modal.querySelector('#ai-test-status');
    const providerSelect = modal.querySelector('#setting-ai-provider');
    const linkAg = modal.querySelector('#link-antigravity-gh');
    const linkAgCli = modal.querySelector('#link-antigravity-cli');
    const linkAgSdk = modal.querySelector('#link-antigravity-sdk');

    if (linkAg) {
      linkAg.onclick = (e) => {
        e.preventDefault();
        window.api.openExternal('https://github.com/google-antigravity');
      };
    }
    if (linkAgCli) {
      linkAgCli.onclick = (e) => {
        e.preventDefault();
        window.api.openExternal('https://github.com/google-antigravity/antigravity-cli');
      };
    }
    if (linkAgSdk) {
      linkAgSdk.onclick = (e) => {
        e.preventDefault();
        window.api.openExternal('https://github.com/google-antigravity/antigravity-sdk-python');
      };
    }

    const closeModal = () => modal.style.display = 'none';
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    testBtn.onclick = async () => {
      const selectedProv = providerSelect.value;
      testBtn.textContent = 'Testing...';
      testBtn.disabled = true;
      statusBox.style.display = 'block';
      statusBox.style.background = 'rgba(255,255,255,0.05)';
      statusBox.style.color = 'var(--text-muted)';
      statusBox.textContent = `Connecting to ${selectedProv}...`;

      try {
        const res = await window.api.ai.testConnection(selectedProv);
        if (res.success) {
          statusBox.style.background = 'rgba(63,185,80,0.1)';
          statusBox.style.color = '#3fb950';
          statusBox.textContent = `✔ ${res.message || 'Connection successful!'}`;
        } else {
          statusBox.style.background = 'rgba(248,81,73,0.1)';
          statusBox.style.color = '#f85149';
          statusBox.textContent = `✖ ${res.error || 'Connection failed'}`;
        }
      } catch (e) {
        statusBox.style.background = 'rgba(248,81,73,0.1)';
        statusBox.style.color = '#f85149';
        statusBox.textContent = `✖ Error: ${e.message}`;
      } finally {
        testBtn.textContent = 'Test Connection';
        testBtn.disabled = false;
      }
    };

    saveBtn.onclick = async () => {
      const newProv = providerSelect.value;
      const keyAnthropic = modal.querySelector('#key-anthropic').value.trim();
      const keyOpenAi = modal.querySelector('#key-openai').value.trim();
      const keyGemini = modal.querySelector('#key-gemini').value.trim();
      const keyOpenRouter = modal.querySelector('#key-openrouter').value.trim();
      const epOllama = modal.querySelector('#ep-ollama').value.trim();
      const epLmStudio = modal.querySelector('#ep-lmstudio').value.trim();

      const updatePayload = {
        activeProvider: newProv,
        keys: {},
        endpoints: {
          ollama: epOllama,
          lmstudio: epLmStudio
        }
      };

      if (keyAnthropic) updatePayload.keys.anthropic = keyAnthropic;
      if (keyOpenAi) updatePayload.keys.openai = keyOpenAi;
      if (keyGemini) updatePayload.keys.gemini = keyGemini;
      if (keyOpenRouter) updatePayload.keys.openrouter = keyOpenRouter;

      await window.api.ai.saveConfig(updatePayload);
      await this.refreshConfig();
      closeModal();
      window.app.showToast('AI Provider settings saved!');
    };
  }
}

window.AiController = AiController;
window.aiController = new AiController();
