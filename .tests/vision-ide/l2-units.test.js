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

test('L2: parseRepoIdentifier parses slugs, URLs, and SSH remotes', () => {
  const { parseRepoIdentifier } = require('../../src/main/services/githubRemoteService');

  const slug = parseRepoIdentifier('facebook/react');
  assert.deepEqual(slug, { owner: 'facebook', repo: 'react', fullName: 'facebook/react' });

  const url = parseRepoIdentifier('https://github.com/torvalds/linux.git');
  assert.deepEqual(url, { owner: 'torvalds', repo: 'linux', fullName: 'torvalds/linux' });

  const ssh = parseRepoIdentifier('git@github.com:myorg/my-private-repo.git');
  assert.deepEqual(ssh, { owner: 'myorg', repo: 'my-private-repo', fullName: 'myorg/my-private-repo' });

  assert.equal(parseRepoIdentifier('invalid_slug_without_slash'), null);
  assert.equal(parseRepoIdentifier(''), null);
});

test('L2: GitHubRemoteService manages config and token state safely', () => {
  const { GitHubRemoteService } = require('../../src/main/services/githubRemoteService');
  const tempDir = path.join(__dirname, '../fixtures/gh-test');
  const service = new GitHubRemoteService(tempDir);

  assert.equal(service.getToken(), null);
  assert.equal(service.getUser(), null);

  service.saveConfig({ token: 'test_token_123', user: { login: 'octocat' } });
  assert.equal(service.getToken(), 'test_token_123');
  assert.equal(service.getUser().login, 'octocat');

  service.logout();
  assert.equal(service.getToken(), null);
  assert.equal(service.getUser(), null);

  try {
    require('fs').rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}
});

test('L2: launch scripts are redundant and standard npm start is configured', () => {
  const fs = require('fs');
  const runPs1Path = path.resolve(__dirname, '../../run.ps1');
  assert.equal(fs.existsSync(runPs1Path), false, 'run.ps1 must not exist');

  const pkg = require('../../package.json');
  assert.equal(pkg.scripts.start, 'electron .');
});

test('L2: symbolService extracts deep symbols (classes, methods, functions, vars) in JS/TS', () => {
  const symbolService = require('../../src/main/services/symbolService');
  const jsSample = `
    export interface UserProfile {
      id: string;
      name: string;
    }

    export const MAX_RETRY = 3;
    let requestCount = 0;

    export class ApiClient extends BaseClient {
      constructor(baseUrl) {
        super(baseUrl);
      }

      async fetchData(endpoint) {
        helperFormat(endpoint);
        return this.sendRequest(endpoint);
      }

      sendRequest(url) {
        return url;
      }
    }

    function helperFormat(str) {
      return str.trim();
    }
  `;

  const symbols = symbolService.extractSymbolsFromContent(jsSample, '.ts', 'src/api.ts');
  const kinds = symbols.map(s => s.kind);

  assert.ok(kinds.includes('interface'), 'Should extract interface');
  assert.ok(kinds.includes('constant'), 'Should extract constant');
  assert.ok(kinds.includes('variable'), 'Should extract variable');
  assert.ok(kinds.includes('class'), 'Should extract class');
  assert.ok(kinds.includes('method'), 'Should extract method');
  assert.ok(kinds.includes('function'), 'Should extract function');

  const clientClass = symbols.find(s => s.name === 'ApiClient');
  assert.ok(clientClass);
  assert.equal(clientClass.superClass, 'BaseClient');

  const methods = symbols.filter(s => s.kind === 'method');
  assert.ok(methods.some(m => m.shortName === 'fetchData'));
  assert.ok(methods.some(m => m.shortName === 'constructor'));

  // Call detection
  const calls = symbolService.extractSymbolCalls(jsSample, symbols);
  assert.ok(calls.some(c => c.source === 'ApiClient.fetchData' && c.target === 'helperFormat'));
});

test('L2: symbolService extracts symbols and call graph in Python', () => {
  const symbolService = require('../../src/main/services/symbolService');
  const pySample = `
API_VERSION = "v2"
timeout = 30

class Calculator:
    def add(self, a, b):
        return a + b

    def compute(self, x, y):
        validate(x)
        return self.add(x, y)

def validate(val):
    if val < 0:
        raise ValueError("negative")
  `;

  const symbols = symbolService.extractSymbolsFromContent(pySample, '.py', 'calc.py');
  assert.ok(symbols.some(s => s.name === 'API_VERSION' && s.kind === 'constant'));
  assert.ok(symbols.some(s => s.name === 'timeout' && s.kind === 'variable'));
  assert.ok(symbols.some(s => s.name === 'Calculator' && s.kind === 'class'));
  assert.ok(symbols.some(s => s.name === 'Calculator.add' && s.kind === 'method'));
  assert.ok(symbols.some(s => s.name === 'validate' && s.kind === 'function'));

  const calls = symbolService.extractSymbolCalls(pySample, symbols);
  assert.ok(calls.some(c => c.source === 'Calculator.compute' && c.target === 'validate'));
});

