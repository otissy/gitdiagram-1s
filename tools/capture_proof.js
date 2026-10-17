const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:/Users/lilsh/.gemini/antigravity-ide/brain/53f862f5-ca41-494b-9600-f23daa8dde3e';
const TARGET_PROOF = path.join(ARTIFACT_DIR, 'gitdiagram_1s_proof.png');

app.disableHardwareAcceleration();

// Load services into main process as in main.js
const fileService = require('../src/main/services/fileService');
const gitService = require('../src/main/services/gitService');
const diagramService = require('../src/main/services/diagramService');
const { ipcMain } = require('electron');

// Register IPC handlers for test run
ipcMain.handle('dialog:openFolder', async () => process.cwd());
ipcMain.handle('storage:getRecent', () => [process.cwd()]);
ipcMain.handle('storage:addRecent', (e, p) => [p]);
ipcMain.handle('repo:scan', async (e, p) => await fileService.scanDirectory(p));
ipcMain.handle('file:read', async (e, p) => await fileService.readFile(p));
ipcMain.handle('file:save', async (e, p, c) => await fileService.saveFile(p, c));
ipcMain.handle('git:isRepo', async (e, p) => await gitService.isGitRepo(p));
ipcMain.handle('git:getStatus', async (e, p) => await gitService.getGitStatus(p));
ipcMain.handle('git:getBranches', async (e, p) => await gitService.getGitBranches(p));
ipcMain.handle('git:switchBranch', async (e, p, b) => await gitService.switchBranch(p, b));
ipcMain.handle('git:getLog', async (e, p, m) => await gitService.getGitLog(p, m));
ipcMain.handle('git:getDiff', async (e, p, f, a, b) => await gitService.getGitDiff(p, f, a, b));
ipcMain.handle('diagram:generate', async (e, p, f, o) => await diagramService.generateDiagram(p, f, o));
ipcMain.handle('diagram:toMermaid', (e, d) => diagramService.toMermaid(d));
ipcMain.handle('dialog:saveExport', async () => ({ success: true }));
ipcMain.handle('window:minimize', () => {});
ipcMain.handle('window:maximize', () => {});
ipcMain.handle('window:close', () => {});
ipcMain.handle('window:isMaximized', () => false);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../src/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`PAGE LOG [${sourceId}:${line}]: ${message}`);
  });

  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  // Trigger opening current repository
  await win.webContents.executeJavaScript(`
    (async () => {
      await window.app.openRepository(${JSON.stringify(process.cwd().replace(/\\/g, '/'))});
    })();
  `);

  // Wait 4 seconds for Monaco Editor and SVG Diagram animations to settle
  await new Promise(r => setTimeout(r, 4000));

  const image = await win.webContents.capturePage();
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(TARGET_PROOF, image.toPNG());
  console.log('Proof screenshot saved to:', TARGET_PROOF);

  app.quit();
});
