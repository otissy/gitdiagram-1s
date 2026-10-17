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
const symbolService = require('../src/main/services/symbolService');
const terminalService = require('../src/main/services/terminalService');
const { ipcMain } = require('electron');

// Register IPC handlers for test run
ipcMain.handle('dialog:openFolder', async () => process.cwd());
ipcMain.handle('storage:getRecent', () => [process.cwd()]);
ipcMain.handle('storage:addRecent', (e, p) => [p]);
ipcMain.handle('terminal:spawn', (e, id, cwd) => terminalService.spawnTerminal(id, cwd, e.sender));
ipcMain.handle('terminal:write', (e, id, data) => terminalService.write(id, data));
ipcMain.handle('terminal:kill', (e, id) => terminalService.kill(id));
ipcMain.handle('terminal:killAll', () => terminalService.killAll());
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
ipcMain.handle('diagram:generateSymbols', async (e, p, t, f) => await diagramService.generateSymbolGraph(p, t, f));
ipcMain.handle('file:getSymbols', async (e, p) => await symbolService.extractFileSymbols(p));
ipcMain.handle('diagram:toMermaid', (e, d) => diagramService.toMermaid(d));
ipcMain.handle('dialog:saveExport', async () => ({ success: true }));
ipcMain.handle('github:setToken', () => ({ success: true, user: { login: 'octocat' } }));
ipcMain.handle('github:getUser', () => ({ login: 'octocat', name: 'Mona Lisa', avatar_url: 'https://github.com/github.png', total_private_repos: 6, public_repos: 14 }));
ipcMain.handle('github:logout', () => ({ success: true }));
ipcMain.handle('github:getUserRepos', () => ({
  success: true,
  repos: [
    { fullName: 'octocat/secret-backend', private: true, language: 'Go', stars: 8 },
    { fullName: 'octocat/my-app', private: true, language: 'TypeScript', stars: 22 },
    { fullName: 'octocat/open-tools', private: false, language: 'JavaScript', stars: 120 }
  ]
}));
const { GitHubRemoteService } = require('../src/main/services/githubRemoteService');
const githubRemoteService = new GitHubRemoteService();
ipcMain.handle('github:getRepoDetails', async (e, p, o, r) => await githubRemoteService.getRepoFullDetails(p, o, r));

const ExtensionService = require('../src/main/services/extensionService');
const extensionService = new ExtensionService();
extensionService.init();
ipcMain.handle('extensions:search', async (e, q, p) => await extensionService.searchMarketplace(q, p));
ipcMain.handle('extensions:installMarketplace', async (e, id) => await extensionService.installFromMarketplace(id));
ipcMain.handle('extensions:installVsix', async () => ({ canceled: true }));
ipcMain.handle('extensions:getInstalled', () => extensionService.getInstalledExtensions());
ipcMain.handle('extensions:uninstall', (e, id) => extensionService.uninstallExtension(id));
ipcMain.handle('extensions:toggle', (e, id, en) => extensionService.toggleExtension(id, en));
ipcMain.handle('extensions:getThemes', () => extensionService.getAvailableThemes());
ipcMain.handle('extensions:setTheme', (e, id) => extensionService.setActiveTheme(id));
ipcMain.handle('extensions:getSnippets', () => extensionService.getSnippets());

const AiService = require('../src/main/services/aiService');
const aiService = new AiService();
aiService.init();
ipcMain.handle('ai:getConfig', () => aiService.getConfigSafe());
ipcMain.handle('ai:saveConfig', (e, c) => aiService.saveConfig(c));
ipcMain.handle('ai:testConnection', async (e, p) => await aiService.testConnection(p));
ipcMain.handle('ai:chat', (e, p, c) => {
  aiService.streamChat(p, c,
    (chunk) => { if (!e.sender.isDestroyed()) e.sender.send('ai:chunk', chunk); },
    () => { if (!e.sender.isDestroyed()) e.sender.send('ai:done'); },
    (err) => { if (!e.sender.isDestroyed()) e.sender.send('ai:error', err); }
  );
  return { started: true };
});
ipcMain.handle('ai:abort', () => aiService.abortCurrent());

ipcMain.handle('shell:openExternal', async () => ({ success: true }));
ipcMain.handle('window:minimize', () => {});
ipcMain.handle('window:maximize', () => {});
ipcMain.handle('window:close', () => {});
ipcMain.handle('window:isMaximized', () => false);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
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

  // 1. Open current repository
  await win.webContents.executeJavaScript(`
    (async () => {
      await window.app.openRepository(${JSON.stringify(process.cwd().replace(/\\/g, '/'))});
    })();
  `);

  await new Promise(r => setTimeout(r, 2000));

  // 2. Open symbolService.js, jump directly to extractSymbolsFromContent definition,
  //    switch sidebar to Outline / Symbols view, and switch Diagram to Symbols mode!
  await win.webContents.executeJavaScript(`
    (async () => {
      try {
        const symFile = ${JSON.stringify(path.join(process.cwd(), 'src/main/services/symbolService.js').replace(/\\/g, '/'))};
        await window.monacoController.openFileAndReveal(symFile, 'src/main/services/symbolService.js', 17, 'extractSymbolsFromContent');

        // Switch Sidebar to AI Agent view!
        const actAi = document.getElementById('act-ai');
        if (actAi) actAi.click();

        // Switch Diagram to Symbols mode
        console.log('Switching diagram mode to sym...');
        window.diagramRenderer.setMode('sym');
      } catch (err) {
        console.error('ERROR in step 2:', err);
      }
    })();
  `);

  // Wait 4 seconds for Monaco line reveal, Outline tree render, and D3 Symbol graph force layout to stabilize
  await new Promise(r => setTimeout(r, 4000));

  const image = await win.webContents.capturePage();
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(TARGET_PROOF, image.toPNG());
  console.log('Proof screenshot saved to:', TARGET_PROOF);

  app.quit();
});

