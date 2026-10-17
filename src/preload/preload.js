const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Folder & File Management
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  scanRepository: (folderPath) => ipcRenderer.invoke('repo:scan', folderPath),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', filePath, content),
  getRecentFolders: () => ipcRenderer.invoke('storage:getRecent'),
  addRecentFolder: (folderPath) => ipcRenderer.invoke('storage:addRecent', folderPath),

  // Git Services
  isGitRepo: (folderPath) => ipcRenderer.invoke('git:isRepo', folderPath),
  getGitStatus: (folderPath) => ipcRenderer.invoke('git:getStatus', folderPath),
  getGitBranches: (folderPath) => ipcRenderer.invoke('git:getBranches', folderPath),
  switchBranch: (folderPath, branch) => ipcRenderer.invoke('git:switchBranch', folderPath, branch),
  getGitLog: (folderPath, maxCount) => ipcRenderer.invoke('git:getLog', folderPath, maxCount),
  getGitDiff: (folderPath, filePath, commitA, commitB) => ipcRenderer.invoke('git:getDiff', folderPath, filePath, commitA, commitB),

  // Diagram & Visualizations
  generateDiagram: (folderPath, files, options) => ipcRenderer.invoke('diagram:generate', folderPath, files, options),
  generateSymbolDiagram: (folderPath, targetFile, files) => ipcRenderer.invoke('diagram:generateSymbols', folderPath, targetFile, files),
  getFileSymbols: (filePath) => ipcRenderer.invoke('file:getSymbols', filePath),
  toMermaid: (diagramData) => ipcRenderer.invoke('diagram:toMermaid', diagramData),
  saveExportFile: (defaultName, content, type) => ipcRenderer.invoke('dialog:saveExport', defaultName, content, type),

  // GitHub Remote Repositories (Public & Private)
  github: {
    setToken: (token) => ipcRenderer.invoke('github:setToken', token),
    getUser: () => ipcRenderer.invoke('github:getUser'),
    logout: () => ipcRenderer.invoke('github:logout'),
    getUserRepos: () => ipcRenderer.invoke('github:getUserRepos'),
    fetchRemoteRepo: (repoInput) => ipcRenderer.invoke('github:fetchRemoteRepo', repoInput),
    getRepoDetails: (folderPath, owner, repo) => ipcRenderer.invoke('github:getRepoDetails', folderPath, owner, repo),
    onProgress: (callback) => {
      const handler = (event, msg) => callback(msg);
      ipcRenderer.on('github:progress', handler);
      return () => ipcRenderer.removeListener('github:progress', handler);
    }
  },

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Terminal Services (Opt-in IDE Mode)
  terminal: {
    spawn: (sessionId, cwd) => ipcRenderer.invoke('terminal:spawn', sessionId, cwd),
    write: (sessionId, data) => ipcRenderer.invoke('terminal:write', sessionId, data),
    kill: (sessionId) => ipcRenderer.invoke('terminal:kill', sessionId),
    killAll: () => ipcRenderer.invoke('terminal:killAll'),
    onData: (callback) => {
      const handler = (event, payload) => callback(payload);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.removeListener('terminal:data', handler);
    },
    onExit: (callback) => {
      const handler = (event, payload) => callback(payload);
      ipcRenderer.on('terminal:exit', handler);
      return () => ipcRenderer.removeListener('terminal:exit', handler);
    }
  },

  // VS Code Extensions Marketplace & Manager
  extensions: {
    search: (query, page) => ipcRenderer.invoke('extensions:search', query, page),
    installMarketplace: (id) => ipcRenderer.invoke('extensions:installMarketplace', id),
    installVsix: () => ipcRenderer.invoke('extensions:installVsix'),
    getInstalled: () => ipcRenderer.invoke('extensions:getInstalled'),
    uninstall: (id) => ipcRenderer.invoke('extensions:uninstall', id),
    toggle: (id, enabled) => ipcRenderer.invoke('extensions:toggle', id, enabled),
    getThemes: () => ipcRenderer.invoke('extensions:getThemes'),
    setTheme: (themeId) => ipcRenderer.invoke('extensions:setTheme', themeId),
    getSnippets: () => ipcRenderer.invoke('extensions:getSnippets')
  },

  // AI Agent & Existing AI Subscriptions (Antigravity, Anthropic, OpenAI, Gemini, Ollama)
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    saveConfig: (config) => ipcRenderer.invoke('ai:saveConfig', config),
    testConnection: (provider) => ipcRenderer.invoke('ai:testConnection', provider),
    chat: (prompt, context) => ipcRenderer.invoke('ai:chat', prompt, context),
    abort: () => ipcRenderer.invoke('ai:abort'),
    onChunk: (callback) => {
      const handler = (event, chunk) => callback(chunk);
      ipcRenderer.on('ai:chunk', handler);
      return () => ipcRenderer.removeListener('ai:chunk', handler);
    },
    onDone: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('ai:done', handler);
      return () => ipcRenderer.removeListener('ai:done', handler);
    },
    onError: (callback) => {
      const handler = (event, err) => callback(err);
      ipcRenderer.on('ai:error', handler);
      return () => ipcRenderer.removeListener('ai:error', handler);
    }
  },

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Environment
  platform: process.platform,
  monacoBasePath: '../node_modules/monaco-editor/min/vs',

  // Folder watching event listener
  onRepoChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('repo:changed', handler);
    return () => ipcRenderer.removeListener('repo:changed', handler);
  }
});
