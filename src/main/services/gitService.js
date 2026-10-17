const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const { GIT_SECURITY_ARGS, GIT_SAFE_ENV } = require('./securityService');

/**
 * Execute git command safely with security flags to prevent execution of untrusted hooks/scripts
 */
function runGit(repoPath, args, options = {}) {
  const fullArgs = [...GIT_SECURITY_ARGS, ...args];
  return new Promise((resolve) => {
    execFile('git', fullArgs, {
      cwd: repoPath,
      maxBuffer: options.maxBuffer || 15 * 1024 * 1024,
      encoding: 'utf8',
      env: GIT_SAFE_ENV
    }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr || error.message, stdout: stdout || '', code: error.code });
      } else {
        resolve({ success: true, stdout, stderr, code: 0 });
      }
    });
  });
}

/**
 * Check if path is inside a git repository
 */
async function isGitRepo(repoPath) {
  try {
    const gitDir = path.join(repoPath, '.git');
    if (fs.existsSync(gitDir)) return true;
    const res = await runGit(repoPath, ['rev-parse', '--is-inside-work-tree']);
    return res.success && res.stdout.trim() === 'true';
  } catch (err) {
    return false;
  }
}

/**
 * Get current git status (branch, modified files, staged, untracked)
 */
async function getGitStatus(repoPath) {
  const isRepo = await isGitRepo(repoPath);
  if (!isRepo) {
    return {
      isRepo: false,
      branch: null,
      files: [],
      stats: { staged: 0, modified: 0, untracked: 0, deleted: 0 }
    };
  }

  const res = await runGit(repoPath, ['status', '--porcelain=v1', '-b', '-uall']);
  if (!res.success) {
    return {
      isRepo: true,
      error: res.error,
      branch: 'unknown',
      files: [],
      stats: { staged: 0, modified: 0, untracked: 0, deleted: 0 }
    };
  }

  const lines = res.stdout.split(/\r?\n/).filter(Boolean);
  let branch = 'main';
  let ahead = 0;
  let behind = 0;
  const files = [];
  const stats = { staged: 0, modified: 0, untracked: 0, deleted: 0 };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      // Branch header e.g. "## main...origin/main [ahead 1, behind 2]" or "## Initial commit on main"
      const branchPart = line.substring(3).trim();
      const match = branchPart.match(/^([^. ]+)/);
      if (match) branch = match[1];

      const aheadMatch = branchPart.match(/ahead (\d+)/);
      if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);

      const behindMatch = branchPart.match(/behind (\d+)/);
      if (behindMatch) behind = parseInt(behindMatch[1], 10);
      continue;
    }

    const indexStatus = line[0];
    const workTreeStatus = line[1];
    let filePath = line.substring(3).trim();

    // Handle renamed files: "R  old -> new"
    let oldPath = null;
    if (filePath.includes(' -> ')) {
      const parts = filePath.split(' -> ');
      oldPath = parts[0];
      filePath = parts[1];
    }

    // Clean quotes if git wrapped file name
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      filePath = filePath.substring(1, filePath.length - 1);
    }

    let statusType = 'modified';
    let isStaged = false;

    if (indexStatus === '?' && workTreeStatus === '?') {
      statusType = 'untracked';
      stats.untracked++;
    } else if (indexStatus === 'D' || workTreeStatus === 'D') {
      statusType = 'deleted';
      stats.deleted++;
    } else if (indexStatus === 'A') {
      statusType = 'added';
      stats.staged++;
      isStaged = true;
    } else if (indexStatus === 'R') {
      statusType = 'renamed';
      stats.staged++;
      isStaged = true;
    } else if (indexStatus !== ' ' && indexStatus !== '?') {
      statusType = 'staged';
      stats.staged++;
      isStaged = true;
    } else {
      statusType = 'modified';
      stats.modified++;
    }

    files.push({
      path: filePath.replace(/\\/g, '/'),
      fullPath: path.join(repoPath, filePath),
      oldPath: oldPath ? oldPath.replace(/\\/g, '/') : null,
      indexStatus,
      workTreeStatus,
      statusType,
      isStaged
    });
  }

  return {
    isRepo: true,
    branch,
    ahead,
    behind,
    files,
    stats
  };
}

/**
 * Get branch list
 */
