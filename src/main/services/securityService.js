'use strict';

const path = require('path');

// Prohibited URL schemes that could trigger script execution or data exfiltration
const DANGEROUS_PROTOCOLS_REGEX = /^(javascript|data|vbscript|about|blob):/i;

/**
 * Validates and sanitizes file paths received from IPC or external sources.
 * Prevents null-byte injections, protocol execution, and path anomalies.
 *
 * @param {string} val
 * @returns {string} normalized safe path
 */
function sanitizePathArg(val) {
  if (typeof val !== 'string' || !val.trim() || val.includes('\0')) {
    throw new Error('Security: Invalid path argument');
  }
  // Check for control characters
  if (/[\x00-\x1f\x7f]/.test(val)) {
    throw new Error('Security: Control characters detected in path');
  }
  const trimmed = val.trim();
  if (DANGEROUS_PROTOCOLS_REGEX.test(trimmed)) {
    throw new Error('Security: Malicious protocol detected in path');
  }
  return path.normalize(trimmed);
}

/**
 * Validates git branch names to prevent command-line option injection (e.g. `--upload-pack`)
 * and control character injections.
 *
 * @param {string} branch
 * @returns {boolean}
 */
function isValidBranchName(branch) {
  if (typeof branch !== 'string' || !branch.trim()) return false;
  const trimmed = branch.trim();
  if (trimmed.startsWith('-')) return false; // Prevent CLI flag injection
  if (/[\x00-\x1f\x7f\s]/.test(trimmed)) return false; // No control characters or whitespace
  if (/[~^:?*\[\\]/.test(trimmed)) return false; // Invalid git ref characters
  if (trimmed.includes('..') || trimmed.includes('@{')) return false;
  return true;
}

/**
 * Validates repository owner and name parts in GitHub slugs to prevent flag injection.
 *
 * @param {string} part
 * @returns {boolean}
 */
function isValidSlugPart(part) {
  return typeof part === 'string' && /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(part) && !part.startsWith('-');
}

/**
 * Sanitizes untrusted strings for safe rendering in HTML.
 *
 * @param {string|any} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Git CLI arguments to guarantee untrusted repositories cannot trigger arbitrary hook scripts,
 * custom diff programs, or credential leakage during git operations.
 */
const GIT_SECURITY_ARGS = Object.freeze([
  '-c', 'core.hooksPath=',
  '-c', 'core.fsmonitor=',
  '-c', 'credential.helper=',
  '-c', 'diff.external=',
  '-c', 'diff.textconv='
]);

/**
 * Safe environment for git child process execution.
 */
const GIT_SAFE_ENV = Object.freeze({
  ...process.env,
  LANG: 'en_US.UTF-8',
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_NOSYSTEM: '1'
});

module.exports = {
  sanitizePathArg,
  isValidBranchName,
  isValidSlugPart,
  escapeHtml,
  GIT_SECURITY_ARGS,
  GIT_SAFE_ENV
};
