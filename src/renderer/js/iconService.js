/**
 * GitDiagram 1s - VS Code Official Icon Service
 * Provides authentic, high-quality VS Code file & folder vector icons
 */

(function() {
  'use strict';

  // SVG Helper
  function svg(viewBox, content) {
    return `<svg width="15" height="15" viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0; vertical-align: middle;">${content}</svg>`;
  }

  // VS Code Folder Icons
  const FOLDER_CLOSED = svg("0 0 16 16", `
    <path d="M1.5 3C1.5 2.17 2.17 1.5 3 1.5H6.29C6.69 1.5 7.07 1.66 7.35 1.94L8.41 3H13C13.83 3 14.5 3.67 14.5 4.5V12C14.5 12.83 13.83 13.5 13 13.5H3C2.17 13.5 1.5 12.83 1.5 12V3Z" fill="#dcb67a" fill-opacity="0.9"/>
  `);

  const FOLDER_OPEN = svg("0 0 16 16", `
    <path d="M1.5 3C1.5 2.17 2.17 1.5 3 1.5H6.29C6.69 1.5 7.07 1.66 7.35 1.94L8.41 3H13C13.83 3 14.5 3.67 14.5 4.5V6H2.7L1.5 12.5V3Z" fill="#dcb67a" fill-opacity="0.75"/>
    <path d="M2.5 7H15L13.2 13.5H1L2.5 7Z" fill="#e8b839"/>
  `);

  const FOLDER_SRC = svg("0 0 16 16", `
    <path d="M1.5 3C1.5 2.17 2.17 1.5 3 1.5H6.29C6.69 1.5 7.07 1.66 7.35 1.94L8.41 3H13C13.83 3 14.5 3.67 14.5 4.5V12C14.5 12.83 13.83 13.5 13 13.5H3C2.17 13.5 1.5 12.83 1.5 12V3Z" fill="#388bfd" fill-opacity="0.85"/>
    <path d="M5.5 8L4 9.5L5.5 11M10.5 8L12 9.5L10.5 11" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>
  `);

  const FOLDER_TEST = svg("0 0 16 16", `
    <path d="M1.5 3C1.5 2.17 2.17 1.5 3 1.5H6.29C6.69 1.5 7.07 1.66 7.35 1.94L8.41 3H13C13.83 3 14.5 3.67 14.5 4.5V12C14.5 12.83 13.83 13.5 13 13.5H3C2.17 13.5 1.5 12.83 1.5 12V3Z" fill="#2ea043" fill-opacity="0.85"/>
    <path d="M6 7V10L8 12L10 10V7H6Z" fill="#ffffff" fill-opacity="0.9"/>
  `);

  const FOLDER_NODE = svg("0 0 16 16", `
    <path d="M1.5 3C1.5 2.17 2.17 1.5 3 1.5H6.29C6.69 1.5 7.07 1.66 7.35 1.94L8.41 3H13C13.83 3 14.5 3.67 14.5 4.5V12C14.5 12.83 13.83 13.5 13 13.5H3C2.17 13.5 1.5 12.83 1.5 12V3Z" fill="#339933" fill-opacity="0.85"/>
  `);

  const FOLDER_GIT = svg("0 0 16 16", `
    <path d="M1.5 3C1.5 2.17 2.17 1.5 3 1.5H6.29C6.69 1.5 7.07 1.66 7.35 1.94L8.41 3H13C13.83 3 14.5 3.67 14.5 4.5V12C14.5 12.83 13.83 13.5 13 13.5H3C2.17 13.5 1.5 12.83 1.5 12V3Z" fill="#f05032" fill-opacity="0.85"/>
  `);

  // VS Code Popular File Icons
  const ICONS = {
    // JavaScript
    js: svg("0 0 16 16", `
      <rect width="16" height="16" rx="2" fill="#f7df1e"/>
      <path d="M4.5 11.5C5 12.3 6 12.5 6.8 12C7.3 11.6 7.6 11 7.6 9.8V4.5H5.8V9.8C5.8 10.3 5.5 10.6 5.1 10.5C4.7 10.4 4.5 10 4.5 9.7L3 10.5C3.2 11 3.7 11.5 4.5 11.5Z" fill="#000000"/>
      <path d="M9 11.2C9.5 12.1 10.5 12.5 11.6 12.2C12.5 12 13 11.2 13 10.4C13 9.4 12.4 9 11.2 8.5C10.5 8.2 10.2 8 10.2 7.5C10.2 7.1 10.5 6.7 11.1 6.7C11.6 6.7 12 7 12.2 7.5L13.5 6.7C13 5.8 12.2 5.5 11.1 5.5C10 5.5 9 6.2 9 7.4C9 8.3 9.5 8.9 10.6 9.3C11.4 9.6 11.8 9.9 11.8 10.4C11.8 10.9 11.3 11.2 10.7 11.2C10.1 11.2 9.6 10.8 9.4 10.3L8 11.2H9Z" fill="#000000"/>
    `),

    // TypeScript
    ts: svg("0 0 16 16", `
      <rect width="16" height="16" rx="2" fill="#3178c6"/>
      <path d="M3.5 5.5H8.5V7H6.7V12.5H5.3V7H3.5V5.5Z" fill="#ffffff"/>
      <path d="M9 11.2C9.5 12.1 10.5 12.5 11.6 12.2C12.5 12 13 11.2 13 10.4C13 9.4 12.4 9 11.2 8.5C10.5 8.2 10.2 8 10.2 7.5C10.2 7.1 10.5 6.7 11.1 6.7C11.6 6.7 12 7 12.2 7.5L13.5 6.7C13 5.8 12.2 5.5 11.1 5.5C10 5.5 9 6.2 9 7.4C9 8.3 9.5 8.9 10.6 9.3C11.4 9.6 11.8 9.9 11.8 10.4C11.8 10.9 11.3 11.2 10.7 11.2C10.1 11.2 9.6 10.8 9.4 10.3L8 11.2H9Z" fill="#ffffff"/>
    `),

    // React (JSX / TSX)
    react: svg("0 0 16 16", `
      <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke="#61dafb" stroke-width="1.2" transform="rotate(30 8 8)"/>
      <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke="#61dafb" stroke-width="1.2" transform="rotate(90 8 8)"/>
      <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke="#61dafb" stroke-width="1.2" transform="rotate(150 8 8)"/>
      <circle cx="8" cy="8" r="1.2" fill="#61dafb"/>
    `),

    // Python
    python: svg("0 0 16 16", `
      <path d="M7.8 1.5C4.5 1.5 4.6 2.9 4.6 2.9L4.6 4.4H8V4.8H3.1C1.7 4.8 1.5 6.1 1.5 7.4C1.5 8.7 2.3 9.2 3.3 9.2H4.4V7.8C4.4 6.2 5.8 6.2 5.8 6.2H8.8C9.9 6.2 10.4 5.3 10.4 4.4C10.4 3.5 10.4 2.6 10.4 2.6C10.4 2.6 10.3 1.5 7.8 1.5ZM6.5 2.5C6.8 2.5 7.1 2.8 7.1 3.1C7.1 3.4 6.8 3.7 6.5 3.7C6.2 3.7 5.9 3.4 5.9 3.1C5.9 2.8 6.2 2.5 6.5 2.5Z" fill="#3776ab"/>
      <path d="M8.2 14.5C11.5 14.5 11.4 13.1 11.4 13.1L11.4 11.6H8V11.2H12.9C14.3 11.2 14.5 9.9 14.5 8.6C14.5 7.3 13.7 6.8 12.7 6.8H11.6V8.2C11.6 9.8 10.2 9.8 10.2 9.8H7.2C6.1 9.8 5.6 10.7 5.6 11.6C5.6 12.5 5.6 13.4 5.6 13.4C5.6 13.4 5.7 14.5 8.2 14.5ZM9.5 13.5C9.2 13.5 8.9 13.2 8.9 12.9C8.9 12.6 9.2 12.3 9.5 12.3C9.8 12.3 10.1 12.6 10.1 12.9C10.1 13.2 9.8 13.5 9.5 13.5Z" fill="#ffd43b"/>
    `),

    // JSON
    json: svg("0 0 16 16", `
      <text x="1" y="12.5" fill="#fbc02d" font-family="monospace" font-size="13" font-weight="900">{ }</text>
    `),

    // HTML
    html: svg("0 0 16 16", `
      <path d="M2.5 2L3.5 13.5L8 15L12.5 13.5L13.5 2H2.5Z" fill="#e44d26"/>
      <path d="M8 3.2V13.8L11.5 12.7L12.3 3.2H8Z" fill="#f16529"/>
      <path d="M8 5.6H5.2L5.4 7.6H8V9.6H5.6L5.8 11.8L8 12.4V10.6L7.2 10.4L7.1 9.6H8V5.6ZM8 5.6H10.8L10.6 7.6H8V9.6H10.4L10.2 11.8L8 12.4V10.6L8.8 10.4L8.9 9.6H8V5.6Z" fill="#ffffff"/>
    `),

    // CSS
    css: svg("0 0 16 16", `
      <path d="M2.5 2L3.5 13.5L8 15L12.5 13.5L13.5 2H2.5Z" fill="#264de4"/>
      <path d="M8 3.2V13.8L11.5 12.7L12.3 3.2H8Z" fill="#2965f1"/>
      <path d="M5.5 5.5H10.5M5.5 8H10.5M5.5 10.5H10.5" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>
    `),

    // SCSS / Sass
    sass: svg("0 0 16 16", `
      <rect width="16" height="16" rx="2" fill="#cf649a"/>
      <text x="2.5" y="12" fill="#ffffff" font-family="sans-serif" font-size="10" font-weight="bold">SCSS</text>
    `),

    // Markdown
    markdown: svg("0 0 16 16", `
      <rect x="1" y="2.5" width="14" height="11" rx="1.5" fill="#42a5f5"/>
      <path d="M3 10.5V5.5H4.5L6 7.5L7.5 5.5H9V10.5H7.7V7.8L6.4 9.4H5.6L4.3 7.8V10.5H3Z" fill="#ffffff"/>
      <path d="M12 5.5V9H13.2L11.5 11L9.8 9H11V5.5H12Z" fill="#ffffff"/>
    `),

    // Git / Gitignore
    git: svg("0 0 16 16", `
      <path d="M14.5 7.1L8.9 1.5C8.6 1.2 8.1 1.2 7.8 1.5L6.3 3L8 4.7C8.4 4.6 8.9 4.7 9.2 5C9.6 5.4 9.6 6 9.3 6.4L11.2 8.3C11.6 8 12.2 8 12.6 8.4C13 8.8 13 9.4 12.6 9.8C12.2 10.2 11.6 10.2 11.2 9.8C10.9 9.5 10.8 9 11 8.6L9.2 6.8C9.1 6.8 9 6.8 8.9 6.8V10.7C9.2 10.9 9.4 11.3 9.4 11.7C9.4 12.3 8.9 12.8 8.3 12.8C7.7 12.8 7.2 12.3 7.2 11.7C7.2 11.3 7.4 10.9 7.7 10.7V6.7C7.4 6.5 7.2 6.1 7.2 5.7C7.2 5.3 7.4 4.9 7.7 4.7L6 3L1.5 7.5C1.2 7.8 1.2 8.3 1.5 8.6L7.1 14.2C7.4 14.5 7.9 14.5 8.2 14.2L14.5 7.9C14.7 7.7 14.7 7.3 14.5 7.1Z" fill="#f05032"/>
    `),

    // Rust
    rust: svg("0 0 16 16", `
      <circle cx="8" cy="8" r="6" stroke="#dea584" stroke-width="1.8"/>
      <path d="M5.5 11V5H7.5C8.6 5 9.2 5.6 9.2 6.5C9.2 7.3 8.6 7.8 7.7 7.9L9.5 11H8.1L6.6 8.2H6.5V11H5.5Z" fill="#dea584"/>
    `),

    // Go
    go: svg("0 0 16 16", `
      <rect width="16" height="16" rx="2" fill="#00add8"/>
      <text x="3" y="11.5" fill="#ffffff" font-family="sans-serif" font-size="10" font-weight="900">GO</text>
    `),

    // C / C++
    cpp: svg("0 0 16 16", `
      <rect width="16" height="16" rx="2" fill="#00599c"/>
      <text x="2" y="11.5" fill="#ffffff" font-family="sans-serif" font-size="9" font-weight="bold">C++</text>
    `),

    c: svg("0 0 16 16", `
      <rect width="16" height="16" rx="2" fill="#a8b9cc"/>
      <text x="4.5" y="11.5" fill="#0d1117" font-family="sans-serif" font-size="10" font-weight="bold">C</text>
    `),

    // C#
    csharp: svg("0 0 16 16", `
      <rect width="16" height="16" rx="2" fill="#68217a"/>
      <text x="2.5" y="11.5" fill="#ffffff" font-family="sans-serif" font-size="9" font-weight="bold">C#</text>
    `),

    // Java
    java: svg("0 0 16 16", `
      <path d="M8 2C5.5 2 4.5 3.5 4.5 4.5C4.5 6 6 7 8 7C10 7 11.5 6 11.5 4.5C11.5 3.5 10.5 2 8 2Z" fill="#f89820"/>
      <path d="M4 8.5C4 11 5.8 13 8 13C10.2 13 12 11 12 8.5H4ZM12 9.5C13 9.5 13.5 10 13.5 10.5C13.5 11 13 11.5 12 11.5V9.5Z" fill="#5382a1"/>
    `),

    // Shell / Bash / Powershell
    shell: svg("0 0 16 16", `
      <rect width="16" height="16" rx="2" fill="#2d333b"/>
      <path d="M3.5 4.5L7 7.5L3.5 10.5M8 11.5H12.5" stroke="#3fb950" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    `),

    // SQL / Database
    sql: svg("0 0 16 16", `
      <ellipse cx="8" cy="4" rx="5.5" ry="2" fill="#336791"/>
      <path d="M2.5 4V8C2.5 9.1 5 10 8 10C11 10 13.5 9.1 13.5 8V4M2.5 8V12C2.5 13.1 5 14 8 14C11 14 13.5 13.1 13.5 12V8" stroke="#336791" stroke-width="1.3" fill="none"/>
    `),

    // YAML
    yaml: svg("0 0 16 16", `
      <rect width="16" height="16" rx="2" fill="#cb171e"/>
      <text x="3" y="11.5" fill="#ffffff" font-family="sans-serif" font-size="9" font-weight="bold">YML</text>
    `),

    // Image / Media
    image: svg("0 0 16 16", `
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="#a371f7" stroke-width="1.3"/>
      <circle cx="5.5" cy="6" r="1.2" fill="#a371f7"/>
      <path d="M2.5 11.5L6 8L9.5 11.5M8 10L10.5 7.5L13.5 10.5" stroke="#a371f7" stroke-width="1.2"/>
    `),

    // NPM / package.json
    npm: svg("0 0 16 16", `
      <rect width="16" height="16" rx="2" fill="#cb3837"/>
      <path d="M3 4.5H13V11.5H8V6.5H5.5V11.5H3V4.5Z" fill="#ffffff"/>
    `),

    // Docker
    docker: svg("0 0 16 16", `
      <path d="M14.5 8C14.5 8 13.5 7.5 12.5 8C12 6.5 10.5 6.5 10.5 6.5V5.5H8.5V4H6.5V5.5H5V7H2.5C1.5 7.5 1.5 9 1.5 9C1.5 12.5 5 13.5 8 13.5C12.5 13.5 14.5 10.5 14.5 8Z" fill="#2496ed"/>
    `),

    // Default File
    file: svg("0 0 16 16", `
      <path d="M3 2C2.45 2 2 2.45 2 3V13C2 13.55 2.45 14 3 14H13C13.55 14 14 13.55 14 13V6L10 2H3Z" fill="#21262d" stroke="#8b949e" stroke-width="1.1"/>
      <path d="M10 2V6H14" fill="#30363d"/>
    `)
  };

  /**
   * Main Icon Resolver
   */
  window.getVsCodeIcon = function(name = '', ext = '', isFolder = false, isOpen = false) {
    const filename = (name || '').toLowerCase();
    const extension = (ext || (name.includes('.') ? '.' + name.split('.').pop() : '')).toLowerCase();

    // 1. Folders
    if (isFolder) {
      if (filename === '.git') return FOLDER_GIT;
      if (filename === 'node_modules') return FOLDER_NODE;
      if (['src', 'source', 'app', 'lib'].includes(filename)) return FOLDER_SRC;
      if (['test', 'tests', '__tests__', 'spec', '.tests'].includes(filename)) return FOLDER_TEST;
      return isOpen ? FOLDER_OPEN : FOLDER_CLOSED;
    }

    // 2. Exact Filenames
    if (filename === 'package.json' || filename === 'package-lock.json') return ICONS.npm;
    if (filename === 'dockerfile' || filename.startsWith('docker-compose')) return ICONS.docker;
    if (filename === '.gitignore' || filename === '.gitattributes' || filename === '.gitmodules') return ICONS.git;
    if (filename === 'readme.md' || filename === 'license' || filename === 'license.md') return ICONS.markdown;

    // 3. File Extensions
    if (['.tsx', '.jsx'].includes(extension)) return ICONS.react;
    if (['.ts', '.mts', '.cts'].includes(extension)) return ICONS.ts;
    if (['.js', '.mjs', '.cjs'].includes(extension)) return ICONS.js;
    if (['.py', '.pyw', '.ipynb'].includes(extension)) return ICONS.python;
    if (['.json', '.json5', '.jsonc'].includes(extension)) return ICONS.json;
    if (['.html', '.htm'].includes(extension)) return ICONS.html;
    if (['.css'].includes(extension)) return ICONS.css;
    if (['.scss', '.sass'].includes(extension)) return ICONS.sass;
    if (['.md', '.markdown', '.mdown'].includes(extension)) return ICONS.markdown;
    if (['.rs'].includes(extension)) return ICONS.rust;
    if (['.go'].includes(extension)) return ICONS.go;
    if (['.cpp', '.cc', '.cxx', '.hpp'].includes(extension)) return ICONS.cpp;
    if (['.c', '.h'].includes(extension)) return ICONS.c;
    if (['.cs'].includes(extension)) return ICONS.csharp;
    if (['.java', '.class', '.jar'].includes(extension)) return ICONS.java;
    if (['.sh', '.bash', '.zsh', '.bat', '.cmd', '.ps1'].includes(extension)) return ICONS.shell;
    if (['.sql', '.db', '.sqlite'].includes(extension)) return ICONS.sql;
    if (['.yml', '.yaml'].includes(extension)) return ICONS.yaml;
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.bmp'].includes(extension)) return ICONS.image;

    return ICONS.file;
  };
})();
