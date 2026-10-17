/**
 * GitDiagram 1s - File Explorer Controller
 * Recursive folder tree navigation, search filtering, and git badges
 */

class FileExplorer {
  constructor() {
    this.container = document.getElementById('file-tree-container');
    this.filterInput = document.getElementById('file-filter-input');
    this.collapseBtn = document.getElementById('btn-sidebar-collapse');
    this.refreshBtn = document.getElementById('btn-sidebar-refresh');

    this.treeData = null;
    this.gitStatus = null;
    this.activeFilePath = null;
    this.expandedFolders = new Set();

    this.bindEvents();
  }

  bindEvents() {
    if (this.filterInput) {
      this.filterInput.oninput = (e) => {
        const query = e.target.value.trim().toLowerCase();
        this.filterTree(query);
      };
    }

    if (this.collapseBtn) {
      this.collapseBtn.onclick = () => {
        this.expandedFolders.clear();
        this.render();
      };
    }
  }

  setData(treeData, gitStatus = null) {
    this.treeData = treeData;
    this.gitStatus = gitStatus;
    // Auto-expand root folder
    if (treeData && treeData.relativePath === '') {
      this.expandedFolders.add('');
    }
    this.render();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (!this.treeData) {
      this.container.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px;">No folder opened</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    this.buildTreeNode(this.treeData, fragment, 0);
    this.container.appendChild(fragment);
  }

  buildTreeNode(node, parentElement, depth = 0) {
    if (!node) return;

    if (node.type === 'directory') {
      const isExpanded = this.expandedFolders.has(node.relativePath);

      const folderRow = document.createElement('div');
      folderRow.className = 'tree-node';
      folderRow.style.paddingLeft = `${depth * 14 + 8}px`;

      // Arrow icon
      const arrow = document.createElement('span');
      arrow.className = `tree-node-arrow ${isExpanded ? 'expanded' : ''}`;
      arrow.innerHTML = '▶';

      // VS Code Folder icon
      const icon = document.createElement('span');
      icon.className = 'tree-node-icon';
      icon.innerHTML = typeof window.getVsCodeIcon === 'function' 
        ? window.getVsCodeIcon(node.name, null, true, isExpanded)
        : (isExpanded ? '📂' : '📁');

      // Name
      const name = document.createElement('span');
      name.className = 'tree-node-name';
      name.textContent = node.name;

      folderRow.appendChild(arrow);
      folderRow.appendChild(icon);
      folderRow.appendChild(name);

      folderRow.onclick = (e) => {
        e.stopPropagation();
        if (this.expandedFolders.has(node.relativePath)) {
          this.expandedFolders.delete(node.relativePath);
        } else {
          this.expandedFolders.add(node.relativePath);
        }
        this.render();
      };

      parentElement.appendChild(folderRow);

      if (isExpanded && node.children && node.children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        for (const child of node.children) {
          this.buildTreeNode(child, childrenContainer, depth + 1);
        }
        parentElement.appendChild(childrenContainer);
      }
    } else {
      // File node
      const fileRow = document.createElement('div');
      fileRow.className = `tree-node ${this.activeFilePath === node.path ? 'active' : ''}`;
      fileRow.style.paddingLeft = `${depth * 14 + 18}px`;
      fileRow.dataset.path = node.path;
      fileRow.dataset.rel = node.relativePath;

      // VS Code File icon
      const icon = document.createElement('span');
      icon.className = 'tree-node-icon';
      icon.innerHTML = typeof window.getVsCodeIcon === 'function'
        ? window.getVsCodeIcon(node.name, node.extension, false, false)
        : this.getFileIcon(node.extension);

      // Name
      const name = document.createElement('span');
      name.className = 'tree-node-name';
      name.textContent = node.name;

      fileRow.appendChild(icon);
      fileRow.appendChild(name);

      // Check git status
      const gitItem = this.getGitStatusForFile(node.relativePath);
      if (gitItem) {
        const gitBadge = document.createElement('span');
        const code = gitItem.statusType === 'untracked' ? 'U' : gitItem.statusType === 'deleted' ? 'D' : 'M';
        gitBadge.className = `git-status-indicator git-status-${code}`;
        gitBadge.textContent = code;
        gitBadge.title = `Git: ${gitItem.statusType}`;
        fileRow.appendChild(gitBadge);
      } else if (node.lines) {
        const badge = document.createElement('span');
        badge.className = 'tree-node-badge';
        badge.textContent = `${node.lines}L`;
        fileRow.appendChild(badge);
      }

      fileRow.onclick = (e) => {
        e.stopPropagation();
        this.activeFilePath = node.path;
        document.querySelectorAll('.tree-node').forEach(el => el.classList.remove('active'));
        fileRow.classList.add('active');

        // Open in Monaco Editor
        window.monacoController.openFile(node.path, node.relativePath);

        // Highlight in Diagram
        if (window.diagramRenderer) {
          window.diagramRenderer.selectNodeByPath(node.relativePath);
        }
      };

      parentElement.appendChild(fileRow);
    }
  }

  getGitStatusForFile(relativePath) {
    if (!this.gitStatus || !this.gitStatus.files) return null;
    return this.gitStatus.files.find(f => f.path === relativePath);
  }

  highlightFile(relativePath) {
    document.querySelectorAll('.tree-node').forEach(el => {
      if (el.dataset.rel === relativePath) {
        el.classList.add('active');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        el.classList.remove('active');
      }
    });
  }

  filterTree(query) {
    if (!query) {
      document.querySelectorAll('.tree-node').forEach(el => el.style.display = 'flex');
      return;
    }

    document.querySelectorAll('.tree-node').forEach(el => {
      const name = el.querySelector('.tree-node-name');
      if (name) {
        const match = name.textContent.toLowerCase().includes(query);
        el.style.display = match ? 'flex' : 'none';
      }
    });
  }

  getFileIcon(ext, name = '') {
    if (typeof window.getVsCodeIcon === 'function') {
      return window.getVsCodeIcon(name, ext, false, false);
    }
    const e = (ext || '').toLowerCase();
    if (['.ts', '.tsx'].includes(e)) return '<span style="color: #3178c6; font-weight: bold; font-size: 11px;">TS</span>';
    if (['.js', '.jsx', '.mjs'].includes(e)) return '<span style="color: #f7df1e; font-weight: bold; font-size: 11px;">JS</span>';
    if (['.py'].includes(e)) return '<span style="color: #3776ab; font-weight: bold; font-size: 11px;">PY</span>';
    if (['.json'].includes(e)) return '<span style="color: #cbcb41; font-weight: bold; font-size: 11px;">{}</span>';
    if (['.css', '.scss', '.less'].includes(e)) return '<span style="color: #264de4; font-weight: bold; font-size: 11px;">#</span>';
    if (['.md', '.markdown'].includes(e)) return '<span style="color: #58a6ff; font-weight: bold; font-size: 11px;">MD</span>';
    if (['.go'].includes(e)) return '<span style="color: #00add8; font-weight: bold; font-size: 11px;">GO</span>';
    if (['.rs'].includes(e)) return '<span style="color: #dea584; font-weight: bold; font-size: 11px;">RS</span>';
    return '<span style="color: #8b949e; font-size: 11px;">📄</span>';
  }
}

window.fileExplorer = new FileExplorer();
