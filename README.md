# GitDiagram 1s

> **The Windows & Linux Native Desktop Code & Architecture Visualizer**  
> Bringing the best of **GitHub1s** (instant Monaco code exploration, file tree, git status & diffs) and **GitDiagram** (interactive codebase architecture & dependency graphs, synchronized navigation, AST import analysis, SVG/Mermaid export) into a single unified desktop app that works 100% offline on any local folder or Git repository.

---

## Highlights

- ⚡ **Instant Offline Code Exploration (GitHub1s Engine)**
  - Embedded **Monaco Editor** with VS Code Dark Modern theme.
  - Multi-tab management, breadcrumbs navigation, minimap, syntax highlighting for 40+ programming languages.
  - Side-by-side and inline **Git Diff Editor** for working copy changes and commit history.
  - Media & binary preview for images, SVGs, audio, and documents.
  - Recursive file explorer with expand/collapse, file icons, line counts, and real-time git status indicators (`M`, `A`, `D`, `U`).

- 📦 **Interactive Codebase Architecture (GitDiagram Engine)**
  - **Architecture Clusters**: Visual directory/module container boxes grouping related files with live statistics.
  - **Dependency Flow**: Interactive D3 force-directed graph tracking AST `import`, `require`, and `use` specifiers across JS/TS, Python, Go, Rust, C++, C#, Java, etc.
  - **Directory Tree**: Hierarchical radial/indented tree layout.
  - **Git Commit DAG**: Visual commit history graph showing branch pointers, parent-child commit linkages, and commit metadata.
  - **Synchronized Navigation**: Clicking any node in the diagram instantly opens that file in Monaco Editor! Navigating in the file tree automatically selects and highlights the node in the diagram.
  - **One-Click Exports**: Export vector diagram as SVG, high-resolution PNG (2x retina), or copy Mermaid diagram syntax to your clipboard.

- 🔒 **Security Hardened & Safe**
  - Strict path traversal prevention and null-byte injection blocking.
  - Electron context isolation with strictly typed IPC channels (`nodeIntegration: false`, `contextIsolation: true`).
  - No remote network dependencies — 100% offline-first.

- 💻 **Cross-Platform: Windows Native & Linux**
  - Custom frameless title bar with Windows controls, repository breadcrumb, branch switcher, and quick file search (`Ctrl+P`).
  - Native launch scripts: `run.bat` for Windows and `run.sh` for Linux.

---

## Quick Start

### Windows
Double-click `run.bat` or run:
```powershell
npm start
```

### Linux
```bash
chmod +x run.sh
./run.sh
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+O` | Open local folder or Git repository |
| `Ctrl+P` | Quick search files across the repository |
| `Ctrl+R` | Refresh repository & redraw diagram |
| `Ctrl+B` | Toggle sidebar collapse |
| `Ctrl+Shift+E` | Focus File Explorer |
| `Ctrl+Shift+G` | Focus Git Source Control & Diffs |

---

## Test Ladder

Run the complete test ladder covering L1 Import, L2 Unit, L3 Module, and L4 End-to-End:
```bash
npm test
```
