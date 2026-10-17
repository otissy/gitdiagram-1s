/**
 * GitDiagram 1s - Interactive Diagram Renderer
 * D3-powered architecture visualizer, AST dependency graphs, and Git DAG
 */

class DiagramRenderer {
  constructor() {
    this.container = document.getElementById('diagram-svg-container');
    this.svg = d3.select('#diagram-svg');
    this.zoomGroup = d3.select('#diagram-zoom-group');
    this.tooltip = document.getElementById('diagram-tooltip');
    this.depthText = document.getElementById('depth-value-text');
    this.depthSlider = document.getElementById('depth-range');
    this.searchInput = document.getElementById('diagram-search-input');
    this.diagramStats = document.getElementById('sb-diagram-info');

    this.currentMode = 'arch'; // 'arch' | 'dep' | 'tree' | 'git' | 'sym'
    this.currentData = null; // raw diagram data { nodes, links, clusters }
    this.gitData = null; // raw git log { commits, graph }
    this.symbolData = null;
    this.repoPath = null;
    this.flatFiles = [];
    this.activeTargetFile = null;
    this.activeTargetRelPath = null;
    this.symbolScope = 'file'; // 'file' | 'all'
    this.activeNodeId = null;
    this.maxDepth = 4;

    this.simulation = null;
    this.zoom = null;

    this.initZoom();
    this.bindEvents();
  }

  /**
   * Set up D3 Zoom & Pan
   */
  initZoom() {
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        this.zoomGroup.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);

