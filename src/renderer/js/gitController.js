/**
 * GitDiagram 1s - Git Source Control, Diffs, and Branch Switcher Controller
 */

class GitController {
  constructor() {
    this.statusContainer = document.getElementById('git-status-container');
    this.commitsContainer = document.getElementById('git-commits-container');
    this.badgeEl = document.getElementById('git-changes-badge');
    this.branchBadge = document.getElementById('titlebar-branch-badge');
    this.branchText = document.getElementById('branch-name-text');
    this.sbBranchText = document.getElementById('sb-branch-text');
    this.sbGitChanges = document.getElementById('sb-git-changes');

    // Branch Modal
    this.branchModal = document.getElementById('branch-modal-overlay');
    this.branchSearchInput = document.getElementById('branch-search-input');
    this.branchList = document.getElementById('branch-modal-list');

    this.currentRepoPath = null;
    this.gitStatus = null;
    this.branches = [];
    this.commits = [];

    this.bindEvents();
  }

  bindEvents() {
    // Click branch badge -> Open branch modal
    if (this.branchBadge) {
      this.branchBadge.onclick = () => this.openBranchModal();
    }
    const sbBranch = document.getElementById('sb-branch');
    if (sbBranch) {
      sbBranch.onclick = () => this.openBranchModal();
    }

    // Close branch modal when clicking outside
    if (this.branchModal) {
      this.branchModal.onclick = (e) => {
        if (e.target === this.branchModal) {
          this.closeBranchModal();
        }
      };
    }

    if (this.branchSearchInput) {
      this.branchSearchInput.oninput = (e) => {
        const query = e.target.value.trim().toLowerCase();
        this.filterBranches(query);
      };
    }
  }

  async loadGitInfo(repoPath) {
    this.currentRepoPath = repoPath;
    const isRepo = await window.api.isGitRepo(repoPath);

    if (!isRepo) {
      if (this.branchBadge) this.branchBadge.style.display = 'none';
      if (this.sbBranchText) this.sbBranchText.textContent = 'No Git';
      if (this.sbGitChanges) this.sbGitChanges.textContent = 'Folder Mode';
      if (this.badgeEl) this.badgeEl.style.display = 'none';
      if (this.statusContainer) {
        this.statusContainer.innerHTML = '<div style="padding: 14px; color: var(--text-muted); font-size: 12px;">This folder is not a git repository.</div>';
      }
      return;
    }

    // 1. Git Status
    this.gitStatus = await window.api.getGitStatus(repoPath);
    this.renderStatus();

    // 2. Git Branches
    const branchInfo = await window.api.getGitBranches(repoPath);
    this.branches = branchInfo.branches || [];
    const activeBranch = branchInfo.current || this.gitStatus.branch || 'main';

    if (this.branchBadge) {
      this.branchBadge.style.display = 'inline-flex';
      this.branchText.textContent = activeBranch;
    }
    if (this.sbBranchText) {
      this.sbBranchText.textContent = activeBranch;
    }

    // 3. Git Commits Log
    const logInfo = await window.api.getGitLog(repoPath, 40);
    this.commits = logInfo.commits || [];
    this.renderCommits();

    return { gitStatus: this.gitStatus, logInfo };
  }

  renderStatus() {
    if (!this.statusContainer) return;
    this.statusContainer.innerHTML = '';

    const files = this.gitStatus.files || [];
    const totalChanges = files.length;

    // Update Badges
    if (this.badgeEl) {
      if (totalChanges > 0) {
        this.badgeEl.textContent = totalChanges;
        this.badgeEl.style.display = 'flex';
      } else {
        this.badgeEl.style.display = 'none';
      }
    }

    if (this.sbGitChanges) {
      this.sbGitChanges.textContent = `${totalChanges} change${totalChanges === 1 ? '' : 's'}`;
    }

    if (totalChanges === 0) {
      this.statusContainer.innerHTML = '<div style="padding: 14px; color: var(--text-muted); font-size: 12px;">Working tree clean. No uncommitted changes.</div>';
      return;
    }

    // Group files by status
    const staged = files.filter(f => f.isStaged);
    const unstaged = files.filter(f => !f.isStaged);

    if (staged.length > 0) {
      this.createSection('Staged Changes', staged, true);
    }
    if (unstaged.length > 0) {
      this.createSection('Changes', unstaged, false);
    }
  }

