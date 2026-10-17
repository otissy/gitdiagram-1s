const { app, BrowserWindow, ipcMain, dialog, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

const fileService = require('./services/fileService');
const gitService = require('./services/gitService');
const diagramService = require('./services/diagramService');
const symbolService = require('./services/symbolService');
const { GitHubRemoteService } = require('./services/githubRemoteService');

let githubRemoteService = null;
let mainWindow = null;
let currentWatcher = null;
const recentsFilePath = path.join(app.getPath('userData'), 'recent-repos.json');

const { sanitizePathArg, isValidBranchName } = require('./services/securityService');

// Helper to load recent repositories
function loadRecentRepos() {
  try {
    if (fs.existsSync(recentsFilePath)) {
      const data = fs.readFileSync(recentsFilePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    // ignore
  }
  return [];
}

// Helper to save recent repositories
function saveRecentRepo(folderPath) {
  try {
    const safePath = sanitizePathArg(folderPath);
    let recents = loadRecentRepos();
    recents = recents.filter(p => p !== safePath);
    recents.unshift(safePath);
    if (recents.length > 15) recents = recents.slice(0, 15);
    fs.writeFileSync(recentsFilePath, JSON.stringify(recents, null, 2), 'utf8');
    return recents;
  } catch (e) {
    return [];
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 650,
    frame: false, // Custom modern Windows title bar
    title: 'GitDiagram 1s',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      navigateOnDragDrop: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Security Hardening: Prevent navigation away from our local index.html
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (parsed.protocol !== 'file:' || !parsed.pathname.replace(/\\/g, '/').endsWith('index.html')) {
        event.preventDefault();
      }
    } catch (e) {
      event.preventDefault();
    }
  });

  // Security Hardening: Block untrusted webviews from being attached
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  // Security Hardening: Block new window popups / untrusted webviews, strictly allow verified GitHub HTTPS links in OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && (parsed.hostname === 'github.com' || parsed.hostname.endsWith('.github.com'))) {
        require('electron').shell.openExternal(url);
      }
    } catch (e) {}
    return { action: 'deny' };
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:state-changed', { isMaximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:state-changed', { isMaximized: false });
  });

  mainWindow.on('closed', () => {
    if (currentWatcher) {
      try { currentWatcher.close(); } catch (e) {}
    }
    mainWindow = null;
  });
}

// Watch folder for changes
function setupFolderWatcher(folderPath) {
  if (currentWatcher) {
    try { currentWatcher.close(); } catch (e) {}
    currentWatcher = null;
  }

  try {
    let debounceTimer = null;
    currentWatcher = fs.watch(folderPath, { recursive: true }, (eventType, filename) => {
      if (!filename || filename.includes('.git') || filename.includes('node_modules')) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('repo:changed', { eventType, filename });
        }
      }, 500);
    });
  } catch (e) {
    // Some folders or network drives may not support recursive fs.watch
  }
}

