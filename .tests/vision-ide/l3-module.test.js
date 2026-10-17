'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const fileService = require('../../src/main/services/fileService');
const gitService = require('../../src/main/services/gitService');
const diagramService = require('../../src/main/services/diagramService');

test('L3: full workspace scanning and tree assembly', async () => {
  const root = path.resolve(__dirname, '../..');
  const result = await fileService.scanDirectory(root);

  assert.ok(result.rootName);
  assert.ok(result.tree);
  assert.ok(Array.isArray(result.files));
  assert.ok(result.files.length > 5);

  // Check that src/main/main.js is found
  const mainFile = result.files.find(f => f.relativePath.replace(/\\/g, '/') === 'src/main/main.js');
  assert.ok(mainFile, 'src/main/main.js should be in scanned files');
  assert.equal(mainFile.language, 'javascript');

  // Verify all foldernames starting with '.' are excluded from scan
  const dotFolderFiles = result.files.filter(f => {
    const parts = f.relativePath.replace(/\\/g, '/').split('/');
    return parts.slice(0, -1).some(seg => seg.startsWith('.'));
  });
  assert.equal(dotFolderFiles.length, 0, 'Files inside foldernames starting with dot must not be scanned');
  assert.equal(result.tree.children.some(c => c.type === 'directory' && c.name.startsWith('.')), false, 'Tree children must not contain foldernames starting with dot');
});

test('L3: git repository status and commit graph extraction', async () => {
  const root = path.resolve(__dirname, '../..');
  const isRepo = await gitService.isGitRepo(root);
  assert.equal(isRepo, true, 'Workspace should be recognized as a Git repository');

  const status = await gitService.getGitStatus(root);
  assert.equal(status.isRepo, true);
  assert.ok(status.branch);

  const log = await gitService.getGitLog(root, 10);
  assert.ok(Array.isArray(log.commits));
  assert.ok(log.commits.length >= 1, 'Should contain at least the initial commit');
  assert.ok(log.graph.nodes.length >= 1);
});

test('L3: codebase architecture diagram and AST links generation', async () => {
  const root = path.resolve(__dirname, '../..');
  const scanResult = await fileService.scanDirectory(root);
  const diagram = await diagramService.generateDiagram(root, scanResult.files);

  assert.ok(Array.isArray(diagram.nodes));
  assert.ok(Array.isArray(diagram.links));
  assert.ok(Array.isArray(diagram.clusters));

  // Check clusters exist for src/main, src/preload, src/renderer, etc.
  const clusterIds = diagram.clusters.map(c => c.id);
  assert.ok(clusterIds.includes('src/main') || clusterIds.includes('src/main/services'));

  // Test Mermaid generation
  const mermaid = diagramService.toMermaid(diagram);
  assert.ok(mermaid.startsWith('graph TD'));
  assert.ok(mermaid.includes('subgraph'));
});

test('L3: deep symbol and call graph generation across repository files', async () => {
  const root = path.resolve(__dirname, '../..');
  const scanResult = await fileService.scanDirectory(root);

  // Generate symbol graph for symbolService itself
  const symGraph = await diagramService.generateSymbolGraph(root, 'src/main/services/symbolService.js', scanResult.files);

  assert.ok(Array.isArray(symGraph.nodes));
  assert.ok(Array.isArray(symGraph.links));
  assert.ok(symGraph.stats);
  assert.ok(symGraph.stats.totalSymbols > 0);

  // Verify functions like extractSymbolsFromContent are present
  const fnNode = symGraph.nodes.find(n => n.name === 'extractSymbolsFromContent');
  assert.ok(fnNode, 'Should find extractSymbolsFromContent function node');
  assert.equal(fnNode.kind, 'function');
  assert.ok(fnNode.line > 0);
  assert.equal(fnNode.relativePath, 'src/main/services/symbolService.js');
});

test('L3: extensionService manages extension lifecycle and theme persistence', async () => {
  const ExtensionService = require('../../src/main/services/extensionService');
  const service = new ExtensionService();
  const tmpDir = path.resolve(__dirname, '../fixtures/test-ext-suite');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  service.init(tmpDir);

  // Verify default built-in themes exist
  const defaultThemes = service.getAvailableThemes();
  assert.ok(defaultThemes.some(t => t.id === 'github-dark-custom'));
  assert.ok(defaultThemes.some(t => t.id === 'vs-dark'));
  assert.ok(defaultThemes.some(t => t.id === 'vs'));

  // Install a mock theme extension from buffer
  function makeZip(name, data) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.from(data, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(dataBuf.length, 18);
    header.writeUInt32LE(dataBuf.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    return Buffer.concat([header, nameBuf, dataBuf]);
  }

  const pkgJson = JSON.stringify({
    name: 'dracula-theme',
    displayName: 'Dracula Official',
    publisher: 'dracula-theme',
    version: '2.24.2',
    contributes: {
      themes: [{ id: 'dracula', label: 'Dracula', uiTheme: 'vs-dark', path: './theme/dracula.json' }]
    }
  });

  const themeJson = JSON.stringify({
    name: 'Dracula',
    type: 'dark',
    colors: { 'editor.background': '#282a36', 'editor.foreground': '#f8f8f2' }
  });

  const vsixBuffer = Buffer.concat([
    makeZip('extension/package.json', pkgJson),
    makeZip('extension/theme/dracula.json', themeJson)
  ]);

  const installResult = service.installFromBuffer(vsixBuffer, 'dracula');
  assert.equal(installResult.success, true);
  assert.equal(installResult.extension.id, 'dracula-theme.dracula-theme');

  // Verify installed list
  const installed = service.getInstalledExtensions();
  assert.equal(installed.length, 1);
  assert.equal(installed[0].name, 'dracula-theme');

  // Verify theme definition
  const themes = service.getAvailableThemes();
  assert.ok(themes.some(t => t.id.includes('dracula')));

  const themeDef = service.setActiveTheme('dracula-theme.dracula-theme:dracula');
  assert.ok(themeDef);
  assert.equal(themeDef.uiColors.bgPrimary, '#282a36');

  // Verify toggle disable/enable
  service.toggleExtension('dracula-theme.dracula-theme', false);
  const themesDisabled = service.getAvailableThemes();
  assert.equal(themesDisabled.some(t => t.id.includes('dracula')), false, 'Disabled extension themes should not be listed');

  // Uninstall
  const uninstallRes = service.uninstallExtension('dracula-theme.dracula-theme');
  assert.equal(uninstallRes.success, true);
  assert.equal(service.getInstalledExtensions().length, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('L3: aiService tests connection and formats context-rich prompts', async () => {
  const AiService = require('../../src/main/services/aiService');
  const service = new AiService();
  const tmpSettings = path.resolve(__dirname, '../fixtures/test-ai-l3.json');
  if (fs.existsSync(tmpSettings)) fs.rmSync(tmpSettings, { force: true });

  service.init(tmpSettings);

  // Test missing provider key rejection
  const badConn = await service.testConnection('anthropic');
  assert.equal(badConn.success, false);
  assert.ok(badConn.error.includes('Missing API key'));

  // If agy.exe is present on this machine, test Antigravity connection
  if (service.config.antigravityAvailable) {
    const agConn = await service.testConnection('antigravity');
    assert.equal(agConn.success, true);
    assert.ok(agConn.message.includes('Antigravity'));
  }

  if (fs.existsSync(tmpSettings)) fs.rmSync(tmpSettings, { force: true });
});

