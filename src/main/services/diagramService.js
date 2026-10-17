const fs = require('fs');
const path = require('path');
const symbolService = require('./symbolService');

// Classify file role by name and path
function classifyFileRole(filePath) {
  const norm = filePath.replace(/\\/g, '/').toLowerCase();
  const base = path.basename(norm);

  if (/\.(test|spec)\.[a-z0-9]+$/.test(base) || norm.includes('/tests/') || norm.includes('/__tests__/')) {
    return 'test';
  }
  if (/^(index|main|app|server|cli)\.[a-z0-9]+$/.test(base)) {
    return 'entry';
  }
  if (norm.includes('/components/') || norm.includes('/views/') || /\.(jsx|tsx|vue|svelte)$/.test(base)) {
    return 'component';
  }
  if (norm.includes('/services/') || norm.includes('/controllers/') || norm.includes('/routes/') || norm.includes('/api/')) {
    return 'service';
  }
  if (norm.includes('/models/') || norm.includes('/types/') || norm.includes('/schemas/') || /\.d\.ts$/.test(base)) {
    return 'model';
  }
  if (norm.includes('/utils/') || norm.includes('/helpers/') || norm.includes('/lib/')) {
    return 'utility';
  }
  if (/\.(json|ya?ml|toml|ini|env|config\.[a-z]+|rc)$/.test(base) || base === 'dockerfile') {
    return 'config';
  }
  if (/\.(css|scss|sass|less)$/.test(base)) {
    return 'style';
  }
  if (/\.(md|markdown|txt|rst|pdf)$/.test(base)) {
    return 'doc';
  }
  return 'file';
}

// Regex patterns to extract import/require targets from file content
function extractImportSpecifiers(content, extension) {
  const targets = new Set();
  if (!content) return [];

  const ext = extension.toLowerCase();

  // JavaScript / TypeScript / JSX / TSX
  if (['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.vue', '.svelte'].includes(ext)) {
    // import ... from 'specifier'
    const importRegex = /(?:import|export)\s+(?:[\w*\s{},$]+from\s+)?['"]([^'"]+)['"]/g;
    let m;
    while ((m = importRegex.exec(content)) !== null) {
      if (m[1]) targets.add(m[1]);
    }
    // require('specifier')
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = requireRegex.exec(content)) !== null) {
      if (m[1]) targets.add(m[1]);
    }
    // dynamic import('specifier')
    const dynImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = dynImportRegex.exec(content)) !== null) {
      if (m[1]) targets.add(m[1]);
    }
  }

  // Python
  if (['.py', '.pyw'].includes(ext)) {
    const pyFromRegex = /(?:^|\n)\s*from\s+([.\w]+)\s+import/g;
    let m;
    while ((m = pyFromRegex.exec(content)) !== null) {
      if (m[1]) targets.add(m[1]);
    }
    const pyImportRegex = /(?:^|\n)\s*import\s+([.\w]+)/g;
    while ((m = pyImportRegex.exec(content)) !== null) {
      if (m[1]) targets.add(m[1]);
    }
  }

  // C / C++
  if (['.c', '.h', '.cpp', '.hpp', '.cc'].includes(ext)) {
    const incRegex = /#include\s+["<]([^">]+)[">]/g;
    let m;
    while ((m = incRegex.exec(content)) !== null) {
      if (m[1]) targets.add(m[1]);
    }
  }

  // Go
  if (['.go'].includes(ext)) {
    const goSingle = /import\s+["']([^"']+)["']/g;
    let m;
    while ((m = goSingle.exec(content)) !== null) {
      if (m[1]) targets.add(m[1]);
    }
    const goMulti = /import\s*\(([\s\S]*?)\)/g;
    while ((m = goMulti.exec(content)) !== null) {
      const block = m[1];
      const lineRegex = /["']([^"']+)["']/g;
      let lineM;
      while ((lineM = lineRegex.exec(block)) !== null) {
        targets.add(lineM[1]);
      }
    }
  }

  // Rust
  if (['.rs'].includes(ext)) {
    const rustMod = /mod\s+([a-zA-Z0-9_]+);/g;
    let m;
    while ((m = rustMod.exec(content)) !== null) {
      if (m[1]) targets.add(m[1]);
    }
    const rustUse = /use\s+(?:crate::)?([a-zA-Z0-9_]+)/g;
    while ((m = rustUse.exec(content)) !== null) {
      if (m[1]) targets.add(m[1]);
    }
  }

  // CSS / SCSS
  if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
    const cssImport = /@import\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = cssImport.exec(content)) !== null) {
      if (m[1]) targets.add(m[1]);
    }
  }

  return Array.from(targets);
}

