'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { sanitizePathArg } = require('./securityService');

class TerminalService {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Determine default shell executable for current OS
   */
  getDefaultShell() {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * Spawn a new terminal session
   */
  spawnTerminal(sessionId, cwd, sender) {
    if (this.sessions.has(sessionId)) {
      this.kill(sessionId);
    }

    const safeCwd = cwd ? sanitizePathArg(cwd) : process.cwd();
    const shell = this.getDefaultShell();
    const args = process.platform === 'win32' ? [] : ['-i'];

    try {
      const proc = spawn(shell, args, {
        cwd: safeCwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        },
        windowsHide: true
      });

      const sessionObj = {
        id: sessionId,
        process: proc,
        cwd: safeCwd
      };

      proc.stdout.on('data', (chunk) => {
        if (!sender.isDestroyed()) {
          sender.send('terminal:data', { sessionId, data: chunk.toString('utf8') });
        }
      });

      proc.stderr.on('data', (chunk) => {
        if (!sender.isDestroyed()) {
          sender.send('terminal:data', { sessionId, data: chunk.toString('utf8') });
        }
      });

      proc.on('close', (code) => {
        this.sessions.delete(sessionId);
        if (!sender.isDestroyed()) {
          sender.send('terminal:exit', { sessionId, code });
        }
      });

      proc.on('error', (err) => {
        if (!sender.isDestroyed()) {
          sender.send('terminal:data', { sessionId, data: `\r\nTerminal Error: ${err.message}\r\n` });
        }
      });

      this.sessions.set(sessionId, sessionObj);
      return { success: true, sessionId, shell };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Write data to terminal stdin
   */
  write(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.process || session.process.killed) {
      return { success: false, error: 'Session not active' };
    }

    try {
      session.process.stdin.write(data);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Terminate a terminal session
   */
  kill(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: true };

    try {
      if (session.process && !session.process.killed) {
        if (process.platform === 'win32') {
          // Force tree kill on Windows
          spawn('taskkill', ['/pid', String(session.process.pid), '/T', '/F']);
        } else {
          session.process.kill('SIGTERM');
        }
      }
    } catch (e) {
      // ignore
    }

    this.sessions.delete(sessionId);
    return { success: true };
  }

  /**
   * Terminate all terminal sessions (e.g. on window close or IDE Mode OFF)
   */
  killAll() {
    for (const [id] of this.sessions) {
      this.kill(id);
    }
    this.sessions.clear();
  }

  /**
   * Check if a session is alive
   */
  hasSession(sessionId) {
    return this.sessions.has(sessionId);
  }
}

module.exports = new TerminalService();
