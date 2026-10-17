const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { isValidSlugPart, GIT_SECURITY_ARGS, GIT_SAFE_ENV } = require('./securityService');

// Parse repo input like "facebook/react", "https://github.com/owner/repo", "git@github.com:owner/repo.git"
function parseRepoIdentifier(input) {
  if (!input || typeof input !== 'string') return null;
  let str = input.trim();

  // Strip trailing .git and slashes
  str = str.replace(/\.git$/i, '').replace(/\/+$/, '');

  // https://github.com/owner/repo
  const httpMatch = str.match(/https?:\/\/[^\/]+\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (httpMatch && isValidSlugPart(httpMatch[1]) && isValidSlugPart(httpMatch[2])) {
    return { owner: httpMatch[1], repo: httpMatch[2], fullName: `${httpMatch[1]}/${httpMatch[2]}` };
  }

  // git@github.com:owner/repo
  const sshMatch = str.match(/git@[^:]+:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (sshMatch && isValidSlugPart(sshMatch[1]) && isValidSlugPart(sshMatch[2])) {
    return { owner: sshMatch[1], repo: sshMatch[2], fullName: `${sshMatch[1]}/${sshMatch[2]}` };
  }

  // owner/repo
  const slugMatch = str.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (slugMatch && isValidSlugPart(slugMatch[1]) && isValidSlugPart(slugMatch[2])) {
    return { owner: slugMatch[1], repo: slugMatch[2], fullName: `${slugMatch[1]}/${slugMatch[2]}` };
  }

  return null;
}

class GitHubRemoteService {
  constructor(userDataPath = null) {
    this.userDataPath = userDataPath || (app ? app.getPath('userData') : path.join(process.cwd(), '.user-data'));
    this.configPath = path.join(this.userDataPath, 'github-config.json');
    this.cacheDir = path.join(this.userDataPath, 'remote-repos');

    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (e) {}
  }

  // Load config
  getConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (e) {}
    return { token: null, user: null };
  }

  // Save config
  saveConfig(data) {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (e) {
      return false;
    }
  }

  // Get configured token
  getToken() {
    return this.getConfig().token || null;
  }

  // Get effective token (configured token or fallback to gh CLI auth)
  getEffectiveToken() {
    const saved = this.getToken();
    if (saved) return saved;
    try {
      const { execSync } = require('child_process');
      const token = execSync('gh auth token', { encoding: 'utf8', timeout: 2000 }).trim();
      if (token && token.startsWith('gh')) return token;
    } catch (e) {}
    return null;
  }

  // Verify and set GitHub Token
  async setToken(token) {
    const cleanToken = (token || '').trim();
    if (!cleanToken) {
      this.saveConfig({ token: null, user: null });
      return { success: true, user: null };
    }

    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'User-Agent': 'GitDiagram-1s-Desktop',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!res.ok) {
        return { success: false, error: `GitHub API error: ${res.status} ${res.statusText}` };
      }

      const userData = await res.json();
      const user = {
        login: userData.login,
        name: userData.name || userData.login,
        avatar_url: userData.avatar_url,
        html_url: userData.html_url,
        total_private_repos: userData.total_private_repos || 0,
        public_repos: userData.public_repos || 0
      };

      this.saveConfig({ token: cleanToken, user });
      return { success: true, user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Get user profile
  getUser() {
    return this.getConfig().user || null;
  }

  // Remove token
  logout() {
    this.saveConfig({ token: null, user: null });
    return { success: true };
  }

  // Get list of user repositories (public and private)
  async getUserRepositories() {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'Not authenticated with GitHub' };
    }

    try {
      const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'GitDiagram-1s-Desktop',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!res.ok) {
        return { success: false, error: `Failed to load repositories: ${res.statusText}` };
      }

      const repos = await res.json();
      const mapped = repos.map(r => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        updatedAt: r.updated_at,
        htmlUrl: r.html_url,
        cloneUrl: r.clone_url
      }));

      return { success: true, repos: mapped };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Clone or fetch a remote repository into local cache
  async fetchRemoteRepository(repoInput, onProgress = null) {
    const parsed = parseRepoIdentifier(repoInput);
    if (!parsed) {
      throw new Error('Invalid repository identifier. Format must be owner/repo or a GitHub URL.');
    }

    const { owner, repo, fullName } = parsed;
    // Sanitize folder name
    const safeFolderName = `${owner.replace(/[^a-zA-Z0-9_-]/g, '_')}__${repo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const targetDir = path.join(this.cacheDir, safeFolderName);

    const token = this.getToken();
    // Build clone URL (inject token if available for private repo support)
    let cloneUrl = `https://github.com/${owner}/${repo}.git`;
    if (token) {
      cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    }

    // Check if repository was already cloned in cache
    const exists = fs.existsSync(path.join(targetDir, '.git'));

    if (exists) {
      // Pull/fetch latest changes
      if (onProgress) onProgress('Updating cached repository...');
      const fetchRes = await this.runGitCommand(targetDir, ['fetch', '--depth=50', 'origin']);
      if (fetchRes.success) {
        await this.runGitCommand(targetDir, ['reset', '--hard', 'FETCH_HEAD']);
      }
      return {
        path: targetDir,
        fullName,
        isCached: true
      };
    } else {
      // Clone fresh with depth 50 for quick download
      if (onProgress) onProgress(`Cloning ${fullName} (shallow depth 50)...`);
      fs.mkdirSync(this.cacheDir, { recursive: true });

      const cloneRes = await this.runGitCommand(this.cacheDir, [
        'clone',
        '--config', 'core.hooksPath=',
        '--config', 'core.fsmonitor=',
        '--depth=50',
        '--',
        cloneUrl,
        safeFolderName
      ]);

      if (!cloneRes.success) {
        // Sanitize error to avoid leaking token
        const cleanError = (cloneRes.error || 'Git clone failed').replace(/x-access-token:[^@]+@/, '');
        throw new Error(`Failed to clone ${fullName}: ${cleanError}`);
      }

      // Configure origin URL in clone to strip embedded token so credentials aren't saved on disk in plaintext
      try {
        await this.runGitCommand(targetDir, ['remote', 'set-url', 'origin', `https://github.com/${owner}/${repo}.git`]);
      } catch (e) {}

      return {
        path: targetDir,
        fullName,
        isCached: false
      };
    }
  }

  // Detect remote origin from a local folder
  async getRepoRemote(repoPath) {
    if (!repoPath) return null;
    const res = await this.runGitCommand(repoPath, ['remote', '-v']);
    if (!res.success || !res.stdout) return null;
    const lines = res.stdout.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const parsed = parseRepoIdentifier(parts[1]);
        if (parsed) return parsed;
      }
    }
    return null;
  }

  // Fetch full GitHub repo details, pull requests, issues, branches, and ownership status
  async getRepoFullDetails(repoPath, ownerInput = null, repoInput = null) {
    let owner = ownerInput;
    let repo = repoInput;

    if (!owner || !repo) {
      const remote = await this.getRepoRemote(repoPath);
      if (!remote) {
        return { success: false, hasRemote: false, error: 'No GitHub remote repository found for this folder.' };
      }
      owner = remote.owner;
      repo = remote.repo;
    }

    const token = this.getEffectiveToken();
    const headers = {
      'User-Agent': 'GitDiagram-1s-Desktop',
      'Accept': 'application/vnd.github.v3+json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Also get active user info to verify ownership
    let currentUser = this.getUser();
    if (!currentUser && token) {
      try {
        const uRes = await fetch('https://api.github.com/user', { headers });
        if (uRes.ok) {
          const uData = await uRes.json();
          currentUser = { login: uData.login, name: uData.name || uData.login, avatar_url: uData.avatar_url };
          this.saveConfig({ token, user: currentUser });
        }
      } catch (e) {}
    }

    try {
      // 1. Fetch Repository Metadata
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      if (!repoRes.ok) {
        return { success: false, hasRemote: true, error: `GitHub API error: ${repoRes.statusText}` };
      }
      const r = await repoRes.json();

      const isOwner = !!(
        (currentUser && currentUser.login && currentUser.login.toLowerCase() === r.owner.login.toLowerCase()) ||
        (r.permissions && (r.permissions.admin || r.permissions.push))
      );

      // 2. Fetch Pull Requests, Issues, and Branches in parallel
      const [prRes, issueRes, branchRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=30`, { headers }).catch(() => null),
        fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=30`, { headers }).catch(() => null),
        fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=50`, { headers }).catch(() => null)
      ]);

      const pullRequests = (prRes && prRes.ok ? await prRes.json() : []).map(p => ({
        number: p.number,
        title: p.title,
        state: p.state,
        draft: p.draft,
        user: { login: p.user.login, avatar_url: p.user.avatar_url },
        htmlUrl: p.html_url,
        createdAt: p.created_at,
        headBranch: p.head ? p.head.ref : null,
        baseBranch: p.base ? p.base.ref : null
      }));

      const rawIssues = issueRes && issueRes.ok ? await issueRes.json() : [];
      const issues = rawIssues
        .filter(i => !i.pull_request)
        .map(i => ({
          number: i.number,
          title: i.title,
          state: i.state,
          user: { login: i.user.login, avatar_url: i.user.avatar_url },
          htmlUrl: i.html_url,
          comments: i.comments,
          createdAt: i.created_at,
          labels: (i.labels || []).map(l => ({ name: l.name, color: l.color }))
        }));

      const branches = (branchRes && branchRes.ok ? await branchRes.json() : []).map(b => ({
        name: b.name,
        protected: b.protected
      }));

      return {
        success: true,
        hasRemote: true,
        isOwner,
        currentUser,
        repo: {
          id: r.id,
          name: r.name,
          fullName: r.full_name,
          owner: { login: r.owner.login, avatar_url: r.owner.avatar_url, htmlUrl: r.owner.html_url },
          private: r.private,
          description: r.description,
          defaultBranch: r.default_branch,
          stars: r.stargazers_count,
          forks: r.forks_count,
          openIssuesCount: r.open_issues_count,
          htmlUrl: r.html_url,
          cloneUrl: r.clone_url
        },
        pullRequests,
        issues,
        branches
      };
    } catch (err) {
      return { success: false, hasRemote: true, error: err.message };
    }
  }

  // Safe git execution with security flags to prevent execution of untrusted hooks/scripts
  runGitCommand(cwd, args) {
    const fullArgs = [...GIT_SECURITY_ARGS, ...args];

    return new Promise((resolve) => {
      execFile('git', fullArgs, {
        cwd,
        maxBuffer: 20 * 1024 * 1024,
        encoding: 'utf8',
        env: GIT_SAFE_ENV
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: stderr || error.message, stdout });
        } else {
          resolve({ success: true, stdout, stderr });
        }
      });
    });
  }
}

module.exports = {
  GitHubRemoteService,
  parseRepoIdentifier
};