// Resolve import specifier to matching file in flat file list
function resolveImportToFile(fromFileRel, specifier, fileMap) {
  if (!specifier) return null;

  // Relative import (e.g. './button', '../utils/helper')
  if (specifier.startsWith('.')) {
    const fromDir = path.dirname(fromFileRel);
    const resolvedRel = path.normalize(path.join(fromDir, specifier)).replace(/\\/g, '/');

    // 1. Direct exact match
    if (fileMap.has(resolvedRel)) return resolvedRel;

    // 2. Try common extensions
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.py', '.css', '.scss', '.go', '.rs'];
    for (const ext of exts) {
      if (fileMap.has(resolvedRel + ext)) return resolvedRel + ext;
    }

    // 3. Try index files inside directory
    for (const ext of exts) {
      const idx = `${resolvedRel}/index${ext}`;
      if (fileMap.has(idx)) return idx;
    }
  } else {
    // Non-relative import: check if it matches in the same directory first (e.g. Python sibling import)
    const fromDir = path.dirname(fromFileRel);
    if (fromDir && fromDir !== '.') {
      const siblingPath = path.normalize(path.join(fromDir, specifier)).replace(/\\/g, '/');
      if (fileMap.has(siblingPath)) return siblingPath;
      for (const ext of ['.py', '.ts', '.tsx', '.js', '.jsx', '.json']) {
        if (fileMap.has(siblingPath + ext)) return siblingPath + ext;
        if (fileMap.has(`${siblingPath}/__init__.py`)) return `${siblingPath}/__init__.py`;
      }
    }

    // Direct match from root
    if (fileMap.has(specifier)) return specifier;
    if (fileMap.has(`src/${specifier}`)) return `src/${specifier}`;

    const exts = ['.ts', '.tsx', '.js', '.jsx', '.json', '.py'];
    for (const ext of exts) {
      if (fileMap.has(specifier + ext)) return specifier + ext;
      if (fileMap.has(`src/${specifier}${ext}`)) return `src/${specifier}${ext}`;
    }

    // Python module match e.g. "utils.helpers" -> "utils/helpers.py"
    const pyPath = specifier.replace(/\./g, '/') + '.py';
    if (fileMap.has(pyPath)) return pyPath;
  }

  return null;
}

/**
 * Generate full Codebase Architecture & Dependency Graph
 */
async function generateDiagram(repoPath, flatFiles, options = {}) {
  const maxNodes = options.maxNodes || 500;
  const fileMap = new Map();
  for (const f of flatFiles) {
    fileMap.set(f.relativePath, f);
  }

  const nodes = [];
  const links = [];
  const clusters = new Map(); // directory path -> cluster details
  const linkPairs = new Set();

  // Create nodes for files
  for (const f of flatFiles) {
    if (nodes.length >= maxNodes) break;

    const dir = path.dirname(f.relativePath).replace(/\\/g, '/');
    if (dir !== '.' && dir.split('/').some(seg => seg.startsWith('.'))) {
      continue;
    }
    const clusterId = dir === '.' ? 'root' : dir;

    if (!clusters.has(clusterId)) {
      clusters.set(clusterId, {
        id: clusterId,
        label: clusterId === 'root' ? '/' : clusterId,
        depth: clusterId === 'root' ? 0 : clusterId.split('/').length,
        fileCount: 0
      });
    }
    clusters.get(clusterId).fileCount++;

    const role = classifyFileRole(f.relativePath);

    nodes.push({
      id: f.relativePath,
      name: f.name,
      path: f.path,
      relativePath: f.relativePath,
      extension: f.extension,
      language: f.language,
      size: f.size,
      lines: f.lines || 0,
      cluster: clusterId,
      role,
      inDegree: 0,
      outDegree: 0,
      isBinary: f.isBinary
    });
  }

  // Parse imports and build dependency edges for text files
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  for (const node of nodes) {
    if (node.isBinary || node.size > 1024 * 1024) continue;

    try {
      const content = await fs.promises.readFile(node.path, 'utf8');
      const specifiers = extractImportSpecifiers(content, node.extension);

      for (const spec of specifiers) {
        const targetRel = resolveImportToFile(node.relativePath, spec, fileMap);
        if (targetRel && targetRel !== node.id && nodeMap.has(targetRel)) {
          const pairKey = `${node.id}->${targetRel}`;
          if (!linkPairs.has(pairKey)) {
            linkPairs.add(pairKey);
            links.push({
              source: node.id,
              target: targetRel,
              type: 'import'
            });
            node.outDegree++;
            nodeMap.get(targetRel).inDegree++;
          }
        }
      }
    } catch (e) {
      // Skip file read error
    }
  }

  // Generate directory containment edges
  const clusterList = Array.from(clusters.values()).sort((a, b) => a.depth - b.depth);

  return {
    nodes,
    links,
    clusters: clusterList,
    stats: {
      totalNodes: nodes.length,
      totalLinks: links.length,
      totalClusters: clusterList.length
    }
  };
}

/**
 * Generate Mermaid syntax representation of the diagram
 */