    // Floating Zoom Controls
    document.getElementById('zoom-in').onclick = () => this.svg.transition().duration(250).call(this.zoom.scaleBy, 1.3);
    document.getElementById('zoom-out').onclick = () => this.svg.transition().duration(250).call(this.zoom.scaleBy, 0.75);
    document.getElementById('zoom-reset').onclick = () => this.svg.transition().duration(250).call(this.zoom.transform, d3.zoomIdentity);
    document.getElementById('zoom-fit').onclick = () => this.fitToScreen();
  }

  /**
   * Bind toolbar events
   */
  bindEvents() {
    // Mode Buttons
    const modeBtns = {
      'diag-mode-arch': 'arch',
      'diag-mode-dep': 'dep',
      'diag-mode-tree': 'tree',
      'diag-mode-git': 'git',
      'diag-mode-sym': 'sym'
    };

    for (const [btnId, mode] of Object.entries(modeBtns)) {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.onclick = () => {
          document.querySelectorAll('.diagram-mode-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.setMode(mode);
        };
      }
    }

    // Depth slider
    if (this.depthSlider) {
      this.depthSlider.oninput = (e) => {
        this.maxDepth = parseInt(e.target.value, 10);
        if (this.depthText) this.depthText.textContent = this.maxDepth;
        this.render();
      };
    }

    // Search input
    if (this.searchInput) {
      this.searchInput.oninput = (e) => {
        const query = e.target.value.trim().toLowerCase();
        this.filterNodesBySearch(query);
      };
    }

    // Export buttons
    document.getElementById('btn-export-svg').onclick = () => this.exportSvg();
    document.getElementById('btn-export-png').onclick = () => this.exportPng();
    document.getElementById('btn-export-mermaid').onclick = () => this.exportMermaid();
  }

  /**
   * Set active mode
   */
  setMode(mode) {
    this.currentMode = mode;
    document.querySelectorAll('.diagram-mode-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`diag-mode-${mode}`);
    if (btn) btn.classList.add('active');
    this.render();
  }

  /**
   * Load new repository diagram data
   */
  setData(diagramData, gitData = null, repoPath = null, flatFiles = []) {
    this.currentData = diagramData;
    this.gitData = gitData;
    if (repoPath) this.repoPath = repoPath;
    if (flatFiles && flatFiles.length > 0) this.flatFiles = flatFiles;
    this.render();
  }

  /**
   * Set active target file for deep symbol inspection
   */
  setActiveTargetFile(filePath, relPath) {
    this.activeTargetFile = filePath;
    this.activeTargetRelPath = relPath;
    if (this.currentMode === 'sym') {
      this.render();
    }
  }

  /**
   * Main render dispatcher
   */
  render() {
    if (this.simulation) {
      this.simulation.stop();
      this.simulation = null;
    }

    this.zoomGroup.selectAll('*').remove();

    if (this.currentMode === 'git') {
      this.updateLegend('git');
      this.renderGitCommitGraph();
      return;
    }

    if (this.currentMode === 'sym') {
      this.updateLegend('sym');
      this.renderSymbolCallGraph();
      return;
    }

    this.updateLegend('arch');

    if (!this.currentData || !this.currentData.nodes || this.currentData.nodes.length === 0) {
      this.renderEmptyState();
      return;
    }

    if (this.currentMode === 'arch') {
      this.renderArchitectureClusters();
    } else if (this.currentMode === 'dep') {
      this.renderDependencyFlow();
    } else if (this.currentMode === 'tree') {
      this.renderDirectoryTree();
    }
  }

  /**
   * Mode 1: Architecture Clusters (Folders as container boxes with file nodes inside)
   */
  renderArchitectureClusters() {
    const { nodes, links, clusters } = this.currentData;

    // Filter by depth
    const filteredNodes = nodes.filter(n => {
      const depth = n.cluster === 'root' ? 0 : n.cluster.split('/').length;
      return depth <= this.maxDepth;
    });

    const activeNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = links.filter(l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      return activeNodeIds.has(srcId) && activeNodeIds.has(tgtId);
    });

    // Group nodes by cluster
    const clusterGroups = new Map();
    for (const node of filteredNodes) {
      if (!clusterGroups.has(node.cluster)) {
        clusterGroups.set(node.cluster, []);
      }
      clusterGroups.get(node.cluster).push(node);
    }

    // Layout clusters in a multi-column grid
    const clusterLayouts = [];
    const nodeWidth = 140;
    const nodeHeight = 34;
    const padding = 16;
    let startX = 60;
    let startY = 60;
    let colHeight = 0;
    const colWidth = 200;

    let colIndex = 0;
    let rowIndex = 0;
    const maxCols = Math.max(2, Math.floor(this.container.clientWidth / (colWidth + 40)));

    for (const [clusterId, cNodes] of clusterGroups.entries()) {
      const cWidth = colWidth;
      const cHeight = padding * 2 + 20 + cNodes.length * (nodeHeight + 8);

      const cx = startX + (colIndex % maxCols) * (cWidth + 40);
      const cy = startY + Math.floor(colIndex / maxCols) * 360;

      clusterLayouts.push({
        id: clusterId,
        x: cx,
        y: cy,
        width: cWidth,
        height: cHeight,
        nodes: cNodes
      });

      // Position nodes inside cluster
      cNodes.forEach((node, idx) => {
        node.x = cx + padding;
        node.y = cy + padding + 22 + idx * (nodeHeight + 8);
        node.width = nodeWidth;
        node.height = nodeHeight;
      });

      colIndex++;
    }

    // Draw cluster boxes
    const clusterG = this.zoomGroup.append('g').attr('class', 'clusters-layer');
    const clusterElements = clusterG.selectAll('.diagram-cluster-box')
      .data(clusterLayouts)
      .enter()
      .append('g')
      .attr('class', 'diagram-cluster-box');

    clusterElements.append('rect')
      .attr('class', 'diagram-cluster')
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('width', d => d.width)
      .attr('height', d => d.height);

    clusterElements.append('text')
      .attr('class', 'diagram-cluster-label')
      .attr('x', d => d.x + 12)
      .attr('y', d => d.y + 18)
      .text(d => `📁 ${d.id === 'root' ? '/' : d.id} (${d.nodes.length})`);

    // Draw links
    const linkG = this.zoomGroup.append('g').attr('class', 'links-layer');
    const nodeMap = new Map(filteredNodes.map(n => [n.id, n]));

    const linkPaths = linkG.selectAll('.diagram-link')
      .data(filteredLinks)
      .enter()
      .append('path')
      .attr('class', 'diagram-link')
      .attr('marker-end', 'url(#arrow-import)')
      .attr('d', d => {
        const src = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
        const tgt = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
        if (!src || !tgt) return '';
        const x1 = src.x + src.width;
        const y1 = src.y + src.height / 2;
        const x2 = tgt.x;
        const y2 = tgt.y + tgt.height / 2;
        const dx = (x2 - x1) * 0.5;
        return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      });

    // Draw nodes
    this.renderNodeElements(filteredNodes, linkPaths);

    if (this.diagramStats) {
      this.diagramStats.textContent = `Architecture: ${filteredNodes.length} files • ${clusterLayouts.length} clusters • ${filteredLinks.length} dependencies`;
    }

    this.fitToScreen();
  }

  /**
   * Mode 2: Dependency Flow (D3 Force Simulation)
   */
  renderDependencyFlow() {
    const { nodes, links } = this.currentData;

    // Filter by depth
    const filteredNodes = nodes.filter(n => {
      const depth = n.cluster === 'root' ? 0 : n.cluster.split('/').length;
      return depth <= this.maxDepth;
    });

    const activeNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = links
      .filter(l => {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        return activeNodeIds.has(srcId) && activeNodeIds.has(tgtId);
      })
      .map(l => ({
        source: typeof l.source === 'object' ? l.source.id : l.source,
        target: typeof l.target === 'object' ? l.target.id : l.target
      }));

    // Setup force simulation
    const width = this.container.clientWidth || 900;
    const height = this.container.clientHeight || 700;

    this.simulation = d3.forceSimulation(filteredNodes)
      .force('link', d3.forceLink(filteredLinks).id(d => d.id).distance(110))
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    // Links layer
    const linkG = this.zoomGroup.append('g').attr('class', 'links-layer');
    const linkPaths = linkG.selectAll('.diagram-link')
      .data(filteredLinks)
      .enter()
      .append('path')
      .attr('class', 'diagram-link')
      .attr('marker-end', 'url(#arrow-import)');

    // Nodes layer
    const nodeElements = this.renderNodeElements(filteredNodes, linkPaths, true);

    this.simulation.on('tick', () => {
      linkPaths.attr('d', d => {
        const x1 = d.source.x;
        const y1 = d.source.y;
        const x2 = d.target.x;
        const y2 = d.target.y;
        return `M ${x1} ${y1} L ${x2} ${y2}`;
      });

      nodeElements.attr('transform', d => `translate(${d.x - 65}, ${d.y - 17})`);
    });

    if (this.diagramStats) {
      this.diagramStats.textContent = `Dependency Flow: ${filteredNodes.length} nodes • ${filteredLinks.length} import connections`;
    }

    setTimeout(() => this.fitToScreen(), 400);
  }

  /**
   * Mode 3: Directory Tree Hierarchy
   */
  renderDirectoryTree() {
    const { nodes } = this.currentData;

    // Build hierarchical tree structure from flat file paths
    const root = { name: '/', children: [] };
    const dirMap = new Map([['', root]]);

    for (const node of nodes) {
      const parts = node.relativePath.split('/');
      let currentPath = '';

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const nextPath = currentPath ? `${currentPath}/${part}` : part;
        if (!dirMap.has(nextPath)) {
          const dirNode = { name: part, children: [] };
          dirMap.get(currentPath).children.push(dirNode);
          dirMap.set(nextPath, dirNode);
        }
        currentPath = nextPath;
      }

      // Add file node
      dirMap.get(currentPath).children.push({
        name: parts[parts.length - 1],
        fileNode: node
      });
    }

    const hierarchy = d3.hierarchy(root);
    const treeLayout = d3.tree().nodeSize([45, 180]);
    treeLayout(hierarchy);

    // Links
    const linkG = this.zoomGroup.append('g').attr('class', 'links-layer');
    linkG.selectAll('.diagram-link')
      .data(hierarchy.links())
      .enter()
      .append('path')
      .attr('class', 'diagram-link')
      .attr('d', d3.linkHorizontal().x(d => d.y + 60).y(d => d.x + 60));

    // Nodes
    const nodeG = this.zoomGroup.append('g').attr('class', 'nodes-layer');
    const nodeElements = nodeG.selectAll('.tree-node-item')
      .data(hierarchy.descendants())
      .enter()
      .append('g')
      .attr('class', 'tree-node-item')
      .attr('transform', d => `translate(${d.y + 60}, ${d.x + 60})`)
      .style('cursor', 'pointer');

    nodeElements.append('circle')
      .attr('r', 6)
      .attr('fill', d => d.data.fileNode ? this.getRoleColor(d.data.fileNode.role) : '#8b949e');

    nodeElements.append('text')
      .attr('x', 12)
      .attr('y', 4)
      .attr('fill', '#f0f6fc')
      .attr('font-size', '11px')
      .attr('font-family', 'var(--font-ui)')
      .text(d => d.data.fileNode ? d.data.name : `📁 ${d.data.name}`);

    nodeElements.on('click', (event, d) => {
      if (d.data.fileNode) {
        window.monacoController.openFile(d.data.fileNode.path, d.data.fileNode.relativePath);
      }
    });

    if (this.diagramStats) {
      this.diagramStats.textContent = `Directory Tree: ${hierarchy.descendants().length} total nodes`;
    }

    this.fitToScreen();
  }

  /**
   * Mode 4: Git Branch & Commit DAG Visualizer
   */
  renderGitCommitGraph() {
    if (!this.gitData || !this.gitData.commits || this.gitData.commits.length === 0) {
      this.renderEmptyState('No git commit history available in this repository.');
      return;
    }

    const commits = this.gitData.commits;
    const nodeWidth = 260;
    const nodeHeight = 44;
    const startX = 100;
    let startY = 60;

    // Position commits vertically on timeline
    commits.forEach((c, i) => {
      c.x = startX;
      c.y = startY + i * (nodeHeight + 20);
      c.width = nodeWidth;
      c.height = nodeHeight;
    });

    const commitMap = new Map(commits.map(c => [c.hash, c]));

    // Draw parent connection lines
    const linkG = this.zoomGroup.append('g').attr('class', 'links-layer');
    for (const c of commits) {
      for (const pHash of c.parents) {
        const parent = commitMap.get(pHash);
        if (parent) {
          linkG.append('path')
            .attr('class', 'diagram-link')
            .attr('marker-end', 'url(#arrow-git)')
            .attr('stroke', '#3fb950')
            .attr('d', () => {
              const x1 = c.x + 20;
              const y1 = c.y + nodeHeight;
              const x2 = parent.x + 20;
              const y2 = parent.y;
              return `M ${x1} ${y1} L ${x2} ${y2}`;
            });
        }
      }
    }

    // Draw commit cards
    const nodeG = this.zoomGroup.append('g').attr('class', 'nodes-layer');
    const commitCards = nodeG.selectAll('.commit-card')
      .data(commits)
      .enter()
      .append('g')
      .attr('class', 'commit-card')
      .attr('transform', d => `translate(${d.x}, ${d.y})`)
      .style('cursor', 'pointer');

    commitCards.append('rect')
      .attr('width', nodeWidth)
      .attr('height', nodeHeight)
      .attr('rx', 6)
      .attr('fill', '#161b22')
      .attr('stroke', 'rgba(240, 246, 252, 0.15)')
      .attr('stroke-width', 1.5);

    // Commit dot indicator
    commitCards.append('circle')
      .attr('cx', 20)
      .attr('cy', nodeHeight / 2)
      .attr('r', 7)
      .attr('fill', '#2ea043')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.5);

    // Commit hash badge
    commitCards.append('text')
      .attr('x', 36)
      .attr('y', 18)
      .attr('fill', '#58a6ff')
      .attr('font-size', '10px')
      .attr('font-family', 'var(--font-mono)')
      .attr('font-weight', '600')
      .text(d => d.shortHash);

    // Commit message
    commitCards.append('text')
      .attr('x', 36)
      .attr('y', 33)
      .attr('fill', '#f0f6fc')
      .attr('font-size', '11px')
      .attr('font-family', 'var(--font-ui)')
      .text(d => d.message.length > 28 ? d.message.substring(0, 28) + '...' : d.message);

    // Author & Date
    commitCards.append('text')
      .attr('x', nodeWidth - 10)
      .attr('y', 18)
      .attr('text-anchor', 'end')
      .attr('fill', '#8b949e')
      .attr('font-size', '9px')
      .attr('font-family', 'var(--font-mono)')
      .text(d => d.date);

    commitCards.on('click', async (event, d) => {
      // Load commit diff
      if (window.gitController) {
        window.gitController.showCommitDetails(d);
      }
    });

    if (this.diagramStats) {
      this.diagramStats.textContent = `Git DAG: ${commits.length} commits rendered`;
    }

    this.fitToScreen();
  }

  /**
   * Mode 5: Deep Symbol & Call Graph (Classes, Functions, Methods, Variables, Interfaces)
   */
  async renderSymbolCallGraph() {
    // If no explicit target file is set, use current Monaco active tab
    if (!this.activeTargetFile && window.monacoController && window.monacoController.activeTab) {
      this.activeTargetFile = window.monacoController.activeTab.path;
      this.activeTargetRelPath = window.monacoController.activeTab.relativePath;
    }

    const target = this.symbolScope === 'all' ? null : this.activeTargetFile;

    // Show loading text
    const loadingG = this.zoomGroup.append('text')
      .attr('x', this.container.clientWidth / 2)
      .attr('y', this.container.clientHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#8b949e')
      .attr('font-size', '13px')
      .text('Extracting symbols and building call graph...');

    const symData = await window.api.generateSymbolDiagram(this.repoPath, target, this.flatFiles);
    loadingG.remove();

    if (!symData || !symData.nodes || symData.nodes.length === 0) {
      this.renderEmptyState('No defined symbols (classes, functions, variables) found. Select a source code file.');
      return;
    }

    this.symbolData = symData;

    // Filter nodes by depth / search if any
    const nodes = symData.nodes;
    const links = symData.links;

    // Setup force simulation
    const width = this.container.clientWidth || 900;
    const height = this.container.clientHeight || 700;

    // Layout configuration by kind
    nodes.forEach(n => {
      if (n.kind === 'class') {
        n.width = 180;
        n.height = 42;
      } else if (n.kind === 'method') {
        n.width = 160;
        n.height = 34;
      } else if (n.kind === 'function') {
        n.width = 170;
        n.height = 36;
      } else if (n.kind === 'interface') {
        n.width = 165;
        n.height = 36;
      } else {
        // variable or constant
        n.width = 145;
        n.height = 30;
      }
    });

    const activeNodeIds = new Set(nodes.map(n => n.id));
    const activeLinks = links
      .filter(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        return activeNodeIds.has(s) && activeNodeIds.has(t);
      })
      .map(l => ({
        source: typeof l.source === 'object' ? l.source.id : l.source,
        target: typeof l.target === 'object' ? l.target.id : l.target,
        type: l.type,
        line: l.line
      }));

    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(activeLinks).id(d => d.id).distance(d => d.type === 'contains' ? 65 : 120))
      .force('charge', d3.forceManyBody().strength(-320))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(45));

    // Scope banner (File vs All)
    const scopeG = this.zoomGroup.append('g')
      .attr('class', 'symbol-scope-banner')
      .attr('transform', 'translate(30, 30)')
      .style('cursor', 'pointer');

    const scopeLabel = this.symbolScope === 'all'
      ? `Scope: Entire Repository (${nodes.length} symbols) • Click to focus active file`
      : `Scope: ${this.activeTargetRelPath || 'Active File'} (${nodes.length} symbols) • Click for repo-wide`;

    scopeG.append('rect')
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('width', Math.max(260, scopeLabel.length * 7.5))
      .attr('height', 28)
      .attr('fill', '#161b22')
      .attr('stroke', '#388bfd')
      .attr('stroke-width', 1.2);

    scopeG.append('text')
      .attr('x', 12)
      .attr('y', 18)
      .attr('fill', '#58a6ff')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('font-family', 'var(--font-mono)')
      .text(scopeLabel);

    scopeG.on('click', () => {
      this.symbolScope = this.symbolScope === 'all' ? 'file' : 'all';
      this.render();
    });

    // Links layer
    const linkG = this.zoomGroup.append('g').attr('class', 'links-layer');
    const linkPaths = linkG.selectAll('.diagram-link')
      .data(activeLinks)
      .enter()
      .append('path')
      .attr('class', d => `diagram-link type-${d.type}`)
      .attr('stroke', d => d.type === 'contains' ? '#a371f7' : d.type === 'inherits' ? '#3fb950' : '#58a6ff')
      .attr('stroke-dasharray', d => d.type === 'contains' ? '4 3' : null)
      .attr('marker-end', d => d.type === 'calls' ? 'url(#arrow-call)' : d.type === 'inherits' ? 'url(#arrow-inherit)' : null);

    // Nodes layer
    const nodeG = this.zoomGroup.append('g').attr('class', 'nodes-layer');
    const nodeSelection = nodeG.selectAll('.diagram-symbol-node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'diagram-node diagram-symbol-node')
      .attr('id', d => 'sym-' + d.id.replace(/[^a-zA-Z0-9_-]/g, '_'));

    // Drag behavior
    nodeSelection.call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }));

    // Node card rect
    nodeSelection.append('rect')
      .attr('width', d => d.width)
      .attr('height', d => d.height)
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('fill', '#161b22')
      .attr('stroke', d => this.getSymbolKindColor(d.kind))
      .attr('stroke-width', d => d.kind === 'class' ? 2 : 1.5);

    // Kind Badge Circle
    nodeSelection.append('circle')
      .attr('cx', 16)
      .attr('cy', d => d.height / 2)
      .attr('r', 8)
      .attr('fill', d => this.getSymbolKindColor(d.kind))
      .attr('opacity', 0.25);

    // Kind Badge Letter
    nodeSelection.append('text')
      .attr('x', 16)
      .attr('y', d => d.height / 2 + 4)
      .attr('text-anchor', 'middle')
      .attr('fill', d => this.getSymbolKindColor(d.kind))
      .attr('font-size', '10px')
      .attr('font-family', 'var(--font-mono)')
      .attr('font-weight', '700')
      .text(d => this.getSymbolBadge(d.kind));

    // Symbol Name
    nodeSelection.append('text')
      .attr('class', 'diagram-node-label')
      .attr('x', 32)
      .attr('y', d => d.height > 34 ? 18 : 16)
      .attr('font-weight', '600')
      .text(d => {
        const n = d.shortName || d.name;
        return n.length > 16 ? n.substring(0, 15) + '…' : n;
      });

    // Subtitle / Line number badge
    nodeSelection.append('text')
      .attr('class', 'diagram-node-badge')
      .attr('x', 32)
      .attr('y', d => d.height > 34 ? 32 : 26)
      .text(d => {
        if (d.params) {
          const p = `(${d.params})`;
          return p.length > 16 ? p.substring(0, 15) + '…' : p;
        }
        return `Line ${d.line} • ${d.kind}`;
      });

    // Line Tag on right edge
    nodeSelection.append('text')
      .attr('x', d => d.width - 8)
      .attr('y', d => d.height / 2 + 3)
      .attr('text-anchor', 'end')
      .attr('fill', '#8b949e')
      .attr('font-size', '9px')
      .attr('font-family', 'var(--font-mono)')
      .text(d => `:${d.line}`);

    // Click handler -> Reveal line and jump in Monaco editor!
    nodeSelection.on('click', (event, d) => {
      this.activeNodeId = d.id;
      nodeSelection.classed('active', n => n.id === d.id);

      window.monacoController.openFileAndReveal(d.filePath, d.relativePath, d.line, d.name);

      if (window.outlineController) {
        window.outlineController.loadSymbols(d.filePath, d.relativePath);
      }
    });

    // Hover tooltip and highlight connections
    nodeSelection.on('mouseenter', (event, d) => {
      this.showSymbolTooltip(event, d);

      const incoming = new Set();
      const outgoing = new Set();

      linkPaths.each(l => {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        if (srcId === d.id) outgoing.add(tgtId);
        if (tgtId === d.id) incoming.add(srcId);
      });

      nodeSelection.classed('dimmed', n => n.id !== d.id && !incoming.has(n.id) && !outgoing.has(n.id));
      linkPaths.each(function(l) {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        const isOut = srcId === d.id;
        const isIn = tgtId === d.id;
        d3.select(this)
          .classed('outgoing', isOut)
          .classed('incoming', isIn)
          .classed('dimmed', !isOut && !isIn);
      });
    });

    nodeSelection.on('mouseleave', () => {
      this.hideTooltip();
      nodeSelection.classed('dimmed', false);
      linkPaths
        .classed('incoming', false)
        .classed('outgoing', false)
        .classed('dimmed', false);
    });

    // Tick layout
    this.simulation.on('tick', () => {
      linkPaths.attr('d', d => {
        const x1 = d.source.x;
        const y1 = d.source.y;
        const x2 = d.target.x;
        const y2 = d.target.y;
        return `M ${x1} ${y1} L ${x2} ${y2}`;
      });

      nodeSelection.attr('transform', d => `translate(${d.x - d.width / 2}, ${d.y - d.height / 2})`);
    });

    if (this.diagramStats) {
      this.diagramStats.textContent = `Symbols: ${symData.stats.totalSymbols} items • ${symData.stats.classes} classes • ${symData.stats.functions} funcs • ${symData.stats.variables} vars • ${symData.stats.calls} calls`;
    }

    setTimeout(() => this.fitToScreen(), 350);
  }

  showSymbolTooltip(event, d) {
    if (!this.tooltip) return;
    this.tooltip.innerHTML = `
      <div class="tooltip-title" style="color: ${this.getSymbolKindColor(d.kind)};">${d.kind.toUpperCase()}: ${d.name}</div>
      <div class="tooltip-row"><span>File:</span> <code>${d.relativePath}</code></div>
      <div class="tooltip-row"><span>Line:</span> <strong>Line ${d.line}</strong></div>
      ${d.params ? `<div class="tooltip-row"><span>Params:</span> <code>(${d.params})</code></div>` : ''}
      ${d.superClass ? `<div class="tooltip-row"><span>Extends:</span> <span>${d.superClass}</span></div>` : ''}
      <div class="tooltip-row" style="margin-top: 4px; font-size: 10px; color: var(--accent-blue);">Click to jump to line in Monaco Editor</div>
    `;
    this.tooltip.style.display = 'block';

    const rect = this.container.getBoundingClientRect();
    this.tooltip.style.left = `${event.clientX - rect.left + 15}px`;
    this.tooltip.style.top = `${event.clientY - rect.top + 15}px`;
  }

  getSymbolKindColor(kind) {
    switch (kind) {
      case 'class': return '#a371f7';
      case 'interface': return '#f778ba';
      case 'method': return '#39c5bb';
      case 'function': return '#3fb950';
      case 'variable': return '#ffa657';
      case 'constant': return '#e3b341';
      default: return '#58a6ff';
    }
  }

  getSymbolBadge(kind) {
    switch (kind) {
      case 'class': return 'C';
      case 'interface': return 'I';
      case 'method': return 'M';
      case 'function': return 'ƒ';
      case 'variable': return 'V';
      case 'constant': return 'K';
      default: return 'S';
    }
  }

  highlightSymbolNode(symbolName) {
    if (!symbolName) return;
    this.zoomGroup.selectAll('.diagram-symbol-node').each(function(d) {
      const match = d.name === symbolName || d.shortName === symbolName;
      d3.select(this)
        .classed('active', match)
        .classed('dimmed', !match);
    });
  }

  updateLegend(mode) {
    const legend = document.getElementById('diagram-legend');
    if (!legend) return;
    if (mode === 'sym') {
      legend.innerHTML = `
        <div class="legend-item"><span class="legend-dot" style="background: #a371f7;"></span><span>Class</span></div>
        <div class="legend-item"><span class="legend-dot" style="background: #39c5bb;"></span><span>Method</span></div>
        <div class="legend-item"><span class="legend-dot" style="background: #3fb950;"></span><span>Function</span></div>
        <div class="legend-item"><span class="legend-dot" style="background: #ffa657;"></span><span>Variable</span></div>
        <div class="legend-item"><span class="legend-dot" style="background: #f778ba;"></span><span>Interface</span></div>
      `;
    } else {
      legend.innerHTML = `
        <div class="legend-item"><span class="legend-dot" style="background: #e3b341;"></span><span>Entry</span></div>
        <div class="legend-item"><span class="legend-dot" style="background: #39c5bb;"></span><span>Component</span></div>
        <div class="legend-item"><span class="legend-dot" style="background: #a371f7;"></span><span>Service</span></div>
        <div class="legend-item"><span class="legend-dot" style="background: #58a6ff;"></span><span>TypeScript/JS</span></div>
        <div class="legend-item"><span class="legend-dot" style="background: #3fb950;"></span><span>Python/Go/Rust</span></div>
      `;
    }
  }

  /**
   * Helper to render node elements with badges and hover effects
   */
  renderNodeElements(nodes, linkSelection, isForce = false) {
    const nodeG = this.zoomGroup.append('g').attr('class', 'nodes-layer');

    const nodeSelection = nodeG.selectAll('.diagram-node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'diagram-node')
      .attr('id', d => 'node-' + d.id.replace(/[^a-zA-Z0-9_-]/g, '_'))
      .attr('transform', d => isForce ? `translate(0, 0)` : `translate(${d.x}, ${d.y})`);

    // Double click -> Drill down into symbols for this file!
    nodeSelection.on('dblclick', (event, d) => {
      event.stopPropagation();
      this.activeTargetFile = d.path;
      this.activeTargetRelPath = d.relativePath;
      const symBtn = document.getElementById('diag-mode-sym');
      if (symBtn) symBtn.click();
    });

    // Drag behavior for force layout
    if (isForce && this.simulation) {
      nodeSelection.call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) this.simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) this.simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));
    }

    // Node rectangle
    nodeSelection.append('rect')
      .attr('width', d => d.width || 130)
      .attr('height', d => d.height || 34)
      .attr('stroke', d => this.getRoleColor(d.role));

    // Role color dot
    nodeSelection.append('circle')
      .attr('cx', 12)
      .attr('cy', d => (d.height || 34) / 2)
      .attr('r', 4)
      .attr('fill', d => this.getRoleColor(d.role));

    // Node label
    nodeSelection.append('text')
      .attr('class', 'diagram-node-label')
      .attr('x', 24)
      .attr('y', 17)
      .text(d => d.name.length > 14 ? d.name.substring(0, 13) + '…' : d.name);

    // Line count badge
    nodeSelection.append('text')
      .attr('class', 'diagram-node-badge')
      .attr('x', 24)
      .attr('y', 29)
      .text(d => `${d.lines ? d.lines + ' lines' : (d.size / 1024).toFixed(1) + ' KB'}`);

    // Click handler -> Open file in Monaco!
    nodeSelection.on('click', (event, d) => {
      this.activeNodeId = d.id;
      nodeSelection.classed('active', n => n.id === d.id);
      window.monacoController.openFile(d.path, d.relativePath);

      // Notify file explorer to select this file
      if (window.fileExplorer) {
        window.fileExplorer.highlightFile(d.relativePath);
      }
    });

    // Hover tooltip and highlight connections
    nodeSelection.on('mouseenter', (event, d) => {
      this.showTooltip(event, d);

      // Highlight connections
      const incoming = new Set();
      const outgoing = new Set();

      linkSelection.each(l => {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        if (srcId === d.id) outgoing.add(tgtId);
        if (tgtId === d.id) incoming.add(srcId);
      });

      nodeSelection.classed('dimmed', n => n.id !== d.id && !incoming.has(n.id) && !outgoing.has(n.id));
      linkSelection.each(function(l) {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        const isOut = srcId === d.id;
        const isIn = tgtId === d.id;
        d3.select(this)
          .classed('outgoing', isOut)
          .classed('incoming', isIn)
          .classed('dimmed', !isOut && !isIn);
      });
    });

    nodeSelection.on('mouseleave', () => {
      this.hideTooltip();
      nodeSelection.classed('dimmed', false);
      linkSelection
        .classed('incoming', false)
        .classed('outgoing', false)
        .classed('dimmed', false);
    });

    return nodeSelection;
  }

  /**
   * Tooltip helper
   */
  showTooltip(event, d) {
    if (!this.tooltip) return;
    this.tooltip.innerHTML = `
      <div class="tooltip-title">${d.name}</div>
      <div class="tooltip-row"><span>Path:</span> <code>${d.relativePath}</code></div>
      <div class="tooltip-row"><span>Role:</span> <strong>${d.role}</strong></div>
      <div class="tooltip-row"><span>Lines:</span> <span>${d.lines || 'N/A'}</span></div>
      <div class="tooltip-row"><span>Dependencies:</span> <span>${d.outDegree} out, ${d.inDegree} in</span></div>
    `;
    this.tooltip.style.display = 'block';

    const rect = this.container.getBoundingClientRect();
    this.tooltip.style.left = `${event.clientX - rect.left + 15}px`;
    this.tooltip.style.top = `${event.clientY - rect.top + 15}px`;
  }

  hideTooltip() {
    if (this.tooltip) this.tooltip.style.display = 'none';
  }

  /**
   * Filter and highlight nodes by search query
   */
  filterNodesBySearch(query) {
    if (!query) {
      this.zoomGroup.selectAll('.diagram-node').classed('dimmed', false).classed('active', false);
      return;
    }

    let firstMatch = null;
    this.zoomGroup.selectAll('.diagram-node').each(function(d) {
      const match = d.name.toLowerCase().includes(query) || d.relativePath.toLowerCase().includes(query);
      d3.select(this)
        .classed('dimmed', !match)
        .classed('active', match);
      if (match && !firstMatch) firstMatch = d;
    });

    if (firstMatch && firstMatch.x !== undefined) {
      // Zoom to first match
      const transform = d3.zoomIdentity
        .translate(this.container.clientWidth / 2 - firstMatch.x, this.container.clientHeight / 2 - firstMatch.y)
        .scale(1.2);
      this.svg.transition().duration(400).call(this.zoom.transform, transform);
    }
  }

  /**
   * Select a node externally from File Explorer
   */
  selectNodeByPath(relPath) {
    this.zoomGroup.selectAll('.diagram-node').classed('active', d => d.relativePath === relPath);
  }

  /**
   * Color mapping by file role
   */
  getRoleColor(role) {
    switch (role) {
      case 'entry': return '#e3b341'; // Gold
      case 'component': return '#39c5bb'; // Cyan
      case 'service': return '#a371f7'; // Purple
      case 'model': return '#ffa657'; // Orange
      case 'utility': return '#58a6ff'; // Blue
      case 'test': return '#3fb950'; // Green
      case 'config': return '#d29922'; // Amber
      case 'style': return '#f778ba'; // Pink
      default: return '#8b949e'; // Grey
    }
  }

  /**
   * Fit diagram to screen
   */
  fitToScreen() {
    try {
      const bounds = this.zoomGroup.node().getBBox();
      if (!bounds || bounds.width === 0 || bounds.height === 0) return;

      const fullWidth = this.container.clientWidth;
      const fullHeight = this.container.clientHeight;
      const width = bounds.width;
      const height = bounds.height;
      const midX = bounds.x + width / 2;
      const midY = bounds.y + height / 2;

      const scale = 0.85 / Math.max(width / fullWidth, height / fullHeight);
      const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

      this.svg.transition().duration(400).call(
        this.zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
    } catch (e) {
      // Ignore initial render bounds check
    }
  }

  /**
   * Export diagram as SVG
   */
  async exportSvg() {
    const svgEl = document.getElementById('diagram-svg');
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgEl);

    // Inject styles
    source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
    const res = await window.api.saveExportFile('gitdiagram-architecture.svg', source, 'svg');
    if (res.success) {
      this.showToast('Diagram exported to SVG successfully!');
    }
  }

  /**
   * Export diagram as high-res PNG
   */
  async exportPng() {
    const svgEl = document.getElementById('diagram-svg');
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const bounds = this.zoomGroup.node().getBBox();

    const scale = 2; // Retina sharpness
    canvas.width = Math.max(1200, (bounds.width + 100) * scale);
    canvas.height = Math.max(800, (bounds.height + 100) * scale);

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = async () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/png');
      const res = await window.api.saveExportFile('gitdiagram-architecture.png', dataUrl, 'png');
      if (res.success) {
        this.showToast('Diagram exported to PNG successfully!');
      }
    };
    img.src = url;
  }

  /**
   * Copy Mermaid syntax to clipboard
   */
  async exportMermaid() {
    if (!this.currentData) return;
    const mermaidCode = await window.api.toMermaid(this.currentData);
    await navigator.clipboard.writeText(mermaidCode);
    this.showToast('Mermaid diagram copied to clipboard!');
  }

  /**
   * Show Toast notification
   */
  showToast(message) {
    const toast = document.getElementById('toast-notice');
    const toastMsg = document.getElementById('toast-message');
    if (toast && toastMsg) {
      toastMsg.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  }

  renderEmptyState(msg = 'Open a repository to visualize codebase architecture.') {
    this.zoomGroup.append('text')
      .attr('x', this.container.clientWidth / 2)
      .attr('y', this.container.clientHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#8b949e')
      .attr('font-size', '14px')
      .text(msg);
  }
}

window.diagramRenderer = new DiagramRenderer();
