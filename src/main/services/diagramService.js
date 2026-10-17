const fs = require('fs');
const path = require('path');

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

  // Dependency links
  for (const link of links) {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    lines.push(`  ${sanitizeId(srcId)} --> ${sanitizeId(tgtId)}`);
  }

  return lines.join('\n');
}

module.exports = {
  generateDiagram,
  classifyFileRole,
  extractImportSpecifiers,
  resolveImportToFile,
  toMermaid
};