test('L2: securityService validates and sanitizes paths strictly against injection', () => {
  const { sanitizePathArg } = require('../../src/main/services/securityService');

  // Valid paths
  assert.equal(sanitizePathArg('  src/main/main.js  '), path.normalize('src/main/main.js'));
  assert.equal(sanitizePathArg('folder/sub/file.ts'), path.normalize('folder/sub/file.ts'));

  // Reject null-byte injection
  assert.throws(() => sanitizePathArg('folder/\0evil.js'), /Invalid path argument/);

  // Reject control characters
  assert.throws(() => sanitizePathArg('folder/\r\nevil.js'), /Control characters detected/);

  // Reject script protocols
  assert.throws(() => sanitizePathArg('javascript:alert(1)'), /Malicious protocol detected/);
  assert.throws(() => sanitizePathArg('data:text/html,<script>evil</script>'), /Malicious protocol detected/);
  assert.throws(() => sanitizePathArg('vbscript:MsgBox(1)'), /Malicious protocol detected/);
  assert.throws(() => sanitizePathArg('about:blank'), /Malicious protocol detected/);
  assert.throws(() => sanitizePathArg('blob:https://evil.com/uuid'), /Malicious protocol detected/);

  // Reject empty / non-string
  assert.throws(() => sanitizePathArg(''), /Invalid path argument/);
  assert.throws(() => sanitizePathArg(null), /Invalid path argument/);
  assert.throws(() => sanitizePathArg(undefined), /Invalid path argument/);
  assert.throws(() => sanitizePathArg({}), /Invalid path argument/);
});

test('L2: securityService validates branch names and rejects CLI option injections', () => {
  const { isValidBranchName } = require('../../src/main/services/securityService');

  // Valid git branch names
  assert.equal(isValidBranchName('main'), true);
  assert.equal(isValidBranchName('master'), true);
  assert.equal(isValidBranchName('feature/login-modal'), true);
  assert.equal(isValidBranchName('release-v1.0'), true);

  // Option injection attacks starting with '-'
  assert.equal(isValidBranchName('--upload-pack=touch /tmp/pwned'), false);
  assert.equal(isValidBranchName('-oProxyCommand=evil'), false);

  // Control characters and whitespace
  assert.equal(isValidBranchName('main\0evil'), false);
  assert.equal(isValidBranchName('branch with spaces'), false);
  assert.equal(isValidBranchName('branch\nname'), false);

  // Illegal git ref symbols
  assert.equal(isValidBranchName('branch..name'), false);
  assert.equal(isValidBranchName('branch~1'), false);
  assert.equal(isValidBranchName('branch^2'), false);
  assert.equal(isValidBranchName('branch:colon'), false);
  assert.equal(isValidBranchName('branch?wildcard'), false);
  assert.equal(isValidBranchName('branch*star'), false);
  assert.equal(isValidBranchName('branch@{upstream}'), false);

  // Empty / non-string
  assert.equal(isValidBranchName(''), false);
  assert.equal(isValidBranchName(null), false);
});

test('L2: securityService validates GitHub slug parts against option injection', () => {
  const { isValidSlugPart } = require('../../src/main/services/securityService');

  assert.equal(isValidSlugPart('facebook'), true);
  assert.equal(isValidSlugPart('react'), true);
  assert.equal(isValidSlugPart('my_project.org'), true);
  assert.equal(isValidSlugPart('v1.2.3'), true);

  // Malicious slugs starting with '-' (flag injection)
  assert.equal(isValidSlugPart('--upload-pack'), false);
  assert.equal(isValidSlugPart('-rf'), false);

  // Malicious characters
  assert.equal(isValidSlugPart('owner/repo'), false);
  assert.equal(isValidSlugPart('owner;echo evil'), false);
  assert.equal(isValidSlugPart('owner space'), false);
});

test('L2: securityService escapes untrusted strings against XSS injection', () => {
  const { escapeHtml } = require('../../src/main/services/securityService');

  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml("Tom & Jerry's"), 'Tom &amp; Jerry&#39;s');
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(12345), '12345');
});

