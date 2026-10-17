const fs = require('fs');
const path = require('path');

/**
 * Symbol types:
 * - 'class'
 * - 'function'
 * - 'method'
 * - 'interface'
 * - 'variable'
 * - 'constant'
 */

/**
 * Extract defined symbols from source code content
 */
function extractSymbolsFromContent(content, extension, filePath = '') {
  if (!content || typeof content !== 'string') return [];
  const lines = content.split(/\r?\n/);
  const symbols = [];
  const ext = extension.toLowerCase();

  // JavaScript / TypeScript
  if (['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.vue', '.svelte'].includes(ext)) {
    let currentClass = null;
    let classBraceDepth = 0;
    let currentBraceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue;
      }

      // Count open/close braces to know when class definition ends
      const opens = (line.match(/{/g) || []).length;
      const closes = (line.match(/}/g) || []).length;

      // Class definition: class Foo [extends Bar]
      const classMatch = trimmed.match(/^(?:export\s+(?:default\s+)?)?class\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+([a-zA-Z0-9_$.]+))?/);
      if (classMatch) {
        currentClass = classMatch[1];
        classBraceDepth = currentBraceDepth + (line.includes('{') ? 1 : 0);
        currentBraceDepth += opens - closes;
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          line: lineNum,
          superClass: classMatch[2] || null,
          exported: trimmed.startsWith('export'),
          filePath
        });
        continue;
      }

      // Interface / Type (TypeScript)
      const ifaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+([a-zA-Z0-9_$.]+))?/);
      if (ifaceMatch) {
        symbols.push({
          name: ifaceMatch[1],
          kind: 'interface',
          line: lineNum,
          superClass: ifaceMatch[2] || null,
          exported: trimmed.startsWith('export'),
          filePath
        });
        currentBraceDepth += opens - closes;
        continue;
      }

      const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([a-zA-Z0-9_$]+)\s*=/);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: 'interface',
          line: lineNum,
          exported: trimmed.startsWith('export'),
          filePath
        });
        currentBraceDepth += opens - closes;
        continue;
      }

      // Check if we exited current class
      if (currentClass && currentBraceDepth <= classBraceDepth && closes > 0) {
        currentClass = null;
      }

      // Class Method: constructor(...) or [async] [static] [get|set] methodName(...)
      if (currentClass) {
        if (!trimmed.endsWith(';') && !trimmed.endsWith(',')) {
          const methodMatch = trimmed.match(/^(?:(?:public|private|protected|static|async|get|set)\s+)*([a-zA-Z0-9_$]+)\s*\(([^)]*)\)(?:\s*:\s*[^{]+)?(?:\s*\{|\s*$)/);
          const reserved = ['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'super', 'import', 'require', 'new', 'await', 'throw'];
          if (methodMatch && !reserved.includes(methodMatch[1])) {
            const mName = methodMatch[1];
            symbols.push({
              name: `${currentClass}.${mName}`,
              shortName: mName,
              kind: 'method',
              line: lineNum,
              params: methodMatch[2].trim(),
              parentSymbol: currentClass,
              filePath
            });
            currentBraceDepth += opens - closes;
            continue;
          }
        }
      }

      // Standard Function: [export] [async] function foo(...)
      const fnMatch = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:async\s+)?function(?:\s*\*|\s+)?([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);
      if (fnMatch) {
        symbols.push({
          name: fnMatch[1],
          kind: 'function',
          line: lineNum,
          params: fnMatch[2].trim(),
          exported: trimmed.startsWith('export'),
          parentSymbol: currentClass,
          filePath
        });
        currentBraceDepth += opens - closes;
        continue;
      }

      // Arrow / Expression Function: const foo = (...) => ... or const foo = function(...)
      const arrowFnMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|[a-zA-Z0-9_$]+)\s*=>/);
      if (arrowFnMatch) {
        symbols.push({
          name: arrowFnMatch[1],
          kind: 'function',
          line: lineNum,
          params: arrowFnMatch[2] ? arrowFnMatch[2].trim() : '',
          exported: trimmed.startsWith('export'),
          filePath
        });
        currentBraceDepth += opens - closes;
        continue;
      }

      const fnExprMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?function\s*\(([^)]*)\)/);
      if (fnExprMatch) {
        symbols.push({
          name: fnExprMatch[1],
          kind: 'function',
          line: lineNum,
          params: fnExprMatch[2].trim(),
          exported: trimmed.startsWith('export'),
          filePath
        });
        currentBraceDepth += opens - closes;
        continue;
      }

      // Variable / Constant: const FOO = ... or let bar = ...
      const constMatch = trimmed.match(/^(?:export\s+)?const\s+([A-Z0-9_$]+)\s*=/);
      if (constMatch) {
        symbols.push({
          name: constMatch[1],
          kind: 'constant',
          line: lineNum,
          exported: trimmed.startsWith('export'),
          filePath
        });
        currentBraceDepth += opens - closes;
        continue;
      }

      const varMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=/);
      if (varMatch && !symbols.some(s => s.line === lineNum)) {
        symbols.push({
          name: varMatch[1],
          kind: 'variable',
          line: lineNum,
          exported: trimmed.startsWith('export'),
          filePath
        });
      }

      currentBraceDepth += opens - closes;
    }
  }

  // Python
  if (['.py', '.pyw'].includes(ext)) {
    let currentClass = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) continue;

      // Check if indentation dropped back to top-level
      const isIndented = line.startsWith('    ') || line.startsWith('\t') || line.startsWith('  ');
      if (currentClass && !isIndented && !trimmed.startsWith('class')) {
        currentClass = null;
      }

      // Class: class Foo(Bar):
      const pyClass = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(?:\(([^)]*)\))?:/);
      if (pyClass) {
        currentClass = pyClass[1];
        symbols.push({
          name: pyClass[1],
          kind: 'class',
          line: lineNum,
          superClass: pyClass[2] ? pyClass[2].trim() : null,
          filePath
        });
        continue;
      }

      // Def: [async] def foo(a, b):
      const pyDef = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (pyDef) {
        const isMethod = isIndented && !!currentClass;
        const fnName = isMethod ? `${currentClass}.${pyDef[1]}` : pyDef[1];
        symbols.push({
          name: fnName,
          shortName: pyDef[1],
          kind: isMethod ? 'method' : 'function',
          line: lineNum,
          params: pyDef[2].trim(),
          parentSymbol: isMethod ? currentClass : null,
          filePath
        });
        continue;
      }

      // Top-level Constant / Variable: FOO = 123 or foo = 123
      if (!isIndented) {
        const pyConst = trimmed.match(/^([A-Z0-9_]+)\s*=/);
        if (pyConst) {
          symbols.push({
            name: pyConst[1],
            kind: 'constant',
            line: lineNum,
            filePath
          });
          continue;
        }

        const pyVar = trimmed.match(/^([a-z_][a-zA-Z0-9_]*)\s*=/);
        if (pyVar && !['if', 'for', 'while', 'with', 'try', 'except', 'return'].includes(pyVar[1])) {
          symbols.push({
            name: pyVar[1],
            kind: 'variable',
            line: lineNum,
            filePath
          });
        }
      }
    }
  }

  // Go
  if (['.go'].includes(ext)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // func (r *Receiver) Method(...) or func Function(...)
      const goMethod = trimmed.match(/^func\s+\((?:[a-zA-Z0-9_*]+\s+)?\*?([a-zA-Z0-9_]+)\)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (goMethod) {
        symbols.push({
          name: `${goMethod[1]}.${goMethod[2]}`,
          shortName: goMethod[2],
          kind: 'method',
          line: lineNum,
          parentSymbol: goMethod[1],
          params: goMethod[3].trim(),
          filePath
        });
        continue;
      }

      const goFunc = trimmed.match(/^func\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (goFunc) {
        symbols.push({
          name: goFunc[1],
          kind: 'function',
          line: lineNum,
          params: goFunc[2].trim(),
          filePath
        });
        continue;
      }

      // type Struct / Interface
      const goType = trimmed.match(/^type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/);
      if (goType) {
        symbols.push({
          name: goType[1],
          kind: goType[2] === 'struct' ? 'class' : 'interface',
          line: lineNum,
          filePath
        });
        continue;
      }

      // const / var
      const goConst = trimmed.match(/^(?:const|var)\s+([a-zA-Z0-9_]+)\s*=/);
      if (goConst) {
        symbols.push({
          name: goConst[1],
          kind: 'variable',
          line: lineNum,
          filePath
        });
      }
    }
  }

  // Rust
  if (['.rs'].includes(ext)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // struct / enum
      const rustType = trimmed.match(/^(?:pub\s+)?(?:struct|enum)\s+([a-zA-Z0-9_]+)/);
      if (rustType) {
        symbols.push({
          name: rustType[1],
          kind: 'class',
          line: lineNum,
          filePath
        });
        continue;
      }

      // fn
      const rustFn = trimmed.match(/^(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (rustFn) {
        symbols.push({
          name: rustFn[1],
          kind: 'function',
          line: lineNum,
          params: rustFn[2].trim(),
          filePath
        });
      }
    }
  }

  return symbols;
}

/**
 * Extract symbol calls and usages within file content
 */
function extractSymbolCalls(content, symbols) {
  if (!content || !symbols || symbols.length === 0) return [];
  const symbolMap = new Map();
  for (const s of symbols) {
    const raw = s.shortName || s.name;
    symbolMap.set(raw, s);
  }

  const calls = [];
  const lines = content.split(/\r?\n/);

  let currentCaller = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check if entering a function/method definition
    const def = symbols.find(s => s.line === lineNum && (s.kind === 'function' || s.kind === 'method'));
    if (def) {
      currentCaller = def;
      continue;
    }

    if (currentCaller) {
      // Find identifiers called as foo(...) or Foo.bar(...)
      for (const [name, targetSymbol] of symbolMap.entries()) {
        if (targetSymbol.name !== currentCaller.name) {
          const callRegex = new RegExp(`\\b${name}\\s*\\(`, 'g');
          if (callRegex.test(line)) {
            calls.push({
              source: currentCaller.name,
              target: targetSymbol.name,
              type: 'calls',
              line: lineNum
            });
          }
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  return calls.filter(c => {
    const k = `${c.source}->${c.target}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Extract symbols from a file on disk
 */
async function extractFileSymbols(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const ext = path.extname(filePath);
    const symbols = extractSymbolsFromContent(content, ext, filePath);
    const calls = extractSymbolCalls(content, symbols);
    return {
      filePath,
      symbols,
      calls
    };
  } catch (err) {
    return { filePath, symbols: [], calls: [] };
  }
}

module.exports = {
  extractSymbolsFromContent,
  extractSymbolCalls,
  extractFileSymbols
};