// Register IPC handlers
function registerIpcHandlers() {
  // Dialog: Open Folder
  ipcMain.handle('dialog:openFolder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Repository or Local Folder',
      properties: ['openDirectory']
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    const folderPath = result.filePaths[0];
    saveRecentRepo(folderPath);
    setupFolderWatcher(folderPath);
    return folderPath;
  });

  // Storage: Recents
  ipcMain.handle('storage:getRecent', () => {
    return loadRecentRepos();
  });

  ipcMain.handle('storage:addRecent', (event, folderPath) => {
    return saveRecentRepo(folderPath);
  });

  // Repository: Scan
  ipcMain.handle('repo:scan', async (event, folderPath) => {
    const safePath = sanitizePathArg(folderPath);
    setupFolderWatcher(safePath);
    return await fileService.scanDirectory(safePath);
  });

  // File: Read
  ipcMain.handle('file:read', async (event, filePath) => {
    const safePath = sanitizePathArg(filePath);
    return await fileService.readFile(safePath);
  });

  // File: Save
  ipcMain.handle('file:save', async (event, filePath, content) => {
    const safePath = sanitizePathArg(filePath);
    return await fileService.saveFile(safePath, content);
  });

  // Git Services
  ipcMain.handle('git:isRepo', async (event, folderPath) => {
    const safePath = sanitizePathArg(folderPath);
    return await gitService.isGitRepo(safePath);
  });

  ipcMain.handle('git:getStatus', async (event, folderPath) => {
    const safePath = sanitizePathArg(folderPath);
    return await gitService.getGitStatus(safePath);
  });

  ipcMain.handle('git:getBranches', async (event, folderPath) => {
    const safePath = sanitizePathArg(folderPath);
    return await gitService.getGitBranches(safePath);
  });

  ipcMain.handle('git:switchBranch', async (event, folderPath, branch) => {
    const safePath = sanitizePathArg(folderPath);
    if (!isValidBranchName(branch)) {
      return { success: false, error: 'Security: Invalid branch name' };
    }
    return await gitService.switchBranch(safePath, branch.trim());
  });

  ipcMain.handle('git:getLog', async (event, folderPath, maxCount) => {
    const safePath = sanitizePathArg(folderPath);
    const limit = Math.max(1, Math.min(parseInt(maxCount, 10) || 50, 500));
    return await gitService.getGitLog(safePath, limit);
  });

  ipcMain.handle('git:getDiff', async (event, folderPath, filePath, commitA, commitB) => {
    const safePath = sanitizePathArg(folderPath);
    const safeFile = filePath ? sanitizePathArg(filePath) : null;
    return await gitService.getGitDiff(safePath, safeFile, commitA, commitB);
  });

  // Diagram Services
  ipcMain.handle('diagram:generate', async (event, folderPath, files, options) => {
    const safePath = sanitizePathArg(folderPath);
    return await diagramService.generateDiagram(safePath, files, options);
  });

  ipcMain.handle('diagram:toMermaid', (event, diagramData) => {
    return diagramService.toMermaid(diagramData);
  });

  ipcMain.handle('diagram:generateSymbols', async (event, folderPath, targetFile, files) => {
    const safePath = sanitizePathArg(folderPath);
    const safeTarget = targetFile ? sanitizePathArg(targetFile) : null;
    return await diagramService.generateSymbolGraph(safePath, safeTarget, files);
  });

  ipcMain.handle('file:getSymbols', async (event, filePath) => {
    const safePath = sanitizePathArg(filePath);
    return await symbolService.extractFileSymbols(safePath);
  });

  // Export File
  ipcMain.handle('dialog:saveExport', async (event, defaultName, content, type) => {
    if (!mainWindow) return { success: false };

    const filters = [];
    if (type === 'svg') filters.push({ name: 'SVG Image', extensions: ['svg'] });
    else if (type === 'png') filters.push({ name: 'PNG Image', extensions: ['png'] });
    else if (type === 'mermaid') filters.push({ name: 'Mermaid Markdown', extensions: ['md', 'mmd'] });
    else filters.push({ name: 'All Files', extensions: ['*'] });

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Diagram',
      defaultPath: defaultName,
      filters
    });

    if (result.canceled || !result.filePath) return { success: false, canceled: true };

    try {
      if (type === 'png' && content.startsWith('data:image/png;base64,')) {
        const base64Data = content.replace(/^data:image\/png;base64,/, '');
        await fs.promises.writeFile(result.filePath, Buffer.from(base64Data, 'base64'));
      } else {
        await fs.promises.writeFile(result.filePath, content, 'utf8');
      }
      return { success: true, filePath: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // GitHub Integration & Remote Repositories (Public & Private)
  ipcMain.handle('github:setToken', async (event, token) => {
    return await githubRemoteService.setToken(token);
  });

  ipcMain.handle('github:getUser', () => {
    return githubRemoteService.getUser();
  });

  ipcMain.handle('github:logout', () => {
    return githubRemoteService.logout();
  });

  ipcMain.handle('github:getUserRepos', async () => {
    return await githubRemoteService.getUserRepositories();
  });

  ipcMain.handle('github:fetchRemoteRepo', async (event, repoInput) => {
    const onProgress = (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('github:progress', msg);
      }
    };
    try {
      const res = await githubRemoteService.fetchRemoteRepository(repoInput, onProgress);
      saveRecentRepo(res.path);
      setupFolderWatcher(res.path);
      return { success: true, ...res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Window Controls
  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Security Hardening: Enforce strict Content-Security-Policy across all sessions
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'none'; script-src 'self' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: file: https://avatars.githubusercontent.com https://github.com; font-src 'self' data:; connect-src 'self' https://api.github.com https://github.com; object-src 'none'; frame-src 'none'; base-uri 'self';"
        ]
      }
    });
  });

  // Security Hardening: Deny all sensitive permission requests
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(false);
  });

  githubRemoteService = new GitHubRemoteService(app.getPath('userData'));
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
