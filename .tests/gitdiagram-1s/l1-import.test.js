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

test('L1: package.json is valid and points to main', () => {
  const pkg = require('../../package.json');
  assert.equal(pkg.name, 'gitdiagram-1s');
  assert.equal(pkg.main, 'src/main/main.js');
});