async function getGitBranches(repoPath) {
  const isRepo = await isGitRepo(repoPath);
  if (!isRepo) return { branches: [], current: null };

  const res = await runGit(repoPath, ['branch', '-a', '--format=%(refname:short)|%(HEAD)|%(upstream:short)']);
  if (!res.success) return { branches: [], current: null };

  const branches = [];
  let current = null;

  const lines = res.stdout.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const [name, head, upstream] = line.split('|');
    const isCurrent = head === '*';
    if (isCurrent) current = name;
    branches.push({
      name,
      isCurrent,
      isRemote: name.startsWith('origin/') || name.startsWith('remotes/'),
      upstream: upstream || null
    });
  }

  return { branches, current };
}

/**
 * Switch branch
 */
async function switchBranch(repoPath, branchName) {
  const res = await runGit(repoPath, ['checkout', branchName]);
  if (!res.success) {
    return { success: false, error: res.error };
  }
  return { success: true, branch: branchName };
}

/**
 * Get commit history log with parent hashes for DAG diagramming
 */
async function getGitLog(repoPath, maxCount = 50) {
  const isRepo = await isGitRepo(repoPath);
  if (!isRepo) return { commits: [], graph: { nodes: [], links: [] } };

  const format = '%H|%h|%an|%ae|%ad|%s|%P';
  const res = await runGit(repoPath, [
    'log',
    `-${maxCount}`,
    `--pretty=format:${format}`,
    '--date=short'
  ]);

  if (!res.success) return { commits: [], graph: { nodes: [], links: [] } };

  const commits = [];
  const nodes = [];
  const links = [];

  const lines = res.stdout.split(/\r?\n/).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split('|');
    if (parts.length < 6) continue;

    const hash = parts[0];
    const shortHash = parts[1];
    const author = parts[2];
    const email = parts[3];
    const date = parts[4];
    const message = parts[5];
    const parents = (parts[6] || '').trim().split(/\s+/).filter(Boolean);

    const commitObj = {
      hash,
      shortHash,
      author,
      email,
      date,
      message,
      parents,
      index: i
    };

    commits.push(commitObj);

    nodes.push({
      id: hash,
      shortHash,
      label: `${shortHash}: ${message.substring(0, 32)}...`,
      author,
      date,
      message,
      type: 'commit'
    });

    for (const parentHash of parents) {
      links.push({
        source: hash,
        target: parentHash,
        type: 'parent'
      });
    }
  }

  return {
    commits,
    graph: { nodes, links }
  };
}

/**
 * Get diff for a file or commit
 */
async function getGitDiff(repoPath, filePath = null, commitA = null, commitB = null) {
  const isRepo = await isGitRepo(repoPath);
  if (!isRepo) return { diff: '', originalContent: '', modifiedContent: '' };

  const args = ['diff'];
  if (commitA && commitB) {
    args.push(commitA, commitB);
  } else if (commitA) {
    args.push(commitA);
  } else {
    args.push('HEAD');
  }

  if (filePath) {
    args.push('--', filePath);
  }

  const res = await runGit(repoPath, args);
  let originalContent = '';
  let modifiedContent = '';

  if (filePath) {
    // Get original content from HEAD (or commitA)
    const baseRef = commitA ? `${commitA}:${filePath}` : `HEAD:${filePath}`;
    const origRes = await runGit(repoPath, ['show', baseRef]);
    if (origRes.success) {
      originalContent = origRes.stdout;
    }

    // Get current modified content from disk if working tree
    if (!commitB) {
      try {
        const full = path.join(repoPath, filePath);
        if (fs.existsSync(full)) {
          originalContent = origRes.success ? origRes.stdout : '';
          modifiedContent = await fs.promises.readFile(full, 'utf8');
        }
      } catch (e) {
        // file might be deleted
      }
    } else {
      const modRes = await runGit(repoPath, ['show', `${commitB}:${filePath}`]);
      if (modRes.success) {
        modifiedContent = modRes.stdout;
      }
    }
  }

  return {
    diff: res.stdout || '',
    originalContent,
    modifiedContent
  };
}

module.exports = {
  isGitRepo,
  getGitStatus,
  getGitBranches,
  switchBranch,
  getGitLog,
  getGitDiff,
  runGit
};
