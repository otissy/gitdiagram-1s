const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { app } = require('electron');
const ZipService = require('./zipService');

/**
 * Clean JSONC (strip comments and trailing commas)
 */
function parseJsonc(content) {
  if (typeof content !== 'string') return {};
  // Strip block comments /* ... */ and line comments // ...
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^\\:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1') // remove trailing commas
    .trim();
  try {
    return JSON.parse(stripped);
  } catch (e) {
    try {
      // Fallback: simple eval in isolated VM or return empty
      return JSON.parse(content);
    } catch (err) {
      return {};
    }
  }
}

/**
 * Helper to fetch HTTPS content as Buffer or JSON
 */
function fetchHttps(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? http : https;

    const req = client.get(url, {
      headers: {
        'User-Agent': 'Vision-IDE/1.0.0 (Windows NT 10.0; Win64; x64)',
        'Accept': options.json ? 'application/json' : '*/*',
        ...options.headers
      },
      timeout: options.timeout || 30000
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, url).toString();
        }
        return fetchHttps(redirectUrl, options).then(resolve).catch(reject);
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Request failed'}`));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (options.json) {
          try {
            resolve(JSON.parse(buffer.toString('utf8')));
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
          }
        } else {
          resolve(buffer);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out for ${url}`));
    });
  });
}

class ExtensionService {
  constructor() {
    this.extensionsDir = null;
    this.manifestPath = null;
    this.settingsPath = null;
    this.activeTheme = 'github-dark-custom';
    this.installedExtensions = new Map();
  }

  /**
   * Initialize extensions directory and state
   */
  init(customDir = null) {
    if (customDir) {
      this.extensionsDir = customDir;
    } else {
      const userData = app ? app.getPath('userData') : path.join(process.env.APPDATA || process.env.HOME || '.', '.vision-ide');
      this.extensionsDir = path.join(userData, 'extensions');
    }

    if (!fs.existsSync(this.extensionsDir)) {
      fs.mkdirSync(this.extensionsDir, { recursive: true });
    }

    this.manifestPath = path.join(this.extensionsDir, 'extensions.json');
    this.settingsPath = path.join(this.extensionsDir, 'settings.json');

    this.loadState();
  }

  /**
   * Load installed extensions and settings from disk
   */
  loadState() {
    this.installedExtensions.clear();

    if (fs.existsSync(this.manifestPath)) {
      try {
        const raw = fs.readFileSync(this.manifestPath, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const ext of list) {
            this.installedExtensions.set(ext.id, ext);
          }
        }
      } catch (e) {
        console.warn('[ExtensionService] Failed to parse extensions.json:', e.message);
      }
    }

    if (fs.existsSync(this.settingsPath)) {
      try {
        const raw = fs.readFileSync(this.settingsPath, 'utf8');
        const settings = JSON.parse(raw);
        if (settings.activeTheme) {
          this.activeTheme = settings.activeTheme;
        }
      } catch (e) {}
    }
  }

  /**
   * Save installed extensions manifest and settings
   */
  saveState() {
    try {
      const list = Array.from(this.installedExtensions.values());
      fs.writeFileSync(this.manifestPath, JSON.stringify(list, null, 2), 'utf8');
      fs.writeFileSync(this.settingsPath, JSON.stringify({ activeTheme: this.activeTheme }, null, 2), 'utf8');
    } catch (e) {
      console.error('[ExtensionService] Failed to save state:', e.message);
    }
  }

  /**
   * Search Open VSX Registry
   */
  async searchMarketplace(query = '', page = 1, size = 20) {
    const q = query.trim();
    const offset = (page - 1) * size;
    const url = `https://open-vsx.org/api/-/search?query=${encodeURIComponent(q)}&offset=${offset}&size=${size}&sortBy=downloadCount&sortOrder=desc`;

    try {
      const res = await fetchHttps(url, { json: true, timeout: 15000 });
      const extensions = (res.extensions || []).map(ext => {
        const id = `${ext.namespace}.${ext.name}`.toLowerCase();
        return {
          id,
          name: ext.name,
          publisher: ext.namespace,
          displayName: ext.displayName || ext.name,
          description: ext.description || '',
          version: ext.version || '1.0.0',
          downloads: ext.downloadCount || 0,
          rating: ext.averageRating || 0,
          iconUrl: ext.files && ext.files.icon ? ext.files.icon : null,
          downloadUrl: ext.files && ext.files.download ? ext.files.download : null,
          isInstalled: this.installedExtensions.has(id),
          categories: ext.categories || []
        };
      });

      return {
        totalSize: res.totalSize || extensions.length,
        extensions
      };
    } catch (err) {
      return {
        totalSize: 0,
        extensions: [],
        error: `Failed to search Open VSX: ${err.message}`
      };
    }
  }

  /**
   * Install extension from Open VSX Marketplace
   */
  async installFromMarketplace(id) {
    const parts = id.split('.');
    if (parts.length < 2) throw new Error('Invalid extension ID: expected publisher.name');

    const publisher = parts[0];
    const name = parts.slice(1).join('.');
    const detailUrl = `https://open-vsx.org/api/${publisher}/${name}`;

    const details = await fetchHttps(detailUrl, { json: true, timeout: 15000 });
    const downloadUrl = (details.files && details.files.download)
      || `https://open-vsx.org/api/${publisher}/${name}/${details.version}/file/${publisher}.${name}-${details.version}.vsix`;

    const vsixBuffer = await fetchHttps(downloadUrl, { timeout: 60000 });
    return this.installFromBuffer(vsixBuffer, id);
  }

  /**
   * Install extension from a local .vsix file
   */
  async installFromVsix(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const buffer = fs.readFileSync(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    return this.installFromBuffer(buffer, baseName);
  }

  /**
   * Internal unpack and registration of VSIX buffer
   */
  installFromBuffer(buffer, defaultId) {
    const tempDir = path.join(this.extensionsDir, `.temp_${Date.now()}`);
    try {
      ZipService.extractZip(buffer, tempDir);

      // VS Code VSIX extensions put their payload in "extension/"
      let payloadDir = path.join(tempDir, 'extension');
      if (!fs.existsSync(payloadDir)) {
        payloadDir = tempDir;
      }

      const pkgPath = path.join(payloadDir, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        throw new Error('Invalid extension package: missing extension/package.json');
      }

      const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(pkgRaw);

      const extId = `${pkg.publisher || 'local'}.${pkg.name}`.toLowerCase();
      const targetDir = path.join(this.extensionsDir, extId);

      // If already installed, remove old version
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }

      // Rename extracted payload to target directory
      fs.renameSync(payloadDir, targetDir);

      // Process and parse contributions (themes, snippets, languages)
      const parsedContributes = this.parseContributions(targetDir, pkg.contributes || {});

      const extRecord = {
        id: extId,
        name: pkg.name,
        displayName: pkg.displayName || pkg.name,
        publisher: pkg.publisher || 'local',
        version: pkg.version || '1.0.0',
        description: pkg.description || '',
        installedAt: Date.now(),
        enabled: true,
        dir: targetDir,
        contributes: parsedContributes
      };

      this.installedExtensions.set(extId, extRecord);
      this.saveState();

      return {
        success: true,
        extension: extRecord
      };
    } finally {
      if (fs.existsSync(tempDir)) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
      }
    }
  }

  /**
   * Parse contributes from package.json
   */
  parseContributions(extDir, contributes = {}) {
    const parsed = {
      themes: [],
      snippets: [],
      languages: []
    };

    // 1. Themes (contributes.themes)
    if (Array.isArray(contributes.themes)) {
      for (const t of contributes.themes) {
        const themeRel = t.path ? t.path.replace(/^\.\//, '') : '';
        const themeFile = path.join(extDir, themeRel);
        if (fs.existsSync(themeFile)) {
          try {
            const raw = fs.readFileSync(themeFile, 'utf8');
            const data = parseJsonc(raw);
            parsed.themes.push({
              id: t.id || t.label || path.basename(themeRel, path.extname(themeRel)),
              label: t.label || t.id,
              uiTheme: t.uiTheme || 'vs-dark', // 'vs', 'vs-dark', 'hc-black'
              path: themeRel,
              fullData: data
            });
          } catch (e) {
            console.warn(`[ExtensionService] Could not parse theme ${themeFile}:`, e.message);
          }
        }
      }
    }

    // 2. Snippets (contributes.snippets)
    if (Array.isArray(contributes.snippets)) {
      for (const s of contributes.snippets) {
        const snipRel = s.path ? s.path.replace(/^\.\//, '') : '';
        const snipFile = path.join(extDir, snipRel);
        if (fs.existsSync(snipFile)) {
          try {
            const raw = fs.readFileSync(snipFile, 'utf8');
            const data = parseJsonc(raw);
            parsed.snippets.push({
              language: s.language,
              path: snipRel,
              snippets: data
            });
          } catch (e) {}
        }
      }
    }

    // 3. Languages
    if (Array.isArray(contributes.languages)) {
      for (const l of contributes.languages) {
        parsed.languages.push({
          id: l.id,
          aliases: l.aliases || [],
          extensions: l.extensions || [],
          configuration: l.configuration || null
        });
      }
    }

    return parsed;
  }

  /**
   * Get list of all installed extensions
   */
  getInstalledExtensions() {
    return Array.from(this.installedExtensions.values()).map(e => ({
      id: e.id,
      name: e.name,
      displayName: e.displayName,
      publisher: e.publisher,
      version: e.version,
      description: e.description,
      enabled: e.enabled !== false,
      themesCount: (e.contributes && e.contributes.themes) ? e.contributes.themes.length : 0,
      snippetsCount: (e.contributes && e.contributes.snippets) ? e.contributes.snippets.length : 0
    }));
  }

  /**
   * Uninstall extension
   */
  uninstallExtension(id) {
    const ext = this.installedExtensions.get(id);
    if (!ext) return { success: false, error: 'Extension not found' };

    try {
      if (ext.dir && fs.existsSync(ext.dir)) {
        fs.rmSync(ext.dir, { recursive: true, force: true });
      }
      this.installedExtensions.delete(id);
      this.saveState();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Enable or disable extension
   */
  toggleExtension(id, enabled) {
    const ext = this.installedExtensions.get(id);
    if (!ext) return { success: false, error: 'Extension not found' };

    ext.enabled = !!enabled;
    this.saveState();
    return { success: true, enabled: ext.enabled };
  }

  /**
   * Collect all available themes across enabled extensions
   */
  getAvailableThemes() {
    const themes = [
      {
        id: 'github-dark-custom',
        label: 'GitHub Dark (Vision Default)',
        uiTheme: 'vs-dark',
        extensionId: 'builtin',
        isBuiltin: true
      },
      {
        id: 'vs-dark',
        label: 'Dark+ (default dark)',
        uiTheme: 'vs-dark',
        extensionId: 'builtin',
        isBuiltin: true
      },
      {
        id: 'vs',
        label: 'Light+ (default light)',
        uiTheme: 'vs',
        extensionId: 'builtin',
        isBuiltin: true
      }
    ];

    for (const ext of this.installedExtensions.values()) {
      if (ext.enabled === false) continue;
      if (ext.contributes && Array.isArray(ext.contributes.themes)) {
        for (const t of ext.contributes.themes) {
          themes.push({
            id: `${ext.id}:${t.id}`,
            label: `${t.label} (${ext.displayName})`,
            rawId: t.id,
            uiTheme: t.uiTheme,
            extensionId: ext.id,
            isBuiltin: false
          });
        }
      }
    }

    return themes;
  }

  /**
   * Convert VS Code Theme JSON to Monaco Editor Theme format + Vision IDE UI variables
   */
  getMonacoThemeDefinition(themeKey) {
    if (themeKey === 'github-dark-custom' || themeKey === 'vs-dark' || themeKey === 'vs') {
      return {
        id: themeKey,
        isCustom: false,
        themeData: null
      };
    }

    const [extId, themeId] = themeKey.split(':');
    const ext = this.installedExtensions.get(extId);
    if (!ext || !ext.contributes || !Array.isArray(ext.contributes.themes)) {
      return null;
    }

    const themeEntry = ext.contributes.themes.find(t => t.id === themeId || t.label === themeId);
    if (!themeEntry || !themeEntry.fullData) return null;

    const raw = themeEntry.fullData;
    const isDark = themeEntry.uiTheme !== 'vs' && raw.type !== 'light';

    // Map tokenColors to Monaco rules
    const rules = [];
    const tokenColors = raw.tokenColors || [];

    if (Array.isArray(tokenColors)) {
      for (const tc of tokenColors) {
        if (!tc.settings) continue;
        const scopes = Array.isArray(tc.scope) ? tc.scope : [tc.scope];
        for (const scope of scopes) {
          if (!scope || typeof scope !== 'string') continue;
          rules.push({
            token: scope,
            foreground: tc.settings.foreground ? tc.settings.foreground.replace('#', '') : undefined,
            background: tc.settings.background ? tc.settings.background.replace('#', '') : undefined,
            fontStyle: tc.settings.fontStyle
          });
        }
      }
    }

    const colors = raw.colors || {};

    // Generate matching Vision IDE UI color palette
    const uiColors = {
      bgPrimary: colors['editor.background'] || (isDark ? '#0d1117' : '#ffffff'),
      bgSecondary: colors['sideBar.background'] || colors['editorGroupHeader.tabsBackground'] || (isDark ? '#161b22' : '#f6f8fa'),
      bgTertiary: colors['activityBar.background'] || (isDark ? '#090d13' : '#eaedf0'),
      textPrimary: colors['editor.foreground'] || (isDark ? '#c9d1d9' : '#24292f'),
      textMuted: colors['descriptionForeground'] || colors['sideBarTitle.foreground'] || (isDark ? '#8b949e' : '#57606a'),
      borderColor: colors['sideBar.border'] || colors['editorGroup.border'] || (isDark ? '#30363d' : '#d0d7de'),
      accentColor: colors['activityBarBadge.background'] || colors['focusBorder'] || '#58a6ff'
    };

    return {
      id: themeKey,
      isCustom: true,
      base: isDark ? 'vs-dark' : 'vs',
      inherit: true,
      rules,
      colors,
      uiColors
    };
  }

  /**
   * Set active theme
   */
  setActiveTheme(themeKey) {
    this.activeTheme = themeKey;
    this.saveState();
    return this.getMonacoThemeDefinition(themeKey);
  }

  /**
   * Get all snippets registered across enabled extensions
   */
  getSnippets() {
    const snippets = [];
    for (const ext of this.installedExtensions.values()) {
      if (ext.enabled === false) continue;
      if (ext.contributes && Array.isArray(ext.contributes.snippets)) {
        for (const s of ext.contributes.snippets) {
          snippets.push({
            language: s.language,
            snippets: s.snippets,
            extensionId: ext.id
          });
        }
      }
    }
    return snippets;
  }
}

module.exports = ExtensionService;