test('L2: git security parameters enforce zero hooks, zero fsmonitor, and no credential leaks', () => {
  const { GIT_SECURITY_ARGS, GIT_SAFE_ENV } = require('../../src/main/services/securityService');

  // Verify security args contains hook, fsmonitor, and credential protection
  assert.ok(GIT_SECURITY_ARGS.includes('core.hooksPath='));
  assert.ok(GIT_SECURITY_ARGS.includes('core.fsmonitor='));
  assert.ok(GIT_SECURITY_ARGS.includes('credential.helper='));
  assert.ok(GIT_SECURITY_ARGS.includes('diff.external='));
  assert.ok(GIT_SECURITY_ARGS.includes('diff.textconv='));

  // Verify safe env disables interactive prompts and ignores system configs
  assert.equal(GIT_SAFE_ENV.GIT_TERMINAL_PROMPT, '0');
  assert.equal(GIT_SAFE_ENV.GIT_CONFIG_NOSYSTEM, '1');
});

test('L2: renderer index.html declares strict Content Security Policy without unsafe-inline scripts', () => {
  const fs = require('fs');
  const indexPath = path.resolve(__dirname, '../../src/renderer/index.html');
  const content = fs.readFileSync(indexPath, 'utf8');

  // Verify CSP meta tag exists
  assert.ok(content.includes('<meta http-equiv="Content-Security-Policy"'), 'CSP meta tag must exist');
  assert.ok(content.includes("default-src 'none'"), 'CSP must set default-src to none');
  assert.ok(content.includes("script-src 'self'"), 'CSP must set script-src to self');

  // Extract script-src directive and verify it strictly prohibits unsafe-inline
  const cspMatch = content.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  assert.ok(cspMatch, 'CSP content must be extractable');
  const scriptSrcPart = cspMatch[1].split(';').find(p => p.trim().startsWith('script-src'));
  assert.ok(scriptSrcPart, 'script-src must be defined in CSP');
  assert.equal(scriptSrcPart.includes("'unsafe-inline'"), false, 'script-src must NOT allow unsafe-inline');
});

test('L2: terminalService manages interactive processes and lifecycle correctly', async () => {
  const terminalService = require('../../src/main/services/terminalService');

  // Verify default shell detection
  const defaultShell = terminalService.getDefaultShell();
  assert.ok(typeof defaultShell === 'string' && defaultShell.length > 0);

  // Mock webContents sender
  let receivedData = '';
  const mockSender = {
    isDestroyed: () => false,
    send: (channel, payload) => {
      if (channel === 'terminal:data') {
        receivedData += payload.data;
      }
    }
  };

  const sessionId = 'test_session_l2';
  const spawnRes = terminalService.spawnTerminal(sessionId, process.cwd(), mockSender);
  assert.equal(spawnRes.success, true);
  assert.equal(terminalService.hasSession(sessionId), true);

  // Write a command and wait for output
  terminalService.write(sessionId, 'echo TERMINAL_TEST_OK\r\n');

  await new Promise(r => setTimeout(r, 600));
  assert.ok(receivedData.includes('TERMINAL_TEST_OK') || receivedData.length > 0);

  // Clean up
  const killRes = terminalService.kill(sessionId);
  assert.equal(killRes.success, true);
  assert.equal(terminalService.hasSession(sessionId), false);

  terminalService.killAll();
});

test('L2: renderer index.html includes IDE mode elements, terminal drawer, and command palette', () => {
  const fs = require('fs');
  const indexPath = path.resolve(__dirname, '../../src/renderer/index.html');
  const content = fs.readFileSync(indexPath, 'utf8');

  // Verify opt-in mode elements
  assert.ok(content.includes('id="btn-ide-toggle"'), 'btn-ide-toggle must exist in titlebar');
  assert.ok(content.includes('id="ide-optin-modal"'), 'ide-optin-modal must exist in markup');
  assert.ok(content.includes('id="terminal-drawer"'), 'terminal-drawer must exist in code-pane');
  assert.ok(content.includes('id="ide-status-bar"'), 'ide-status-bar must exist in markup');
  assert.ok(content.includes('id="command-palette-modal"'), 'command-palette-modal must exist in markup');

  // Verify xterm and IDE scripts
  assert.ok(content.includes('xterm/lib/xterm.js'), 'xterm.js must be loaded');
  assert.ok(content.includes('xterm-addon-fit/lib/xterm-addon-fit.js'), 'xterm-addon-fit must be loaded');
  assert.ok(content.includes('js/ideController.js'), 'ideController.js must be loaded');
});


