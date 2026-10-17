'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const fileService = require('../../src/main/services/fileService');
const diagramService = require('../../src/main/services/diagramService');

const FIXTURE_DIR = path.join(__dirname, '../fixtures/sample-repo');

test('L4: end-to-end multi-language repo scan, AST link resolution, and diagram generation', async () => {
  // 1. Setup multi-language fixture directory
  fs.mkdirSync(path.join(FIXTURE_DIR, 'src/components'), { recursive: true });
  fs.mkdirSync(path.join(FIXTURE_DIR, 'src/services'), { recursive: true });
  fs.mkdirSync(path.join(FIXTURE_DIR, 'src/utils'), { recursive: true });
  fs.mkdirSync(path.join(FIXTURE_DIR, 'py_backend'), { recursive: true });

  fs.writeFileSync(path.join(FIXTURE_DIR, 'package.json'), JSON.stringify({ name: 'fixture-app', version: '1.0.0' }, null, 2));
  fs.writeFileSync(path.join(FIXTURE_DIR, 'README.md'), '# Fixture Application\nSample project for e2e tests.');

  // Component
  fs.writeFileSync(path.join(FIXTURE_DIR, 'src/components/Button.tsx'), `
    import React from 'react';
    import { formatLabel } from '../utils/formatter';
    export const Button = () => <button>{formatLabel('Click')}</button>;
  `);

  // Util
  fs.writeFileSync(path.join(FIXTURE_DIR, 'src/utils/formatter.ts'), `
    export function formatLabel(str: string): string {
      return str.toUpperCase();
    }
  `);

  // Service
  fs.writeFileSync(path.join(FIXTURE_DIR, 'src/services/apiService.js'), `
    const { formatLabel } = require('../utils/formatter');
    module.exports = { fetchData: () => formatLabel('data') };
  `);

  // Entry point
  fs.writeFileSync(path.join(FIXTURE_DIR, 'src/index.ts'), `
    import { Button } from './components/Button';
    import { fetchData } from './services/apiService';
    console.log('App running');
  `);

  // Python module
  fs.writeFileSync(path.join(FIXTURE_DIR, 'py_backend/calc.py'), `
def add(a, b):
    return a + b
  `);

  fs.writeFileSync(path.join(FIXTURE_DIR, 'py_backend/main.py'), `
from calc import add
print(add(2, 3))
  `);

  try {
    // 2. Scan repository
    const scanResult = await fileService.scanDirectory(FIXTURE_DIR);
    assert.equal(scanResult.rootName, 'sample-repo');
    assert.ok(scanResult.files.length >= 7, 'Should detect at least 7 files');

    // 3. Verify file reads
    const indexFile = scanResult.files.find(f => f.name === 'index.ts');
    assert.ok(indexFile);
    assert.equal(indexFile.language, 'typescript');
    assert.equal(indexFile.isBinary, false);

    const readResult = await fileService.readFile(indexFile.path);
    assert.ok(readResult.content.includes("import { Button } from './components/Button'"));

    // 4. Generate diagram
    const diagram = await diagramService.generateDiagram(FIXTURE_DIR, scanResult.files);
    assert.ok(diagram.nodes.length >= 7);
    assert.ok(diagram.links.length >= 3, 'Should resolve AST import links');

    // Verify AST import link: src/index.ts -> src/components/Button.tsx
    const indexToButton = diagram.links.find(
      l => l.source === 'src/index.ts' && l.target === 'src/components/Button.tsx'
    );
    assert.ok(indexToButton, 'Must link src/index.ts to src/components/Button.tsx');

    // Verify AST import link: src/components/Button.tsx -> src/utils/formatter.ts
    const buttonToFormatter = diagram.links.find(
      l => l.source === 'src/components/Button.tsx' && l.target === 'src/utils/formatter.ts'
    );
    assert.ok(buttonToFormatter, 'Must link Button.tsx to formatter.ts');

    // Verify Python import link: py_backend/main.py -> py_backend/calc.py
    const pyLink = diagram.links.find(
      l => l.source === 'py_backend/main.py' && l.target === 'py_backend/calc.py'
    );
    assert.ok(pyLink, 'Must link py_backend/main.py to py_backend/calc.py');

    // 5. Test Mermaid export
    const mermaid = diagramService.toMermaid(diagram);
    assert.ok(mermaid.includes('subgraph'));
    assert.ok(mermaid.includes('src_components'));

  } finally {
    // Cleanup fixture directory
    try {
      fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
    } catch (e) {
      // ignore cleanup errors
    }
  }
});
