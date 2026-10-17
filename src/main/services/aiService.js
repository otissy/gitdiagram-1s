const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn, execFile } = require('child_process');
const { app } = require('electron');

class AiService {
  constructor() {
    this.configPath = null;
    this.config = {
      activeProvider: 'antigravity', // 'antigravity' | 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'lmstudio' | 'openrouter'
      keys: {
        anthropic: '',
        openai: '',
        gemini: '',
        openrouter: ''
      },
      models: {
        antigravity: 'auto',
        anthropic: 'claude-3-5-sonnet-20241022',
        openai: 'gpt-4o',
        gemini: 'gemini-1.5-pro',
        ollama: 'llama3',
        lmstudio: 'local-model',
        openrouter: 'anthropic/claude-3.5-sonnet'
      },
      endpoints: {
        ollama: 'http://localhost:11434',
        lmstudio: 'http://localhost:1234/v1',
        openrouter: 'https://openrouter.ai/api/v1',
        custom: ''
      },
      antigravityCliPath: ''
    };
    this.currentAbortController = null;
    this.currentProcess = null;
  }

  /**
   * Initialize AI configuration path and load saved keys
   */
  init(customConfigPath = null) {
    if (customConfigPath) {
      this.configPath = customConfigPath;
    } else {
      const userData = app ? app.getPath('userData') : path.join(process.env.APPDATA || process.env.HOME || '.', '.vision-ide');
      this.configPath = path.join(userData, 'ai-settings.json');
    }

    this.detectAntigravityCli();
    this.loadConfig();
  }

