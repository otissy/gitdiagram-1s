# PROJECT.md — GitDiagram 1s (Desktop Git & Codebase Architecture Visualizer)

The map of the ground. Read before any task; update at the end of every task.

## Current state

GitDiagram 1s is a Windows and Linux desktop application combining the fast, comprehensive code-reading experience of GitHub1s (Monaco Editor, file explorer, tabs, git commit diffs) with the visual intelligence of GitDiagram (interactive codebase architecture diagrams, module dependency graphs, AST import links, SVG/Mermaid export). It supports opening any local folder or Git repository, as well as typing/pasting any remote GitHub repository (`owner/repo` or URL) for public repos and logging in with a GitHub Personal Access Token to explore private repositories. It includes deep symbol-level exploration (classes, methods, functions, variables, constants, interfaces), call hierarchy visualization, and instant click-to-jump line navigation in Monaco Editor.

## How to run and test

- Windows launch: `.\run.bat` (or `npm start`)
- Linux launch: `./run.sh` (or `npm start`)
- test: `npm test` (runs ladder tests across L1 import, L2 units, L3 module, L4 e2e)
- capture live proof: `node tools/capture_proof.js`

## Limits

| Limit | What it means |
|---|---|
| `run.ps1` PROHIBITED | PowerShell launch scripts (`run.ps1`) are not permitted. Use `.\run.bat` on Windows, `./run.sh` on Linux, or `npm start`. |
| `electron` | Desktop windowing runtime on Windows 10/11 and Linux |
| Local filesystem & Cache | Large repos need fast scanning with `.gitignore` and default ignores (`node_modules`, `.git`, `dist`, etc.); remote repos are shallow-cached locally. |
| Private Repos | Requires GitHub token with `repo` scope to clone and list user private repositories |

## Sources of truth

- File scanner & Git parser → `src/main/services/gitService.js` and `src/main/services/fileService.js`
- Symbol & call hierarchy extractor → `src/main/services/symbolService.js`
- Diagram extraction & AST dependency resolver → `src/main/services/diagramService.js`
- GitHub remote cloning & authentication → `src/main/services/githubRemoteService.js`
- IPC contracts → `src/preload/preload.js`
- Symbols & Outline Controller → `src/renderer/js/outlineController.js`
- Frontend UI & Monaco/Canvas controller → `src/renderer/`

## Known problems

None yet.

## Dropped approaches

None yet.