function toMermaid(diagramData, mode = 'architecture') {
  const { nodes, links, clusters } = diagramData;
  const lines = ['graph TD'];

  // Subgraphs for clusters
  const clusterNodeMap = new Map();
  for (const n of nodes) {
    const list = clusterNodeMap.get(n.cluster) || [];
    list.push(n);
    clusterNodeMap.set(n.cluster, list);
  }

  let counter = 0;
  const sanitizeId = (id) => 'n_' + id.replace(/[^a-zA-Z0-9_]/g, '_');

  for (const [clusterId, clusterNodes] of clusterNodeMap.entries()) {
    const subId = 'cluster_' + clusterId.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`  subgraph ${subId} ["${clusterId}"]`);
    for (const node of clusterNodes) {
      const sId = sanitizeId(node.id);
      const icon = node.role === 'entry' ? '⚡' : node.role === 'component' ? '🧩' : node.role === 'service' ? '⚙️' : '📄';
      lines.push(`    ${sId}["${icon} ${node.name}"]`);
    }
    lines.push('  end');
  }

  // Count incoming dependencies per target
  const targetInCounts = new Map();
  for (const link of links) {
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    targetInCounts.set(tgtId, (targetInCounts.get(tgtId) || 0) + 1);
  }

  // Dependency links: thicker arrows (==>) for targets with higher incoming volume
  for (const link of links) {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    const inCount = targetInCounts.get(tgtId) || 1;
    const arrow = inCount >= 3 ? '==>' : '-->';
    lines.push(`  ${sanitizeId(srcId)} ${arrow} ${sanitizeId(tgtId)}`);
  }

  return lines.join('\n');
}

/**
 * Generate in-depth Symbol & Call Graph (Classes, Functions, Methods, Variables, Interfaces)
 */
async function generateSymbolGraph(repoPath, targetFile = null, flatFiles = []) {
  const nodes = [];
  const links = [];
  const symbolMap = new Map();

  let filesToProcess = [];
  if (targetFile) {
    const full = path.isAbsolute(targetFile) ? targetFile : path.join(repoPath, targetFile);
    filesToProcess = [{
      path: full,
      relativePath: path.relative(repoPath, full).replace(/\\/g, '/')
    }];
  } else {
    // Process top 30 code files
    filesToProcess = flatFiles
      .filter(f => !f.isBinary && ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.cpp', '.c', '.cs'].includes(f.extension))
      .slice(0, 30);
  }

  for (const file of filesToProcess) {
    try {
      const content = await fs.promises.readFile(file.path, 'utf8');
      const ext = path.extname(file.path);
      const symbols = symbolService.extractSymbolsFromContent(content, ext, file.path);
      const calls = symbolService.extractSymbolCalls(content, symbols);

      for (const sym of symbols) {
        const id = `${file.relativePath}::${sym.name}`;
        const nodeObj = {
          id,
          name: sym.name,
          shortName: sym.shortName || sym.name,
          kind: sym.kind, // 'class' | 'function' | 'method' | 'variable' | 'constant' | 'interface'
          line: sym.line,
          params: sym.params || '',
          superClass: sym.superClass || null,
          filePath: file.path,
          relativePath: file.relativePath,
          parentSymbol: sym.parentSymbol || null,
          exported: !!sym.exported
        };
        nodes.push(nodeObj);
        symbolMap.set(id, nodeObj);
      }

      // Symbol calls within the file
      for (const call of calls) {
        const srcId = `${file.relativePath}::${call.source}`;
        const tgtId = `${file.relativePath}::${call.target}`;
        links.push({
          source: srcId,
          target: tgtId,
          type: 'calls',
          line: call.line
        });
      }

      // Hierarchy containment: class contains method
      for (const sym of symbols) {
        if (sym.parentSymbol) {
          const parentId = `${file.relativePath}::${sym.parentSymbol}`;
          const childId = `${file.relativePath}::${sym.name}`;
          links.push({
            source: parentId,
            target: childId,
            type: 'contains'
          });
        }
        if (sym.superClass) {
          const superId = `${file.relativePath}::${sym.superClass}`;
          links.push({
            source: `${file.relativePath}::${sym.name}`,
            target: superId,
            type: 'inherits'
          });
        }
      }
    } catch (e) {
      // skip read error
    }
  }

  return {
    nodes,
    links,
    stats: {
      totalSymbols: nodes.length,
      classes: nodes.filter(n => n.kind === 'class').length,
      functions: nodes.filter(n => n.kind === 'function' || n.kind === 'method').length,
      variables: nodes.filter(n => n.kind === 'variable' || n.kind === 'constant').length,
      interfaces: nodes.filter(n => n.kind === 'interface').length,
      calls: links.filter(l => l.type === 'calls').length
    }
  };
}

module.exports = {
  generateDiagram,
  generateSymbolGraph,
  classifyFileRole,
  extractImportSpecifiers,
  resolveImportToFile,
  toMermaid
};
