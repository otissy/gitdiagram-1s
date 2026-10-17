# PROJECT.md — Vision IDE (Visual Code Editor & Codebase Architecture Visualizer)

The map of the ground. Read before any task; update at the end of every task.

## Current state

Vision IDE is a Windows and Linux desktop application combining the fast, comprehensive code-reading experience of GitHub1s (Monaco Editor, file explorer, tabs, git commit diffs) with the visual intelligence of GitDiagram (interactive codebase architecture diagrams, module dependency graphs, AST import links, SVG/Mermaid export). It supports opening any local folder or Git repository, as well as typing/pasting any remote GitHub repository (`owner/repo` or URL) for public repos and logging in with a GitHub Personal Access Token to explore private repositories. It includes deep symbol-level exploration (classes, methods, functions, variables, constants, interfaces), call hierarchy visualization, and instant click-to-jump line navigation in Monaco Editor.

By default, Vision IDE runs in **Lightweight Viewer Mode** (<75MB RAM idle, instant startup, read-only exploration). Users can explicitly opt into **Developer IDE Mode**, which dynamically activates an interactive Integrated Terminal drawer (xterm.js + native shell), Command Palette (`Ctrl+Shift+P` / `F1`), live in-place file editing with `Ctrl+S` workspace writes, dirty-state tab indicators, and a real-time developer status bar.

## How to run and test

- Launch: `npm start`
- Test: `npm test` (runs ladder tests across L1 import, L2 units, L3 module, L4 e2e)
- Capture live proof: `node tools/capture_proof.js`

## Limits

| Limit | What it means |
|---|---|
| Launching | Use standard `npm start`. Legacy batch/shell launch scripts are deprecated. |
| `electron` | Desktop windowing runtime on Windows 10/11 and Linux |
| Local filesystem & Cache | Large repos need fast scanning with `.gitignore` and default ignores (`node_modules`, `.git`, `dist`, etc.); remote repos are shallow-cached locally. |
| Private Repos | Requires GitHub token with `repo` scope to clone and list user private repositories |
| Mode Isolation | Terminal processes and file edit capabilities remain dormant until the user explicitly opts into Developer IDE Mode |

## Sources of truth

- File scanner & Git parser → `src/main/services/gitService.js` and `src/main/services/fileService.js`
- Security hardening & input sanitization → `src/main/services/securityService.js` and `src/renderer/js/securityUtils.js`
- Interactive Terminal service → `src/main/services/terminalService.js`
- IDE Mode & Command Palette Controller → `src/renderer/js/ideController.js`
- Symbol & call hierarchy extractor → `src/main/services/symbolService.js`
- Diagram extraction & AST dependency resolver → `src/main/services/diagramService.js`
- GitHub remote cloning & authentication → `src/main/services/githubRemoteService.js`
- IPC contracts → `src/preload/preload.js`
- Symbols & Outline Controller → `src/renderer/js/outlineController.js`
- Frontend UI & Monaco/Canvas controller → `src/renderer/`

## Security Architecture & Hardening

1. **Git Process Isolation:**
   - All Git CLI calls invoke `GIT_SECURITY_ARGS` (`-c core.hooksPath=`, `-c core.fsmonitor=`, `-c credential.helper=`, `-c diff.external=`, `-c diff.textconv=`) and `GIT_SAFE_ENV` (`GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_NOSYSTEM=1`). This blocks malicious repositories from executing hook scripts (`.bat`, `.sh`, `.exe`, `.ps1`), running untrusted filesystem monitors, or executing third-party diff tools.
   - Positional separators (`--`) are passed before all URLs and clone targets to eliminate CLI flag injection.

2. **Strict IPC & Path Validation:**
   - `securityService.sanitizePathArg` validates all path inputs against null bytes, control characters, and dangerous URL protocols (`javascript:`, `data:`, `vbscript:`, `about:`, `blob:`).
   - Branch names are validated with `isValidBranchName` to block option injection (e.g. `--upload-pack`, `-oProxyCommand`) and ref manipulation.
   - Remote repository slugs are validated with `isValidSlugPart` to prevent flag injection.

3. **Electron Session & Window Isolation:**
   - Content-Security-Policy (CSP) is enforced both via HTTP headers (`session.defaultSession.webRequest.onHeadersReceived`) and `<meta http-equiv="Content-Security-Policy">` in renderer HTML (`default-src 'none'; script-src 'self' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: file: https://avatars.githubusercontent.com https://github.com; font-src 'self' data:; connect-src 'self' https://api.github.com https://github.com; object-src 'none'; frame-src 'none'; base-uri 'self';`).
   - `nodeIntegration: false`, `contextIsolation: true`, `navigateOnDragDrop: false`, `allowRunningInsecureContent: false`, `webSecurity: true`.
   - Popups and new windows are blocked via `setWindowOpenHandler` (only verified GitHub HTTPS URLs can be opened in the OS default browser). WebViews are explicitly rejected with `will-attach-webview`.
   - All hardware/device permission requests are unconditionally rejected with `setPermissionRequestHandler`.

4. **DOM & HTML Sanitization:**
   - `escapeHtml` is applied to all repository-controlled strings (branch names, file paths, symbol signatures, commit messages, and API error strings) before DOM injection.

## Known problems

None.

## Dropped approaches

None.