  createSection(title, fileList, isStaged) {
    const header = document.createElement('div');
    header.className = 'git-section-header';
    header.innerHTML = `<span>${title} (${fileList.length})</span>`;
    this.statusContainer.appendChild(header);

    for (const f of fileList) {
      const item = document.createElement('div');
      item.className = 'git-file-item';

      const code = f.statusType === 'untracked' ? 'U' : f.statusType === 'deleted' ? 'D' : f.statusType === 'added' ? 'A' : 'M';
      const badge = document.createElement('span');
      badge.className = `git-status-indicator git-status-${code}`;
      badge.textContent = code;

      const name = document.createElement('span');
      name.className = 'git-file-name';
      const parts = f.path.split('/');
      const fileName = parts.pop();
      const dirPath = parts.join('/');
      name.innerHTML = `${fileName} <span class="git-file-dir">${dirPath}</span>`;

      item.appendChild(badge);
      item.appendChild(name);

      // Click -> Open Monaco Diff Editor!
      item.onclick = async () => {
        try {
          const diffResult = await window.api.getGitDiff(this.currentRepoPath, f.path);
          window.monacoController.openDiff(
            f.path,
            diffResult.originalContent,
            diffResult.modifiedContent,
            `${f.path} (Working Tree vs HEAD)`
          );
        } catch (e) {
          console.error('Failed to open diff:', e);
        }
      };

      this.statusContainer.appendChild(item);
    }
  }

  renderCommits() {
    if (!this.commitsContainer) return;
    this.commitsContainer.innerHTML = '';

    if (!this.commits || this.commits.length === 0) {
      this.commitsContainer.innerHTML = '<div style="padding: 14px; color: var(--text-muted); font-size: 12px;">No commits found in history.</div>';
      return;
    }

    for (const c of this.commits) {
      const card = document.createElement('div');
      card.className = 'commit-item';

      const title = document.createElement('div');
      title.className = 'commit-title';
      title.textContent = c.message;

      const meta = document.createElement('div');
      meta.className = 'commit-meta';

      const hash = document.createElement('span');
      hash.className = 'commit-hash';
      hash.textContent = c.shortHash;

      const author = document.createElement('span');
      author.textContent = `${c.author} • ${c.date}`;

      meta.appendChild(hash);
      meta.appendChild(author);

      card.appendChild(title);
      card.appendChild(meta);

      card.onclick = () => {
        document.querySelectorAll('.commit-item').forEach(el => el.classList.remove('active'));
        card.classList.add('active');
        this.showCommitDetails(c);
      };

      this.commitsContainer.appendChild(card);
    }
  }

  async showCommitDetails(commit) {
    try {
      const diffData = await window.api.getGitDiff(this.currentRepoPath, null, `${commit.hash}~1`, commit.hash);
      window.monacoController.openDiff(
        commit.shortHash,
        '',
        diffData.diff || 'No text changes in commit',
        `Commit ${commit.shortHash}: ${commit.message}`
      );
    } catch (e) {
      console.error('Error loading commit diff:', e);
    }
  }

  openBranchModal() {
    if (!this.branchModal) return;
    this.branchModal.style.display = 'flex';
    this.branchSearchInput.value = '';
    this.renderBranchList(this.branches);
    setTimeout(() => this.branchSearchInput.focus(), 50);
  }

  closeBranchModal() {
    if (this.branchModal) this.branchModal.style.display = 'none';
  }

  renderBranchList(branches) {
    if (!this.branchList) return;
    this.branchList.innerHTML = '';

    for (const b of branches) {
      const item = document.createElement('div');
      item.className = `branch-item ${b.isCurrent ? 'current' : ''}`;
      item.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="6" y1="3" x2="6" y2="15"></line>
          <circle cx="18" cy="6" r="3"></circle>
          <circle cx="6" cy="18" r="3"></circle>
        </svg>
        <span>${b.name}</span>
        ${b.isCurrent ? '<span style="margin-left: auto; font-size: 10px;">(current)</span>' : ''}
      `;

      item.onclick = async () => {
        if (!b.isCurrent) {
          const res = await window.api.switchBranch(this.currentRepoPath, b.name);
          if (res.success) {
            this.closeBranchModal();
            if (window.app) window.app.reloadRepository();
          } else {
            alert(`Failed to switch branch: ${res.error}`);
          }
        }
      };

      this.branchList.appendChild(item);
    }
  }

  filterBranches(query) {
    const filtered = this.branches.filter(b => b.name.toLowerCase().includes(query));
    this.renderBranchList(filtered);
  }
}

window.gitController = new GitController();
