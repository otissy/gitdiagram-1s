# PROJECT.md — GitDiagram 1s (Desktop Git & Codebase Architecture Visualizer)

The map of the ground. Read before any task; update at the end of every task.

## Current state

GitDiagram 1s is a Windows native desktop application combining the fast, comprehensive code-reading experience of GitHub1s (Monaco Editor, file explorer, tabs, git commit diffs) with the visual intelligence of GitDiagram (interactive codebase architecture diagrams, module dependency graphs, AST import links, SVG/Mermaid export). It operates 100% offline on any local folder or Git repository with drag-and-drop, native folder pickers, and synchronized code-and-diagram exploration.

## How to run and test

- run: `npm start` (or `.\run.bat`)
- test: `npm test` (runs ladder tests across L1 import, L2 units, L3 module, L4 e2e)
- build / package: `npm run package`

## Limits

| Limit | What it means |
|---|---|
| `electron` | Standard desktop windowing runtime on Windows 10/11 |
| Local filesystem | Large repos need fast scanning with `.gitignore` and default ignore (`node_modules`, `.git`, `dist`, etc.) |
| Offline / No-cloud | 100% local operation: Monaco editor assets and diagram renderers must be bundled locally |

## Sources of truth

- File scanner & Git parser → `src/main/services/gitService.js` and `src/main/services/fileService.js`
- Diagram extraction & AST dependency resolver → `src/main/services/diagramService.js`
- IPC contracts → `src/preload/preload.js`
- Frontend UI & Monaco/Canvas controller → `src/renderer/`

## Known problems

None yet.

## Dropped approaches

None yet.
