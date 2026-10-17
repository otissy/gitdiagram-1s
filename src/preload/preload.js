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
  toMermaid: (diagramData) => ipcRenderer.invoke('diagram:toMermaid', diagramData),
  saveExportFile: (defaultName, content, type) => ipcRenderer.invoke('dialog:saveExport', defaultName, content, type),

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
