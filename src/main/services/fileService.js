const fs = require('fs');
const path = require('path');

// Default folders and files to ignore during repo scanning
const DEFAULT_IGNORES = new Set([
  '.git',
  'node_modules',
  '.vscode',
  '.idea',
  'dist',
  'build',
  'out',
  'target',
  'bin',
  'obj',
  '.next',
  '.nuxt',
  'coverage',
  '.cache',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.DS_Store',
  'Thumbs.db',
  '.pytest_cache',
  '.turbo'
]);

// Map file extensions to Monaco Editor languages
const EXTENSION_MAP = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescript',
  '.json': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'less',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.py': 'python',
  '.pyw': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cs': 'csharp',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.php': 'php',
  '.rb': 'ruby',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.ps1': 'powershell',
  '.bat': 'bat',
  '.cmd': 'bat',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.svg': 'xml',
  '.sql': 'sql',
  '.dockerfile': 'dockerfile',
  'dockerfile': 'dockerfile',
  '.env': 'ini',
  '.ini': 'ini',
  '.toml': 'ini',
  '.lua': 'lua',
  '.swift': 'swift',
  '.r': 'r',
  '.dart': 'dart'
};

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.tiff',
  '.mp4', '.webm', '.ogg', '.mov', '.avi', '.mp3', '.wav', '.flac',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.woff', '.woff2', '.ttf', '.eot', '.otf'
]);

/**
 * Check if a file is binary by extension or null-byte sampling
 */
function isBinaryFile(filePath, buffer) {
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  if (!buffer) return false;
  // Check first 1024 bytes for null character
  const sampleLength = Math.min(buffer.length, 1024);
  for (let i = 0; i < sampleLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/**
 * Detect language identifier for Monaco
 */
function detectLanguage(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] || 'plaintext';
}

/**
 * Parse .gitignore if it exists in folder
 */
async function loadGitIgnore(rootPath) {
  const gitignorePath = path.join(rootPath, '.gitignore');
  const ignorePatterns = [];
  try {
    if (fs.existsSync(gitignorePath)) {
      const content = await fs.promises.readFile(gitignorePath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let line of lines) {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          ignorePatterns.push(line);
        }
      }
    }
  } catch (err) {
    // Ignore error reading .gitignore
  }
  return ignorePatterns;
}

/**
 * Check if a path should be ignored
 */
/**
 * Check if a path should be ignored
 * Excludes foldernames starting with '.' (e.g. .git, .tests, .vscode, .github, etc.)
 */
function shouldIgnore(name, relativePath = '', customPatterns = [], isDirectory = false) {
  // Exclude foldernames that start with '.'
  if (isDirectory && name.startsWith('.')) return true;

  // Exclude if any directory segment in relativePath starts with '.'
  if (relativePath) {
    const norm = relativePath.replace(/\\/g, '/');
    const parts = norm.split('/');
    const dirParts = isDirectory ? parts : parts.slice(0, -1);
    for (const part of dirParts) {
      if (part.startsWith('.')) return true;
    }
  }

  if (DEFAULT_IGNORES.has(name)) return true;
  for (const pattern of customPatterns) {
    const cleanPattern = pattern.replace(/^\/|\/$/g, '');
    if (name === cleanPattern) return true;
    if (relativePath === cleanPattern || relativePath.startsWith(cleanPattern + '/')) return true;
  }
  return false;
}

/**
 * Scan directory recursively and build tree & flat list
 */
