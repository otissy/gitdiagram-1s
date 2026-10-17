'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
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

