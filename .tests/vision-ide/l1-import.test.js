'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('L1: fileService loads without error', () => {
  const fileService = require('../../src/main/services/fileService');
  assert.equal(typeof fileService.scanDirectory, 'function');
  assert.equal(typeof fileService.readFile, 'function');
  assert.equal(typeof fileService.saveFile, 'function');
  assert.equal(typeof fileService.detectLanguage, 'function');
});

test('L1: gitService loads without error', () => {
  const gitService = require('../../src/main/services/gitService');
  assert.equal(typeof gitService.isGitRepo, 'function');
  assert.equal(typeof gitService.getGitStatus, 'function');
  assert.equal(typeof gitService.getGitBranches, 'function');
  assert.equal(typeof gitService.getGitLog, 'function');
  assert.equal(typeof gitService.getGitDiff, 'function');
});

test('L1: diagramService loads without error', () => {
  const diagramService = require('../../src/main/services/diagramService');
  assert.equal(typeof diagramService.generateDiagram, 'function');
  assert.equal(typeof diagramService.classifyFileRole, 'function');
  assert.equal(typeof diagramService.extractImportSpecifiers, 'function');
  assert.equal(typeof diagramService.toMermaid, 'function');
});

test('L1: githubRemoteService loads without error', () => {
  const { GitHubRemoteService, parseRepoIdentifier } = require('../../src/main/services/githubRemoteService');
  assert.equal(typeof GitHubRemoteService, 'function');
  assert.equal(typeof parseRepoIdentifier, 'function');
});

test('L1: package.json is valid and points to main', () => {
  const pkg = require('../../package.json');
  assert.ok(pkg.name === 'vision-ide' || pkg.name === 'gitdiagram-1s');
  assert.equal(pkg.productName, 'Vision IDE');
  assert.equal(pkg.main, 'src/main/main.js');
});

test('L1: securityService and securityUtils load without error', () => {
  const sec = require('../../src/main/services/securityService');
  assert.equal(typeof sec.sanitizePathArg, 'function');
  assert.equal(typeof sec.isValidBranchName, 'function');
  assert.equal(typeof sec.isValidSlugPart, 'function');
  assert.equal(typeof sec.escapeHtml, 'function');
  assert.ok(Array.isArray(sec.GIT_SECURITY_ARGS));

  const rendererSec = require('../../src/renderer/js/securityUtils');
  assert.equal(typeof rendererSec.escapeHtml, 'function');
});

test('L1: terminalService loads without error and exposes lifecycle methods', () => {
  const terminalService = require('../../src/main/services/terminalService');
  assert.equal(typeof terminalService.spawnTerminal, 'function');
  assert.equal(typeof terminalService.write, 'function');
  assert.equal(typeof terminalService.kill, 'function');
  assert.equal(typeof terminalService.killAll, 'function');
  assert.equal(typeof terminalService.getDefaultShell, 'function');
});

test('L1: zipService loads without error', () => {
  const ZipService = require('../../src/main/services/zipService');
  assert.equal(typeof ZipService.extractZip, 'function');
  assert.equal(typeof ZipService.parseZip, 'function');
});

test('L1: extensionService loads without error and exposes extension APIs', () => {
  const ExtensionService = require('../../src/main/services/extensionService');
  const instance = new ExtensionService();
  assert.equal(typeof instance.searchMarketplace, 'function');
  assert.equal(typeof instance.installFromVsix, 'function');
  assert.equal(typeof instance.getInstalledExtensions, 'function');
  assert.equal(typeof instance.getAvailableThemes, 'function');
  assert.equal(typeof instance.getMonacoThemeDefinition, 'function');
});

test('L1: aiService loads without error and exposes multi-provider APIs', () => {
  const AiService = require('../../src/main/services/aiService');
  const instance = new AiService();
  assert.equal(typeof instance.saveConfig, 'function');
  assert.equal(typeof instance.getConfigSafe, 'function');
  assert.equal(typeof instance.testConnection, 'function');
  assert.equal(typeof instance.streamChat, 'function');
});