async function scanDirectory(rootPath, options = {}) {
  const maxFiles = options.maxFiles || 20000;
  const customIgnores = await loadGitIgnore(rootPath);
  const flatFiles = [];
  let totalFiles = 0;
  let totalDirs = 0;
  let totalLines = 0;

  async function walk(currentPath, relativePath = '') {
    const name = path.basename(currentPath);
    if (relativePath && shouldIgnore(name, relativePath.replace(/\\/g, '/'), customIgnores)) {
      return null;
    }

    try {
      const stat = await fs.promises.stat(currentPath);

      if (stat.isDirectory()) {
        // Exclude any directory whose foldername starts with '.'
        if (relativePath && (name.startsWith('.') || shouldIgnore(name, relativePath.replace(/\\/g, '/'), customIgnores, true))) {
          return null;
        }

        totalDirs++;
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
        // Sort: directories first, then files alphabetically
        entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

        const children = [];
        for (const entry of entries) {
          if (totalFiles >= maxFiles) break;

          // Exclude any directory whose foldername starts with '.'
          if (entry.isDirectory() && entry.name.startsWith('.')) {
            continue;
          }

          const childPath = path.join(currentPath, entry.name);
          const childRel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          const childNode = await walk(childPath, childRel);
          if (childNode) {
            children.push(childNode);
          }
        }

        return {
          name: name || path.basename(rootPath),
          path: currentPath,
          relativePath: relativePath || '',
          type: 'directory',
          children
        };
      } else if (stat.isFile()) {
        totalFiles++;
        const ext = path.extname(name).toLowerCase();
        const language = detectLanguage(name);
        const isBin = BINARY_EXTENSIONS.has(ext);

        let lines = 0;
        // Count lines for text files under 2MB
        if (!isBin && stat.size < 2 * 1024 * 1024) {
          try {
            const buf = await fs.promises.readFile(currentPath);
            if (!isBinaryFile(currentPath, buf)) {
              let count = 0;
              for (let i = 0; i < buf.length; i++) {
                if (buf[i] === 10) count++;
              }
              lines = count + 1;
              totalLines += lines;
            }
          } catch (e) {
            lines = 0;
          }
        }

        const fileInfo = {
          name,
          path: currentPath,
          relativePath: relativePath.replace(/\\/g, '/'),
          type: 'file',
          size: stat.size,
          extension: ext,
          language,
          isBinary: isBin,
          lines,
          mtime: stat.mtimeMs
        };

        flatFiles.push(fileInfo);
        return fileInfo;
      }
    } catch (err) {
      return null;
    }
  }

  const rootName = path.basename(rootPath) || rootPath;
  const tree = await walk(rootPath, '');

  return {
    rootPath,
    rootName,
    tree: tree || { name: rootName, path: rootPath, relativePath: '', type: 'directory', children: [] },
    files: flatFiles,
    stats: {
      totalFiles,
      totalDirs,
      totalLines,
      truncated: totalFiles >= maxFiles
    }
  };
}

/**
 * Security: Validate path against traversal & null-byte injection
 */
function validatePath(targetPath) {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    throw new Error('Invalid path: path must be a non-empty string');
  }
  if (targetPath.indexOf('\0') !== -1) {
    throw new Error('Security violation: null-byte injection detected');
  }
  return path.normalize(targetPath);
}

/**
 * Read file contents (with security hardening)
 */
async function readFile(filePath) {
  const safePath = validatePath(filePath);
  try {
    const stat = await fs.promises.stat(safePath);
    if (stat.size > 50 * 1024 * 1024) {
      throw new Error('File exceeds maximum readable size (50MB)');
    }

    const buf = await fs.promises.readFile(safePath);
    const isBin = isBinaryFile(safePath, buf);
    const ext = path.extname(safePath).toLowerCase();
    const language = detectLanguage(safePath);

    if (isBin) {
      return {
        path: safePath,
        name: path.basename(safePath),
        extension: ext,
        size: stat.size,
        isBinary: true,
        content: null,
        language
      };
    }

    return {
      path: safePath,
      name: path.basename(safePath),
      extension: ext,
      size: stat.size,
      isBinary: false,
      content: buf.toString('utf8'),
      language
    };
  } catch (err) {
    throw new Error(`Failed to read file ${safePath}: ${err.message}`);
  }
}

/**
 * Save file contents (with security hardening)
 */
async function saveFile(filePath, content) {
  const safePath = validatePath(filePath);
  if (typeof content !== 'string') {
    throw new Error('Invalid content: content must be a string');
  }
  try {
    await fs.promises.writeFile(safePath, content, 'utf8');
    const stat = await fs.promises.stat(safePath);
    return {
      success: true,
      path: safePath,
      size: stat.size,
      mtime: stat.mtimeMs
    };
  } catch (err) {
    throw new Error(`Failed to save file ${safePath}: ${err.message}`);
  }
}

module.exports = {
  scanDirectory,
  readFile,
  saveFile,
  detectLanguage,
  isBinaryFile,
  shouldIgnore,
  DEFAULT_IGNORES,
  EXTENSION_MAP
};
