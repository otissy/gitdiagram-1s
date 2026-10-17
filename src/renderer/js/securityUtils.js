/**
 * Security utilities for GitDiagram 1s renderer:
 * Sanitizes untrusted repository strings, branch names, commit messages, file paths,
 * and symbol definitions to prevent Cross-Site Scripting (XSS) and DOM script injection.
 */
(function(global) {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  global.escapeHtml = escapeHtml;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escapeHtml };
  }
})(typeof window !== 'undefined' ? window : globalThis);