  /**
   * Automatically locate agy.exe on the user system
   */
  detectAntigravityCli() {
    const candidates = [
      path.join(process.env.LOCALAPPDATA || '', 'agy', 'bin', 'agy.exe'),
      path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'agy', 'bin', 'agy.exe'),
      'agy.exe',
      'agy'
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        this.config.antigravityCliPath = c;
        break;
      }
    }
  }

  loadConfig() {
    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.config = {
          ...this.config,
          ...parsed,
          keys: { ...this.config.keys, ...(parsed.keys || {}) },
          models: { ...this.config.models, ...(parsed.models || {}) },
          endpoints: { ...this.config.endpoints, ...(parsed.endpoints || {}) }
        };
      } catch (e) {
        console.warn('[AiService] Failed to load ai-settings.json:', e.message);
      }
    }
  }

  saveConfig(newConfig = {}) {
    this.config = {
      ...this.config,
      ...newConfig,
      keys: { ...this.config.keys, ...(newConfig.keys || {}) },
      models: { ...this.config.models, ...(newConfig.models || {}) },
      endpoints: { ...this.config.endpoints, ...(newConfig.endpoints || {}) }
    };

    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  getConfigSafe() {
    // Return config with masked API keys for UI
    const mask = (key) => key ? (key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '••••••••') : '';
    return {
      activeProvider: this.config.activeProvider,
      models: this.config.models,
      endpoints: this.config.endpoints,
      antigravityCliPath: this.config.antigravityCliPath,
      antigravityAvailable: !!(this.config.antigravityCliPath && fs.existsSync(this.config.antigravityCliPath)),
      keysMasked: {
        anthropic: mask(this.config.keys.anthropic),
        openai: mask(this.config.keys.openai),
        gemini: mask(this.config.keys.gemini),
        openrouter: mask(this.config.keys.openrouter)
      },
      hasKey: {
        anthropic: !!this.config.keys.anthropic,
        openai: !!this.config.keys.openai,
        gemini: !!this.config.keys.gemini,
        openrouter: !!this.config.keys.openrouter
      }
    };
  }

  /**
   * Test connection to a chosen provider
   */
  async testConnection(provider) {
    const prov = provider || this.config.activeProvider;
    try {
      if (prov === 'antigravity') {
        if (!this.config.antigravityCliPath || !fs.existsSync(this.config.antigravityCliPath)) {
          return { success: false, error: 'Antigravity CLI (agy.exe) not found on system.' };
        }
        return { success: true, message: `Connected to Antigravity CLI at ${this.config.antigravityCliPath}` };
      }

      if (prov === 'ollama') {
        const ep = this.config.endpoints.ollama || 'http://localhost:11434';
        const res = await this.httpJson(`${ep}/api/tags`, { method: 'GET' });
        const models = (res.models || []).map(m => m.name);
        return { success: true, message: `Ollama is running (${models.length} models installed)` };
      }

      if (prov === 'lmstudio') {
        const ep = this.config.endpoints.lmstudio || 'http://localhost:1234/v1';
        const res = await this.httpJson(`${ep}/models`, { method: 'GET' });
        return { success: true, message: 'LM Studio is running and responding' };
      }

      const key = this.config.keys[prov];
      if (!key) {
        return { success: false, error: `Missing API key for ${prov}` };
      }

      if (prov === 'anthropic') {
        const res = await this.httpJson('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: {
            model: 'claude-3-haiku-20240307',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Ping' }]
          }
        });
        return { success: true, message: 'Anthropic Claude subscription verified!' };
      }

      if (prov === 'openai') {
        const res = await this.httpJson('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'content-type': 'application/json'
          },
          body: {
            model: 'gpt-4o-mini',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Ping' }]
          }
        });
        return { success: true, message: 'OpenAI subscription verified!' };
      }

      if (prov === 'gemini') {
        const res = await this.httpJson(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: {
            contents: [{ parts: [{ text: 'Ping' }] }]
          }
        });
        return { success: true, message: 'Google Gemini subscription verified!' };
      }

      if (prov === 'openrouter') {
        const res = await this.httpJson('https://openrouter.ai/api/v1/models', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${key}` }
        });
        return { success: true, message: 'OpenRouter connection verified!' };
      }

      return { success: false, error: `Unknown provider: ${prov}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Send chat prompt with context and stream tokens back via callback
   */
  async streamChat(prompt, context = {}, onChunk, onDone, onError) {
    const provider = this.config.activeProvider;

    // Build system message with IDE context
    let systemPrompt = `You are Vision IDE Agent, an expert AI software engineer and architecture specialist inside Vision IDE.
You help developers read code, understand codebase architecture diagrams, debug, generate tests, and refactor code.
Be concise, clear, and provide practical code diffs or solutions when asked.`;

    if (context.repoName) {
      systemPrompt += `\n\nActive Repository: ${context.repoName}`;
    }
    if (context.activeFilePath) {
      systemPrompt += `\nActive File: ${context.activeFilePath} (${context.language || 'code'})`;
      if (context.fileContent) {
        systemPrompt += `\n\nFile Content:\n\`\`\`${context.language || ''}\n${context.fileContent.slice(0, 15000)}\n\`\`\``;
      }
    }
    if (context.selectedText) {
      systemPrompt += `\n\nUser Highlighted Code Selection:\n\`\`\`${context.language || ''}\n${context.selectedText}\n\`\`\``;
    }

    try {
      if (provider === 'antigravity') {
        return this.streamAntigravity(prompt, systemPrompt, onChunk, onDone, onError);
      } else if (provider === 'anthropic') {
        return this.streamAnthropic(prompt, systemPrompt, onChunk, onDone, onError);
      } else if (provider === 'openai') {
        return this.streamOpenAi(prompt, systemPrompt, onChunk, onDone, onError);
      } else if (provider === 'gemini') {
        return this.streamGemini(prompt, systemPrompt, onChunk, onDone, onError);
      } else if (provider === 'ollama' || provider === 'lmstudio' || provider === 'openrouter') {
        return this.streamOpenAiCompatible(provider, prompt, systemPrompt, onChunk, onDone, onError);
      } else {
        throw new Error(`Unsupported AI provider: ${provider}`);
      }
    } catch (err) {
      onError(err.message);
    }
  }

  /**
   * Stream via Antigravity CLI (agy)
   */
  streamAntigravity(prompt, systemPrompt, onChunk, onDone, onError) {
    const cliPath = this.config.antigravityCliPath || 'agy.exe';
    const fullPrompt = `${systemPrompt}\n\nUser request: ${prompt}`;

    try {
      const child = spawn(cliPath, ['-p', fullPrompt, '--output-format', 'text'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      });

      this.currentProcess = child;

      child.stdout.on('data', (data) => {
        const text = data.toString('utf8');
        onChunk(text);
      });

      child.stderr.on('data', (data) => {
        // Log stderr from CLI
      });

      child.on('close', (code) => {
        this.currentProcess = null;
        if (code === 0) {
          onDone();
        } else {
          onChunk('\n*(Antigravity CLI completed turn)*');
          onDone();
        }
      });

      child.on('error', (err) => {
        this.currentProcess = null;
        onError(`Antigravity process error: ${err.message}. Ensure agy is configured.`);
      });
    } catch (e) {
      onError(e.message);
    }
  }

  /**
   * Stream via Anthropic Claude Messages API
   */
  streamAnthropic(prompt, systemPrompt, onChunk, onDone, onError) {
    const key = this.config.keys.anthropic;
    if (!key) return onError('Missing Anthropic API Key. Please add it in AI Settings.');

    const model = this.config.models.anthropic || 'claude-3-5-sonnet-20241022';
    const body = JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      }
    }, (res) => {
      if (res.statusCode >= 400) {
        let errData = '';
        res.on('data', d => errData += d);
        res.on('end', () => onError(`Anthropic Error ${res.statusCode}: ${errData}`));
        return;
      }

      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep partial line

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const rawJson = line.slice(6).trim();
            if (rawJson === '[DONE]') continue;
            try {
              const event = JSON.parse(rawJson);
              if (event.type === 'content_block_delta' && event.delta && event.delta.text) {
                onChunk(event.delta.text);
              }
            } catch (e) {}
          }
        }
      });

      res.on('end', () => onDone());
    });

    req.on('error', err => onError(err.message));
    req.write(body);
    req.end();
  }

  /**
   * Stream via OpenAI Chat Completions API
   */
  streamOpenAi(prompt, systemPrompt, onChunk, onDone, onError) {
    const key = this.config.keys.openai;
    if (!key) return onError('Missing OpenAI API Key. Please add it in AI Settings.');

    const model = this.config.models.openai || 'gpt-4o';
    const body = JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    });

    const req = https.request('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      }
    }, (res) => {
      if (res.statusCode >= 400) {
        let errData = '';
        res.on('data', d => errData += d);
        res.on('end', () => onError(`OpenAI Error ${res.statusCode}: ${errData}`));
        return;
      }

      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const rawJson = line.slice(6).trim();
            if (rawJson === '[DONE]') continue;
            try {
              const parsed = JSON.parse(rawJson);
              const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
              if (delta && delta.content) {
                onChunk(delta.content);
              }
            } catch (e) {}
          }
        }
      });

      res.on('end', () => onDone());
    });

    req.on('error', err => onError(err.message));
    req.write(body);
    req.end();
  }

  /**
   * Stream via Google Gemini API
   */
  streamGemini(prompt, systemPrompt, onChunk, onDone, onError) {
    const key = this.config.keys.gemini;
    if (!key) return onError('Missing Google Gemini API Key. Please add it in AI Settings.');

    const model = this.config.models.gemini || 'gemini-1.5-pro';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${key}&alt=sse`;

    const body = JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }
      ]
    });

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      }
    }, (res) => {
      if (res.statusCode >= 400) {
        let errData = '';
        res.on('data', d => errData += d);
        res.on('end', () => onError(`Gemini Error ${res.statusCode}: ${errData}`));
        return;
      }

      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const rawJson = line.slice(6).trim();
            try {
              const parsed = JSON.parse(rawJson);
              const text = parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts[0] && parsed.candidates[0].content.parts[0].text;
              if (text) onChunk(text);
            } catch (e) {}
          }
        }
      });

      res.on('end', () => onDone());
    });

    req.on('error', err => onError(err.message));
    req.write(body);
    req.end();
  }

  /**
   * Stream via OpenAI-compatible endpoints (Ollama, LM Studio, OpenRouter, DeepSeek)
   */
  streamOpenAiCompatible(provider, prompt, systemPrompt, onChunk, onDone, onError) {
    let baseUrl = '';
    let apiKey = '';
    let model = '';

    if (provider === 'ollama') {
      baseUrl = (this.config.endpoints.ollama || 'http://localhost:11434').replace(/\/$/, '') + '/v1';
      model = this.config.models.ollama || 'llama3';
    } else if (provider === 'lmstudio') {
      baseUrl = (this.config.endpoints.lmstudio || 'http://localhost:1234/v1').replace(/\/$/, '');
      model = this.config.models.lmstudio || 'local-model';
    } else if (provider === 'openrouter') {
      baseUrl = 'https://openrouter.ai/api/v1';
      apiKey = this.config.keys.openrouter;
      model = this.config.models.openrouter || 'anthropic/claude-3.5-sonnet';
      if (!apiKey) return onError('Missing OpenRouter API Key. Please add it in AI Settings.');
    }

    const targetUrl = new URL(`${baseUrl}/chat/completions`);
    const client = targetUrl.protocol === 'https:' ? https : http;

    const body = JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ]
    });

    const headers = {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body)
    };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const req = client.request(targetUrl, {
      method: 'POST',
      headers
    }, (res) => {
      if (res.statusCode >= 400) {
        let errData = '';
        res.on('data', d => errData += d);
        res.on('end', () => onError(`${provider.toUpperCase()} Error ${res.statusCode}: ${errData}`));
        return;
      }

      let buffer = '';
      res.on('data', chunk => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const rawJson = line.slice(6).trim();
            if (rawJson === '[DONE]') continue;
            try {
              const parsed = JSON.parse(rawJson);
              const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
              if (delta && delta.content) onChunk(delta.content);
            } catch (e) {}
          }
        }
      });

      res.on('end', () => onDone());
    });

    req.on('error', err => onError(`${provider} connection error: ${err.message}`));
    req.write(body);
    req.end();
  }

  abortCurrent() {
    if (this.currentProcess) {
      try { this.currentProcess.kill(); } catch (e) {}
      this.currentProcess = null;
    }
  }

  /**
   * Generic JSON HTTP request helper
   */
  httpJson(url, options = {}) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;

      const bodyData = options.body ? JSON.stringify(options.body) : null;
      const headers = {
        'User-Agent': 'Vision-IDE/1.0.0',
        ...(options.headers || {})
      };
      if (bodyData) {
        headers['content-length'] = Buffer.byteLength(bodyData);
      }

      const req = client.request(url, {
        method: options.method || 'GET',
        headers,
        timeout: options.timeout || 15000
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve({ raw: data });
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      if (bodyData) req.write(bodyData);
      req.end();
    });
  }
}

module.exports = AiService;
