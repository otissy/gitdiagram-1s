/**
 * GitDiagram 1s - GitHub Remote Hub Controller
 * Manages Pull Requests, Open Issues, Remote Branches, and Repository Ownership
 */

class GitHubController {
  constructor() {
    this.container = document.getElementById('github-container');
    this.prBadge = document.getElementById('github-pr-badge');
    this.actBtn = document.getElementById('act-github');
    this.currentRepoPath = null;
    this.repoDetails = null;
    this.isLoading = false;

    this.bindEvents();
  }

  bindEvents() {
    if (this.actBtn) {
      this.actBtn.onclick = () => {
        if (window.app) {
          window.app.switchSidebarTab('github');
          this.refresh();
        }
      };
    }
  }

  async loadRepository(repoPath) {
    this.currentRepoPath = repoPath;
    if (!this.container) return;

    this.renderLoading();

    try {
      const result = await window.api.github.getRepoDetails(repoPath);
      this.repoDetails = result;
      this.render();
    } catch (err) {
      console.error('Failed to load GitHub repository details:', err);
      this.renderError(err.message);
    }
  }

  async refresh() {
    if (this.currentRepoPath) {
      await this.loadRepository(this.currentRepoPath);
    }
  }

  renderLoading() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 12px;">
        <div class="spinner" style="margin: 0 auto 10px auto;"></div>
        Connecting to GitHub & fetching repository data...
      </div>
    `;
  }

  renderError(msg) {
    if (!this.container) return;
    const safeMsg = typeof escapeHtml === 'function' ? escapeHtml(msg) : msg;
    this.container.innerHTML = `
      <div style="padding: 20px 14px; text-align: center; color: var(--accent-red); font-size: 12px;">
        <div style="font-size: 20px; margin-bottom: 6px;">⚠️</div>
        <div>${safeMsg}</div>
        <button id="btn-gh-retry" class="btn-secondary" style="margin-top: 12px; font-size: 11px; padding: 4px 10px;">Retry</button>
      </div>
    `;
    const btn = document.getElementById('btn-gh-retry');
    if (btn) btn.onclick = () => this.refresh();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (!this.repoDetails || !this.repoDetails.hasRemote) {
      this.renderNoRemoteState();
      return;
    }

    const { isOwner, repo, pullRequests = [], issues = [], branches = [], currentUser } = this.repoDetails;

    // Update PR badge on activity bar
    if (this.prBadge) {
      const openCount = pullRequests.filter(p => p.state === 'open').length;
      if (openCount > 0) {
        this.prBadge.textContent = openCount;
        this.prBadge.style.display = 'flex';
      } else {
        this.prBadge.style.display = 'none';
      }
    }

    const wrap = document.createElement('div');
    wrap.className = 'github-hub-wrap';

    // 1. Repository & Ownership Header Card
    const headerCard = document.createElement('div');
    headerCard.className = 'github-repo-card';

    const isUserOwner = isOwner || (currentUser && repo && currentUser.login && currentUser.login.toLowerCase() === repo.owner.login.toLowerCase());
    const ownerBadge = isUserOwner 
      ? `<span class="gh-owner-pill">👑 You own this repository</span>`
      : `<span class="gh-remote-pill">🔗 GitHub Remote</span>`;

    const safeRepoName = typeof escapeHtml === 'function' ? escapeHtml(repo.fullName) : repo.fullName;
    const safeDesc = typeof escapeHtml === 'function' ? escapeHtml(repo.description || 'No description provided') : (repo.description || '');

    headerCard.innerHTML = `
      <div class="gh-card-header">
        <img class="gh-owner-avatar" src="${repo.owner.avatar_url || ''}" alt="avatar" />
        <div class="gh-card-titles">
          <div class="gh-repo-title">${safeRepoName}</div>
          ${ownerBadge}
        </div>
      </div>
      <div class="gh-repo-desc">${safeDesc}</div>
      <div class="gh-repo-stats">
        <span class="gh-stat-chip">⭐ ${repo.stars || 0}</span>
        <span class="gh-stat-chip">🍴 ${repo.forks || 0}</span>
        <span class="gh-stat-chip">${repo.private ? '🔒 Private' : '🌐 Public'}</span>
        <span class="gh-stat-chip">🌿 ${repo.defaultBranch || 'main'}</span>
      </div>
      <div class="gh-card-actions">
        <button id="btn-open-github" class="btn-gh-action">
          <span>View on GitHub</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </button>
        <button id="btn-gh-refresh" class="btn-gh-action" title="Refresh remote GitHub data">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
        </button>
      </div>
    `;

    headerCard.querySelector('#btn-open-github').onclick = () => {
      if (repo.htmlUrl && window.api.openExternal) {
        window.api.openExternal(repo.htmlUrl);
      }
    };
    headerCard.querySelector('#btn-gh-refresh').onclick = () => this.refresh();

    wrap.appendChild(headerCard);

    // 2. Branches Section
    const branchSection = document.createElement('div');
    branchSection.className = 'gh-section';
    branchSection.innerHTML = `
      <div class="gh-section-header">
        <span>Branches (${branches.length})</span>
      </div>
    `;
    const branchList = document.createElement('div');
    branchList.className = 'gh-items-list';

    for (const b of branches) {
      const bItem = document.createElement('div');
      bItem.className = 'gh-branch-item';
      const isDefault = b.name === repo.defaultBranch;
      bItem.innerHTML = `
        <span class="gh-branch-icon">🌿</span>
        <span class="gh-branch-name">${typeof escapeHtml === 'function' ? escapeHtml(b.name) : b.name}</span>
        ${isDefault ? '<span class="gh-branch-default-badge">default</span>' : ''}
      `;
      bItem.onclick = async () => {
        if (window.gitController) {
          await window.gitController.switchBranch(b.name);
          this.refresh();
        }
      };
      branchList.appendChild(bItem);
    }
    branchSection.appendChild(branchList);
    wrap.appendChild(branchSection);

    // 3. Pull Requests Section
    const prSection = document.createElement('div');
    prSection.className = 'gh-section';
    const openPrs = pullRequests.filter(p => p.state === 'open');
    prSection.innerHTML = `
      <div class="gh-section-header">
        <span>Pull Requests (${openPrs.length} Open)</span>
        <button id="btn-create-pr" class="gh-header-action" title="Create Pull Request on GitHub">+ New PR</button>
      </div>
    `;

    prSection.querySelector('#btn-create-pr').onclick = () => {
      const prUrl = `${repo.htmlUrl}/compare`;
      if (window.api.openExternal) window.api.openExternal(prUrl);
    };

    const prList = document.createElement('div');
    prList.className = 'gh-items-list';

    if (pullRequests.length === 0) {
      prList.innerHTML = `
        <div class="gh-empty-note">
          No open pull requests.
        </div>
      `;
    } else {
      for (const pr of pullRequests) {
        const prItem = document.createElement('div');
        prItem.className = 'gh-pr-item';
        const isOpen = pr.state === 'open';
        const stateColor = isOpen ? '#2ea043' : '#8957e5';
        const stateLabel = pr.draft ? 'Draft' : isOpen ? 'Open' : 'Merged';
        const safeTitle = typeof escapeHtml === 'function' ? escapeHtml(pr.title) : pr.title;
        const safeAuthor = typeof escapeHtml === 'function' ? escapeHtml(pr.user.login) : pr.user.login;

        prItem.innerHTML = `
          <div class="gh-item-top">
            <span class="gh-status-pill" style="background: ${stateColor}22; color: ${stateColor}; border-color: ${stateColor}55;">${stateLabel}</span>
            <span class="gh-item-number">#${pr.number}</span>
            <span class="gh-item-title">${safeTitle}</span>
          </div>
          <div class="gh-item-meta">
            <span>by @${safeAuthor}</span>
            <span class="gh-branch-flow">${pr.headBranch || ''} → ${pr.baseBranch || ''}</span>
          </div>
        `;

        prItem.onclick = () => {
          if (pr.htmlUrl && window.api.openExternal) {
            window.api.openExternal(pr.htmlUrl);
          }
        };

        prList.appendChild(prItem);
      }
    }

    prSection.appendChild(prList);
    wrap.appendChild(prSection);

    // 4. Open Issues Section
    const issueSection = document.createElement('div');
    issueSection.className = 'gh-section';
    issueSection.innerHTML = `
      <div class="gh-section-header">
        <span>Open Issues (${issues.length})</span>
        <button id="btn-create-issue" class="gh-header-action" title="Create Issue on GitHub">+ New Issue</button>
      </div>
    `;

    issueSection.querySelector('#btn-create-issue').onclick = () => {
      const issueUrl = `${repo.htmlUrl}/issues/new`;
      if (window.api.openExternal) window.api.openExternal(issueUrl);
    };

    const issueList = document.createElement('div');
    issueList.className = 'gh-items-list';

    if (issues.length === 0) {
      issueList.innerHTML = `
        <div class="gh-empty-note">
          No open issues in this repository.
        </div>
      `;
    } else {
      for (const iss of issues) {
        const issItem = document.createElement('div');
        issItem.className = 'gh-issue-item';
        const safeTitle = typeof escapeHtml === 'function' ? escapeHtml(iss.title) : iss.title;
        const safeAuthor = typeof escapeHtml === 'function' ? escapeHtml(iss.user.login) : iss.user.login;

        const labelsHtml = (iss.labels || []).map(l => {
          const bg = l.color ? `#${l.color}` : '#30363d';
          const safeName = typeof escapeHtml === 'function' ? escapeHtml(l.name) : l.name;
          return `<span class="gh-label-pill" style="background: ${bg}33; color: ${bg}; border-color: ${bg}66;">${safeName}</span>`;
        }).join('');

        issItem.innerHTML = `
          <div class="gh-item-top">
            <span class="gh-issue-dot">●</span>
            <span class="gh-item-number">#${iss.number}</span>
            <span class="gh-item-title">${safeTitle}</span>
          </div>
          ${labelsHtml ? `<div class="gh-labels-bar">${labelsHtml}</div>` : ''}
          <div class="gh-item-meta">
            <span>opened by @${safeAuthor}</span>
            <span>💬 ${iss.comments || 0}</span>
          </div>
        `;

        issItem.onclick = () => {
          if (iss.htmlUrl && window.api.openExternal) {
            window.api.openExternal(iss.htmlUrl);
          }
        };

        issueList.appendChild(issItem);
      }
    }

    issueSection.appendChild(issueList);
    wrap.appendChild(issueSection);

    this.container.appendChild(wrap);
  }

  renderNoRemoteState() {
    this.container.innerHTML = `
      <div style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 12px;">
        <div style="font-size: 26px; margin-bottom: 8px;">🐙</div>
        <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Local Repository</div>
        <div style="margin-bottom: 14px; line-height: 1.4;">This local folder does not have a GitHub remote origin configured yet.</div>
        <div style="font-size: 11px; color: var(--text-secondary); background: var(--bg-secondary); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-subtle); text-align: left; font-family: var(--font-mono); margin-bottom: 12px;">
          git remote add origin https://github.com/USER/REPO.git<br/>git push -u origin main
        </div>
        <button id="btn-gh-check-remote" class="btn-primary" style="font-size: 11px; padding: 5px 12px;">Check Remote</button>
      </div>
    `;

    const btn = document.getElementById('btn-gh-check-remote');
    if (btn) btn.onclick = () => this.refresh();
  }
}

window.githubController = new GitHubController();
