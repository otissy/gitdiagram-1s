const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const fileService = require('./services/fileService');
const gitService = require('./services/gitService');
const diagramService = require('./services/diagramService');

let mainWindow = null;
let currentWatcher = null;
const recentsFilePath = path.join(app.getPath('userData'), 'recent-repos.json');

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
    let recents = loadRecentRepos();
    recents = recents.filter(p => p !== folderPath);
    recents.unshift(folderPath);
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
      sandbox: false,
      webSecurity: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Security Hardening: Prevent navigation away from the local app
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!navigationUrl.startsWith('file://')) {
      event.preventDefault();
    }
  });

  // Security Hardening: Block new window popups / untrusted webviews
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      require('electron').shell.openExternal(url);
    }
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
    setupFolderWatcher(folderPath);
    return await fileService.scanDirectory(folderPath);
  });

  // File: Read
  ipcMain.handle('file:read', async (event, filePath) => {
    return await fileService.readFile(filePath);
  });

  // File: Save
  ipcMain.handle('file:save', async (event, filePath, content) => {
    return await fileService.saveFile(filePath, content);
  });

  // Git Services
  ipcMain.handle('git:isRepo', async (event, folderPath) => {
    return await gitService.isGitRepo(folderPath);
  });

  ipcMain.handle('git:getStatus', async (event, folderPath) => {
    return await gitService.getGitStatus(folderPath);
  });

  ipcMain.handle('git:getBranches', async (event, folderPath) => {
    return await gitService.getGitBranches(folderPath);
  });

  ipcMain.handle('git:switchBranch', async (event, folderPath, branch) => {
    return await gitService.switchBranch(folderPath, branch);
  });

  ipcMain.handle('git:getLog', async (event, folderPath, maxCount) => {
    return await gitService.getGitLog(folderPath, maxCount);
  });

  ipcMain.handle('git:getDiff', async (event, folderPath, filePath, commitA, commitB) => {
    return await gitService.getGitDiff(folderPath, filePath, commitA, commitB);
  });

  // Diagram Services
  ipcMain.handle('diagram:generate', async (event, folderPath, files, options) => {
    return await diagramService.generateDiagram(folderPath, files, options);
  });

  ipcMain.handle('diagram:toMermaid', (event, diagramData) => {
    return diagramService.toMermaid(diagramData);
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
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
