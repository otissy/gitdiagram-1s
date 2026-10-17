'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fileService = require('../../src/main/services/fileService');
const gitService = require('../../src/main/services/gitService');
const diagramService = require('../../src/main/services/diagramService');

test('L2: fileService language detection maps extensions correctly', () => {
  assert.equal(fileService.detectLanguage('app.js'), 'javascript');
  assert.equal(fileService.detectLanguage('Button.tsx'), 'typescript');
  assert.equal(fileService.detectLanguage('main.py'), 'python');
  assert.equal(fileService.detectLanguage('server.go'), 'go');
  assert.equal(fileService.detectLanguage('lib.rs'), 'rust');
  assert.equal(fileService.detectLanguage('styles.scss'), 'scss');
  assert.equal(fileService.detectLanguage('Dockerfile'), 'dockerfile');
  assert.equal(fileService.detectLanguage('unknown.xyz123'), 'plaintext');
});

test('L2: fileService binary detection identifies media and binaries', () => {
  assert.equal(fileService.isBinaryFile('image.png'), true);
  assert.equal(fileService.isBinaryFile('doc.pdf'), true);
  assert.equal(fileService.isBinaryFile('app.exe'), true);
  assert.equal(fileService.isBinaryFile('code.js'), false);

  // Buffer null-byte check
  const textBuf = Buffer.from('hello world', 'utf8');
  const binBuf = Buffer.from([0x68, 0x00, 0x6c, 0x6c, 0x6f]);
  assert.equal(fileService.isBinaryFile('sample.dat', textBuf), false);
  assert.equal(fileService.isBinaryFile('sample.dat', binBuf), true);
});

test('L2: fileService shouldIgnore blocks default unwanted directories', () => {
  assert.equal(fileService.shouldIgnore('node_modules', 'node_modules'), true);
  assert.equal(fileService.shouldIgnore('.git', '.git'), true);
  assert.equal(fileService.shouldIgnore('dist', 'dist'), true);
  assert.equal(fileService.shouldIgnore('src', 'src'), false);
  assert.equal(fileService.shouldIgnore('file.js', 'src/file.js'), false);
});

test('L2: fileService rejects null-byte injection security violations', async () => {
  await assert.rejects(
    async () => fileService.readFile('test\0bad.txt'),
    /null-byte injection detected/
  );
  await assert.rejects(
    async () => fileService.saveFile('test\0bad.txt', 'data'),
    /null-byte injection detected/
  );
});

test('L2: diagramService classifies file roles accurately', () => {
  assert.equal(diagramService.classifyFileRole('src/index.ts'), 'entry');
  assert.equal(diagramService.classifyFileRole('src/components/Header.jsx'), 'component');
  assert.equal(diagramService.classifyFileRole('src/services/apiService.js'), 'service');
  assert.equal(diagramService.classifyFileRole('src/utils/math.ts'), 'utility');
  assert.equal(diagramService.classifyFileRole('tests/app.test.js'), 'test');
  assert.equal(diagramService.classifyFileRole('package.json'), 'config');
  assert.equal(diagramService.classifyFileRole('styles/theme.css'), 'style');
  assert.equal(diagramService.classifyFileRole('README.md'), 'doc');
});

test('L2: diagramService extracts import specifiers across languages', () => {
  // JavaScript / TypeScript
  const jsContent = `
    import React from 'react';
    import { Button } from './components/Button';
    const utils = require('./utils/format');
    const lazy = import('./views/Dashboard');
  `;
  const jsImports = diagramService.extractImportSpecifiers(jsContent, '.ts');
  assert.ok(jsImports.includes('react'));
  assert.ok(jsImports.includes('./components/Button'));
  assert.ok(jsImports.includes('./utils/format'));
  assert.ok(jsImports.includes('./views/Dashboard'));

  // Python
  const pyContent = `
    import os
    import sys
    from utils.helpers import clean_data
    from .models import User
  `;
  const pyImports = diagramService.extractImportSpecifiers(pyContent, '.py');
  assert.ok(pyImports.includes('os'));
  assert.ok(pyImports.includes('sys'));
  assert.ok(pyImports.includes('utils.helpers'));
  assert.ok(pyImports.includes('.models'));

  // Go
  const goContent = `
    package main
    import (
      "fmt"
      "net/http"
      "myproject/services"
    )
  `;
  const goImports = diagramService.extractImportSpecifiers(goContent, '.go');
  assert.ok(goImports.includes('fmt'));
  assert.ok(goImports.includes('myproject/services'));
});

test('L2: diagramService resolves relative imports to file paths', () => {
  const fileMap = new Map([
    ['src/components/Button.tsx', { relativePath: 'src/components/Button.tsx' }],
    ['src/utils/format.js', { relativePath: 'src/utils/format.js' }]
  ]);

  const resolved1 = diagramService.resolveImportToFile('src/App.tsx', './components/Button', fileMap);
  assert.equal(resolved1, 'src/components/Button.tsx');

  const resolved2 = diagramService.resolveImportToFile('src/components/Button.tsx', '../utils/format', fileMap);
  assert.equal(resolved2, 'src/utils/format.js');
});
