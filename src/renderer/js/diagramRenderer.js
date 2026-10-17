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

    // Helper to determine architectural tier (Left-to-Right Layering)
    const getArchitecturalRank = (clusterId, cNodes) => {
      const c = clusterId.toLowerCase();
      if (c === 'root' || c.includes('main') || c.includes('entry') || c.includes('cli') || c.includes('bin')) return 0;
      if (c.includes('renderer') || c.includes('component') || c.includes('page') || c.includes('view') || c.includes('ui') || c.includes('route')) return 1;
      if (c.includes('service') || c.includes('controller') || c.includes('handler') || c.includes('middleware') || c.includes('logic')) return 2;
      if (c.includes('model') || c.includes('type') || c.includes('util') || c.includes('helper') || c.includes('config') || c.includes('db') || c.includes('schema') || c.includes('test')) return 3;
      const roles = cNodes.map(n => n.role);
      if (roles.includes('entry')) return 0;
      if (roles.includes('component')) return 1;
      if (roles.includes('service')) return 2;
      return 2;
    };

    // Partition clusters into architectural rank columns (0: Entry -> 1: Views -> 2: Services -> 3: Utils/Data)
    const rankBuckets = [[], [], [], []];
    for (const [clusterId, cNodes] of clusterGroups.entries()) {
      const rank = getArchitecturalRank(clusterId, cNodes);
      rankBuckets[rank].push({ id: clusterId, nodes: cNodes });
    }

    // Active columns only (skip empty ranks so layout is compact)
    const activeColumns = rankBuckets
      .map((clustersInRank, rankIdx) => ({ rank: rankIdx, clusters: clustersInRank }))
      .filter(col => col.clusters.length > 0);

    const clusterLayouts = [];
    const padding = 12;
    const startX = 60;
    const startY = 50;
    const colWidth = 340;
    const colGapX = 50;

    let currentX = startX;

    for (const col of activeColumns) {
      // Multi-column clustering for widescreen 16:9 readability: wrap if > 3 clusters in rank
      const maxClustersPerCol = 3;
      const numSubCols = Math.ceil(col.clusters.length / maxClustersPerCol);

      for (let sc = 0; sc < numSubCols; sc++) {
        const subClusters = col.clusters.slice(sc * maxClustersPerCol, (sc + 1) * maxClustersPerCol);
        let currentY = startY;

        for (const cluster of subClusters) {
          const cNodes = cluster.nodes;
          // Multi-column files inside cluster if more than 3 files (drastically reduces height)
          const innerCols = cNodes.length > 3 ? 2 : 1;
          const innerNodeWidth = innerCols === 2 ? Math.floor((colWidth - padding * 2 - 10) / 2) : (colWidth - padding * 2);
          const nodeHeight = 30;
          const rows = Math.ceil(cNodes.length / innerCols);
          const cHeight = padding * 2 + 26 + rows * (nodeHeight + 8);

          const cx = currentX;
          const cy = currentY;

          const raw = cluster.id === 'root' ? '/' : cluster.id;
          const displayLabel = raw.length > 22 ? `📁 ...${raw.slice(-19)}` : `📁 ${raw}`;

          clusterLayouts.push({
            id: cluster.id,
            displayLabel,
            x: cx,
            y: cy,
            width: colWidth,
            height: cHeight,
            nodes: cNodes
          });

          // Position nodes inside cluster with strict grid offsets (ZERO OVERLAPPING GUARANTEED)
          cNodes.forEach((node, idx) => {
            const colIdx = idx % innerCols;
            const rowIdx = Math.floor(idx / innerCols);
            node.x = cx + padding + colIdx * (innerNodeWidth + 10);
            node.y = cy + padding + 26 + rowIdx * (nodeHeight + 8);
            node.width = innerNodeWidth;
            node.height = nodeHeight;
          });

          // Strict vertical spacing between clusters in the same column (ZERO OVERLAPPING GUARANTEED)
          currentY += cHeight + 30;
        }

        // Advance X for sub-column or main column
        currentX += colWidth + (sc < numSubCols - 1 ? 24 : colGapX);
      }
    }

    // Draw cluster boxes (GitDiagram Glassmorphism styling)
    const clusterG = this.zoomGroup.append('g').attr('class', 'clusters-layer');
    const clusterElements = clusterG.selectAll('.diagram-cluster-box')
      .data(clusterLayouts)
      .enter()
      .append('g')
      .attr('class', 'diagram-cluster-box');

    // Outer cluster card
    clusterElements.append('rect')
      .attr('class', 'diagram-cluster')
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('width', d => d.width)
      .attr('height', d => d.height);

    // Header background strip
    clusterElements.append('rect')
      .attr('class', 'diagram-cluster-header')
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('width', d => d.width)
      .attr('height', 24)
      .attr('rx', 10);

    // Folder Label (safe truncated so it never overlaps the files count badge)
    clusterElements.append('text')
      .attr('class', 'diagram-cluster-label')
      .attr('x', d => d.x + 12)
      .attr('y', d => d.y + 16)
      .text(d => d.displayLabel);

    // Files Count Badge
    clusterElements.append('text')
      .attr('class', 'diagram-cluster-count')
      .attr('x', d => d.x + d.width - 12)
      .attr('y', d => d.y + 16)
      .attr('text-anchor', 'end')
      .text(d => `${d.nodes.length} files`);

    // Draw links with clean, non-overlapping cubic bezier paths
    const linkG = this.zoomGroup.append('g').attr('class', 'links-layer');
    const nodeMap = new Map(filteredNodes.map(n => [n.id, n]));

    // Compute incoming count for each target in the active graph
    // Compute incoming count for each target in the active graph
    const targetInCounts = new Map();
    const targetIncomingLists = new Map();
    for (const l of filteredLinks) {
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      targetInCounts.set(tgtId, (targetInCounts.get(tgtId) || 0) + 1);
      if (!targetIncomingLists.has(tgtId)) targetIncomingLists.set(tgtId, []);
      targetIncomingLists.get(tgtId).push(l);
    }

    const targetSlotCounters = new Map();

    const linkPaths = linkG.selectAll('.diagram-link')
      .data(filteredLinks)
      .enter()
      .append('path')
      .attr('class', d => {
        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
        const tgtNode = nodeMap.get(tgtId);
        const inCount = Math.max(targetInCounts.get(tgtId) || 0, (tgtNode && tgtNode.inDegree) || 0);
        d._inCount = inCount;
        const weight = this.getLinkWeight(inCount);
        d._weight = weight;
        return `diagram-link ${weight.tierClass}`;
      })
      .style('--link-width', d => `${d._weight.width}px`)
      .style('stroke-width', d => `${d._weight.width}px`)
      .style('stroke', d => d._weight.stroke)
      .attr('stroke-width', d => d._weight.width)
      .attr('marker-end', d => `url(#${d._weight.markerId})`)
      .attr('d', d => {
        const src = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
        const tgt = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
        if (!src || !tgt) return '';

        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
        const totalIncoming = (targetIncomingLists.get(tgtId) || []).length;
        const slotIdx = targetSlotCounters.get(tgtId) || 0;
        targetSlotCounters.set(tgtId, slotIdx + 1);

        // Distribute entry slots along target height:
        const verticalSpread = Math.min(18, tgt.height * 0.65);
        const slotOffset = totalIncoming > 1
          ? ((slotIdx / (totalIncoming - 1)) - 0.5) * verticalSpread
          : 0;

        // Left-to-right connection
        if (src.x + src.width <= tgt.x) {
          const x1 = src.x + src.width;
          const y1 = src.y + src.height / 2;
          const x2 = tgt.x;
          const y2 = tgt.y + tgt.height / 2 + slotOffset;
          const dx = Math.max(30, (x2 - x1) * 0.45);
          return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        }

        // Right-to-left (feedback/backward) connection: route cleanly around without cutting across nodes
        if (src.x >= tgt.x + tgt.width) {
          const x1 = src.x;
          const y1 = src.y + src.height / 2;
          const x2 = tgt.x + tgt.width;
          const y2 = tgt.y + tgt.height / 2 + slotOffset;
          const dx = Math.max(40, (x1 - x2) * 0.35);
          const dy = (y2 - y1) * 0.25;
          return `M ${x1} ${y1} C ${x1 - dx} ${y1 - dy}, ${x2 + dx} ${y2 + dy}, ${x2} ${y2}`;
        }

        // Same column / vertical connection: clean side arc
        const x1 = src.x + src.width;
        const y1 = src.y + src.height / 2;
        const x2 = tgt.x + tgt.width;
        const y2 = tgt.y + tgt.height / 2 + slotOffset;
        const arcX = Math.max(x1, x2) + 25;
        return `M ${x1} ${y1} C ${arcX} ${y1}, ${arcX} ${y2}, ${x2} ${y2}`;
      })
      .on('mouseenter', (event, d) => {
        const src = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
        const tgt = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
        if (!src || !tgt) return;
        d3.select(event.currentTarget).classed('highlighted', true);
        if (this.tooltip) {
          const esc = typeof escapeHtml === 'function' ? escapeHtml : s => s;
          const count = d._inCount || 1;
          this.tooltip.innerHTML = `
            <div class="tooltip-title" style="color: #58a6ff;">🔗 Dependency Link</div>
            <div class="tooltip-row"><span>Source:</span> <code>${esc(src.relativePath)}</code></div>
            <div class="tooltip-row"><span>Target:</span> <code>${esc(tgt.relativePath)}</code></div>
            <div class="tooltip-row"><span>Target Inflow:</span> <strong>${count} incoming ${count === 1 ? 'file' : 'files'}</strong></div>
          `;
          this.tooltip.style.display = 'block';
          const rect = this.container.getBoundingClientRect();
          this.tooltip.style.left = `${event.clientX - rect.left + 15}px`;
          this.tooltip.style.top = `${event.clientY - rect.top + 15}px`;
        }
      })
      .on('mouseleave', (event) => {
        d3.select(event.currentTarget).classed('highlighted', false);
        this.hideTooltip();
      });

    // Draw nodes
    this.renderNodeElements(filteredNodes, linkPaths);

    if (this.diagramStats) {
      this.diagramStats.textContent = `Architecture: ${filteredNodes.length} files • ${clusterLayouts.length} clusters • ${filteredLinks.length} dependencies`;
    }

    this.fitToScreen();
  }

  /**
   * Mode 2: Dependency Flow (Topological DAG Layout - 100% Zero Overlap)
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

    // Topological Rank Partitioning (0: Entry -> 1: Views -> 2: Services -> 3: Utils/Leaves)
    const getDepRank = (node) => {
      if (node.role === 'entry' || node.inDegree === 0) return 0;
      if (node.role === 'component' || node.cluster.includes('renderer') || node.cluster.includes('component')) return 1;
      if (node.role === 'service' || node.cluster.includes('service')) return 2;
      return 3;
    };

    const rankBuckets = [[], [], [], []];
    for (const node of filteredNodes) {
      const rank = getDepRank(node);
      rankBuckets[rank].push(node);
    }

    const startX = 60;
    const startY = 60;
    const cardWidth = 175;
    const cardHeight = 32;
    const colGapX = 55;
    const rowGapY = 12;

    let currentX = startX;

    // Lay out each rank column with discrete, non-overlapping coordinates
    rankBuckets.forEach((rankNodes, rankIdx) => {
      if (rankNodes.length === 0) return;

      // If more than 9 nodes in a rank, split into 2 sub-columns for widescreen 16:9 layout
      const subCols = rankNodes.length > 9 ? 2 : 1;
      const nodesPerSubCol = Math.ceil(rankNodes.length / subCols);

      for (let sc = 0; sc < subCols; sc++) {
        const subList = rankNodes.slice(sc * nodesPerSubCol, (sc + 1) * nodesPerSubCol);

        subList.forEach((node, rowIdx) => {
          node.x = currentX;
          node.y = startY + rowIdx * (cardHeight + rowGapY);
          node.width = cardWidth;
          node.height = cardHeight;
        });

        currentX += cardWidth + (sc < subCols - 1 ? 16 : colGapX);
      }
    });

    // Links layer
    const linkG = this.zoomGroup.append('g').attr('class', 'links-layer');
    const nodeMap = new Map(filteredNodes.map(n => [n.id, n]));

    // Compute incoming count and lists for each target in the active graph
    const targetInCounts = new Map();
    const targetIncomingLists = new Map();
    for (const l of filteredLinks) {
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      targetInCounts.set(tgtId, (targetInCounts.get(tgtId) || 0) + 1);
      if (!targetIncomingLists.has(tgtId)) targetIncomingLists.set(tgtId, []);
      targetIncomingLists.get(tgtId).push(l);
    }

    const targetSlotCounters = new Map();

    const linkPaths = linkG.selectAll('.diagram-link')
      .data(filteredLinks)
      .enter()
      .append('path')
      .attr('class', d => {
        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
        const tgtNode = nodeMap.get(tgtId);
        const inCount = Math.max(targetInCounts.get(tgtId) || 0, (tgtNode && tgtNode.inDegree) || 0);
        d._inCount = inCount;
        const weight = this.getLinkWeight(inCount);
        d._weight = weight;
        return `diagram-link ${weight.tierClass}`;
      })
      .style('--link-width', d => `${d._weight.width}px`)
      .style('stroke-width', d => `${d._weight.width}px`)
      .style('stroke', d => d._weight.stroke)
      .attr('stroke-width', d => d._weight.width)
      .attr('marker-end', d => `url(#${d._weight.markerId})`)
      .attr('d', d => {
        const src = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
        const tgt = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
        if (!src || !tgt) return '';

        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
        const totalIncoming = (targetIncomingLists.get(tgtId) || []).length;
        const slotIdx = targetSlotCounters.get(tgtId) || 0;
        targetSlotCounters.set(tgtId, slotIdx + 1);

        const verticalSpread = Math.min(18, tgt.height * 0.65);
        const slotOffset = totalIncoming > 1
          ? ((slotIdx / (totalIncoming - 1)) - 0.5) * verticalSpread
          : 0;
        d._slotOffset = slotOffset;

        const x1 = src.x + src.width;
        const y1 = src.y + src.height / 2;
        const x2 = tgt.x;
        const y2 = tgt.y + tgt.height / 2 + slotOffset;

        if (x1 <= x2) {
          const dx = Math.max(25, (x2 - x1) * 0.45);
          return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        } else {
          const dx = Math.max(30, (x1 - x2) * 0.35);
          return `M ${src.x} ${y1} C ${src.x - dx} ${y1}, ${tgt.x + tgt.width + dx} ${y2}, ${tgt.x + tgt.width} ${y2}`;
        }
      })
      .on('mouseenter', (event, d) => {
        const src = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
        const tgt = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
        if (!src || !tgt) return;
        d3.select(event.currentTarget).classed('highlighted', true);
        if (this.tooltip) {
          const esc = typeof escapeHtml === 'function' ? escapeHtml : s => s;
          const count = d._inCount || 1;
          this.tooltip.innerHTML = `
            <div class="tooltip-title" style="color: #58a6ff;">🔗 Dependency Link</div>
            <div class="tooltip-row"><span>Source:</span> <code>${esc(src.relativePath)}</code></div>
            <div class="tooltip-row"><span>Target:</span> <code>${esc(tgt.relativePath)}</code></div>
            <div class="tooltip-row"><span>Target Inflow:</span> <strong>${count} incoming ${count === 1 ? 'file' : 'files'}</strong></div>
          `;
          this.tooltip.style.display = 'block';
          const rect = this.container.getBoundingClientRect();
          this.tooltip.style.left = `${event.clientX - rect.left + 15}px`;
          this.tooltip.style.top = `${event.clientY - rect.top + 15}px`;
        }
      })
      .on('mouseleave', (event) => {
        d3.select(event.currentTarget).classed('highlighted', false);
        this.hideTooltip();
      });

    // Nodes layer
    const nodeElements = this.renderNodeElements(filteredNodes, linkPaths, false);

    // Interactive Drag Support: Allows user to nudge nodes while keeping links connected
    nodeElements.call(d3.drag()
      .on('drag', (event, d) => {
        d.x = event.x;
        d.y = event.y;
        d3.select(event.sourceEvent.target.closest('.diagram-node'))
          .attr('transform', `translate(${d.x}, ${d.y})`);

        linkPaths.attr('d', l => {
          const src = nodeMap.get(typeof l.source === 'object' ? l.source.id : l.source);
          const tgt = nodeMap.get(typeof l.target === 'object' ? l.target.id : l.target);
          if (!src || !tgt) return '';
          const x1 = src.x + src.width;
          const y1 = src.y + src.height / 2;
          const x2 = tgt.x;
          const y2 = tgt.y + tgt.height / 2 + (l._slotOffset || 0);
          const dx = Math.max(25, Math.abs(x2 - x1) * 0.45);
          return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        });
      })
    );

    if (this.diagramStats) {
      this.diagramStats.textContent = `Dependency Flow: ${filteredNodes.length} nodes • ${filteredLinks.length} import connections`;
    }

    this.fitToScreen();
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
      if (parts.slice(0, -1).some(p => p.startsWith('.'))) continue;
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


    // Scope banner (File vs All)
    const scopeG = this.zoomGroup.append('g')
      .attr('class', 'symbol-scope-banner')
      .attr('transform', 'translate(60, 20)')
      .style('cursor', 'pointer');

    const scopeLabel = this.symbolScope === 'all'
      ? `Scope: Entire Repository (${nodes.length} symbols) • Click to focus active file`
      : `Scope: ${this.activeTargetRelPath || 'Active File'} (${nodes.length} symbols) • Click for repo-wide`;

    scopeG.append('rect')
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('width', Math.max(280, scopeLabel.length * 7.5))
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

    // Structure and lay out symbols with 100% MATHEMATICAL ZERO OVERLAP
    const symbolClusters = [];
    const padding = 12;
    const startX = 60;
    const startY = 68;

    if (this.symbolScope !== 'all') {
      // ACTIVE FILE SCOPE: Structured Blueprint Lanes (Classes -> Functions -> Variables)
      const classes = nodes.filter(n => n.kind === 'class' || n.kind === 'interface');
      const functions = nodes.filter(n => n.kind === 'function' || n.kind === 'method');
      const variables = nodes.filter(n => n.kind === 'variable' || n.kind === 'constant');

      let currentX = startX;

      // Lane 1: Classes & Interfaces (if any)
      if (classes.length > 0) {
        const cardWidth = 240;
        const cardHeight = 44;
        const rowGap = 12;
        const cWidth = cardWidth + padding * 2;
        const cHeight = padding * 2 + 24 + classes.length * (cardHeight + rowGap);

        symbolClusters.push({
          label: `📐 Classes & Interfaces`,
          count: classes.length,
          x: currentX,
          y: startY,
          width: cWidth,
          height: cHeight
        });

        classes.forEach((c, idx) => {
          c.width = cardWidth;
          c.height = cardHeight;
          c.x = currentX + padding;
          c.y = startY + padding + 22 + idx * (cardHeight + rowGap);
        });

        currentX += cWidth + 40;
      }

      // Lane 2: Functions & Callables (if any)
      if (functions.length > 0) {
        const cols = functions.length > 8 ? 2 : 1;
        const cardWidth = cols === 2 ? 220 : 260;
        const cardHeight = 42;
        const colGap = 12;
        const rowGap = 12;
        const rows = Math.ceil(functions.length / cols);
        const cWidth = padding * 2 + cols * cardWidth + (cols - 1) * colGap;
        const cHeight = padding * 2 + 24 + rows * (cardHeight + rowGap);

        symbolClusters.push({
          label: `ƒ Functions & Callables`,
          count: functions.length,
          x: currentX,
          y: startY,
          width: cWidth,
          height: cHeight
        });

        functions.forEach((f, idx) => {
          const cIdx = idx % cols;
          const rIdx = Math.floor(idx / cols);
          f.width = cardWidth;
          f.height = cardHeight;
          f.x = currentX + padding + cIdx * (cardWidth + colGap);
          f.y = startY + padding + 22 + rIdx * (cardHeight + rowGap);
        });

        currentX += cWidth + 40;
      }

      // Lane 3: Variables & Constants (Compact multi-column grid)
      if (variables.length > 0) {
        // Multi-column grid packing: up to 4 columns for large variable counts (guarantees widescreen 16:9 compactness)
        const cols = variables.length > 40 ? 4 : (variables.length > 20 ? 3 : (variables.length > 8 ? 2 : 1));
        const cardWidth = 150;
        const cardHeight = 30;
        const colGap = 10;
        const rowGap = 8;
        const rows = Math.ceil(variables.length / cols);
        const cWidth = padding * 2 + cols * cardWidth + (cols - 1) * colGap;
        const cHeight = padding * 2 + 24 + rows * (cardHeight + rowGap);

        symbolClusters.push({
          label: `📦 Scope Variables & Constants`,
          count: variables.length,
          x: currentX,
          y: startY,
          width: cWidth,
          height: cHeight
        });

        variables.forEach((v, idx) => {
          const cIdx = idx % cols;
          const rIdx = Math.floor(idx / cols);
          v.width = cardWidth;
          v.height = cardHeight;
          v.x = currentX + padding + cIdx * (cardWidth + colGap);
          v.y = startY + padding + 22 + rIdx * (cardHeight + rowGap);
        });

        currentX += cWidth + 40;
      }
    } else {
      // REPO-WIDE SCOPE: File-partitioned clusters across columns
      const fileGroups = new Map();
      for (const node of nodes) {
        const fileKey = node.relativePath;
        if (!fileGroups.has(fileKey)) fileGroups.set(fileKey, []);
        fileGroups.get(fileKey).push(node);
      }

      let currentX = startX;
      let currentY = startY;
      let colMaxX = startX;

      for (const [fileRel, fNodes] of fileGroups.entries()) {
        const funcs = fNodes.filter(n => n.kind === 'function' || n.kind === 'method' || n.kind === 'class');
        const vars = fNodes.filter(n => n.kind === 'variable' || n.kind === 'constant');

        const cardWidth = 180;
        const cardHeight = 32;
        const cols = (funcs.length > 0 && vars.length > 0) ? 2 : 1;
        const totalItems = Math.max(funcs.length, vars.length);
        const cWidth = padding * 2 + cols * cardWidth + (cols - 1) * 12;
        const cHeight = padding * 2 + 24 + totalItems * (cardHeight + 8);

        // If column gets too tall, wrap to next column
        if (currentY + cHeight > 950 && currentY > startY) {
          currentX = colMaxX + 40;
          currentY = startY;
        }

        const rawName = fileRel.split('/').pop();
        symbolClusters.push({
          label: `📁 ${rawName}`,
          count: fNodes.length,
          x: currentX,
          y: currentY,
          width: cWidth,
          height: cHeight
        });

        funcs.forEach((f, idx) => {
          f.width = cardWidth;
          f.height = cardHeight;
          f.x = currentX + padding;
          f.y = currentY + padding + 22 + idx * (cardHeight + 8);
        });

        vars.forEach((v, idx) => {
          v.width = cardWidth;
          v.height = cardHeight;
          v.x = currentX + padding + (cols === 2 ? (cardWidth + 12) : 0);
          v.y = currentY + padding + 22 + idx * (cardHeight + 8);
        });

        currentY += cHeight + 28;
        colMaxX = Math.max(colMaxX, currentX + cWidth);
      }
    }

    // Draw cluster container cards
    const clusterG = this.zoomGroup.append('g').attr('class', 'clusters-layer');
    const clusterElements = clusterG.selectAll('.diagram-cluster-box')
      .data(symbolClusters)
      .enter()
      .append('g')
      .attr('class', 'diagram-cluster-box');

    // Outer frosted box
    clusterElements.append('rect')
      .attr('class', 'diagram-cluster')
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('width', d => d.width)
      .attr('height', d => d.height);

    // Header strip
    clusterElements.append('rect')
      .attr('class', 'diagram-cluster-header')
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('width', d => d.width)
      .attr('height', 24)
      .attr('rx', 10);

    // Cluster label
    clusterElements.append('text')
      .attr('class', 'diagram-cluster-label')
      .attr('x', d => d.x + 12)
      .attr('y', d => d.y + 16)
      .text(d => d.label);

    // Count badge
    clusterElements.append('text')
      .attr('class', 'diagram-cluster-count')
      .attr('x', d => d.x + d.width - 12)
      .attr('y', d => d.y + 16)
      .attr('text-anchor', 'end')
      .text(d => `${d.count} symbols`);

    // Prepare link map
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

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Compute incoming count and arrival slots for symbols
    const targetInCounts = new Map();
    const targetIncomingLists = new Map();
    for (const l of activeLinks) {
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      targetInCounts.set(tgtId, (targetInCounts.get(tgtId) || 0) + 1);
      if (!targetIncomingLists.has(tgtId)) targetIncomingLists.set(tgtId, []);
      targetIncomingLists.get(tgtId).push(l);
    }

    const targetSlotCounters = new Map();
    for (const l of activeLinks) {
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      const tgtNode = nodeMap.get(tgtId);
      const totalIncoming = (targetIncomingLists.get(tgtId) || []).length;
      const slotIdx = targetSlotCounters.get(tgtId) || 0;
      targetSlotCounters.set(tgtId, slotIdx + 1);

      const verticalSpread = tgtNode ? Math.min(18, tgtNode.height * 0.65) : 12;
      l._slotOffset = totalIncoming > 1
        ? ((slotIdx / (totalIncoming - 1)) - 0.5) * verticalSpread
        : 0;
    }

    const computeCurvePath = (d) => {
      const src = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
      const tgt = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
      if (!src || !tgt) return '';

      const slotOffset = d._slotOffset || 0;
      const x1 = src.x + src.width;
      const y1 = src.y + src.height / 2;
      const x2 = tgt.x;
      const y2 = tgt.y + tgt.height / 2 + slotOffset;

      if (src.x + src.width <= tgt.x) {
        const dx = Math.max(25, (tgt.x - (src.x + src.width)) * 0.45);
        return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      } else if (src.x >= tgt.x + tgt.width) {
        const dx = Math.max(30, (src.x - (tgt.x + tgt.width)) * 0.45);
        return `M ${src.x} ${y1} C ${src.x - dx} ${y1}, ${tgt.x + tgt.width + dx} ${y2}, ${tgt.x + tgt.width} ${y2}`;
      } else {
        const arcX = Math.max(x1, tgt.x + tgt.width) + 24;
        return `M ${x1} ${y1} C ${arcX} ${y1}, ${arcX} ${y2}, ${tgt.x + tgt.width} ${y2}`;
      }
    };

    // Links layer
    const linkG = this.zoomGroup.append('g').attr('class', 'links-layer');
    const linkPaths = linkG.selectAll('.diagram-link')
      .data(activeLinks)
      .enter()
      .append('path')
      .attr('class', d => {
        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
        const count = targetInCounts.get(tgtId) || 1;
        d._inCount = count;
        const weight = this.getLinkWeight(count);
        d._weight = weight;
        return `diagram-link type-${d.type} ${d.type === 'contains' ? 'tier-normal' : weight.tierClass}`;
      })
      .style('--link-width', d => d.type === 'contains' ? '1.2px' : `${d._weight.width}px`)
      .style('stroke-width', d => d.type === 'contains' ? '1.2px' : `${d._weight.width}px`)
      .style('stroke', d => d.type === 'contains' ? '#a371f7' : d.type === 'inherits' ? '#3fb950' : d._weight.stroke)
      .attr('stroke-width', d => d.type === 'contains' ? 1.2 : d._weight.width)
      .attr('stroke', d => d.type === 'contains' ? '#a371f7' : d.type === 'inherits' ? '#3fb950' : d._weight.stroke)
      .attr('stroke-dasharray', d => d.type === 'contains' ? '4 3' : null)
      .attr('marker-end', d => {
        if (d.type === 'calls') {
          if (d._inCount >= 4) return 'url(#arrow-call-thick)';
          if (d._inCount >= 2) return 'url(#arrow-call-medium)';
          return 'url(#arrow-call)';
        }
        return d.type === 'inherits' ? 'url(#arrow-inherit)' : null;
      })
      .attr('d', d => computeCurvePath(d));

    // Nodes layer
    const nodeG = this.zoomGroup.append('g').attr('class', 'nodes-layer');
    const nodeSelection = nodeG.selectAll('.diagram-symbol-node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'diagram-node diagram-symbol-node')
      .attr('id', d => 'sym-' + d.id.replace(/[^a-zA-Z0-9_-]/g, '_'))
      .attr('transform', d => `translate(${d.x}, ${d.y})`);

    // Interactive Drag Support: Live curve recomputation
    nodeSelection.call(d3.drag()
      .on('drag', (event, d) => {
        d.x = event.x;
        d.y = event.y;
        d3.select(event.sourceEvent.target.closest('.diagram-symbol-node'))
          .attr('transform', `translate(${d.x}, ${d.y})`);
        linkPaths.attr('d', l => computeCurvePath(l));
      })
    );

    // Node card rect
    nodeSelection.append('rect')
      .attr('width', d => d.width)
      .attr('height', d => d.height)
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('fill', '#161b22')
      .attr('stroke', d => this.getSymbolKindColor(d.kind))
      .attr('stroke-width', d => d.kind === 'class' ? 2 : 1.3);

    // Left role/kind color accent bar
    nodeSelection.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 3.5)
      .attr('height', d => d.height)
      .attr('rx', 1.5)
      .attr('fill', d => this.getSymbolKindColor(d.kind));

    // Kind Badge Circle
    nodeSelection.append('circle')
      .attr('cx', 14)
      .attr('cy', d => d.height / 2)
      .attr('r', 7.5)
      .attr('fill', d => this.getSymbolKindColor(d.kind))
      .attr('opacity', 0.25);

    // Kind Badge Letter
    nodeSelection.append('text')
      .attr('x', 14)
      .attr('y', d => d.height / 2 + 3.5)
      .attr('text-anchor', 'middle')
      .attr('fill', d => this.getSymbolKindColor(d.kind))
      .attr('font-size', '9px')
      .attr('font-family', 'var(--font-mono)')
      .attr('font-weight', '700')
      .text(d => this.getSymbolBadge(d.kind));

    // Symbol Name
    nodeSelection.append('text')
      .attr('class', 'diagram-node-label')
      .attr('x', 26)
      .attr('y', d => d.height > 34 ? 17 : 15)
      .attr('font-weight', '600')
      .text(d => {
        const n = d.shortName || d.name;
        const maxLen = d.width > 200 ? 20 : 13;
        return n.length > maxLen ? n.substring(0, maxLen - 1) + '…' : n;
      });

    // Subtitle / Line badge
    nodeSelection.append('text')
      .attr('class', 'diagram-node-badge')
      .attr('x', 26)
      .attr('y', d => d.height > 34 ? 31 : 25)
      .text(d => {
        if (d.params) {
          const p = `(${d.params})`;
          return p.length > 20 ? p.substring(0, 19) + '…' : p;
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

    if (this.diagramStats) {
      this.diagramStats.textContent = `Symbols: ${symData.stats.totalSymbols} items • ${symData.stats.classes} classes • ${symData.stats.functions} funcs • ${symData.stats.variables} vars • ${symData.stats.calls} calls`;
    }

    this.fitToScreen();
  }

  showSymbolTooltip(event, d) {
    if (!this.tooltip) return;
    const esc = typeof escapeHtml === 'function' ? escapeHtml : str => str;
    this.tooltip.innerHTML = `
      <div class="tooltip-title" style="color: ${this.getSymbolKindColor(d.kind)};">${esc(d.kind ? d.kind.toUpperCase() : '')}: ${esc(d.name)}</div>
      <div class="tooltip-row"><span>File:</span> <code>${esc(d.relativePath)}</code></div>
      <div class="tooltip-row"><span>Line:</span> <strong>Line ${esc(d.line)}</strong></div>
      ${d.params ? `<div class="tooltip-row"><span>Params:</span> <code>(${esc(d.params)})</code></div>` : ''}
      ${d.superClass ? `<div class="tooltip-row"><span>Extends:</span> <span>${esc(d.superClass)}</span></div>` : ''}
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

  /**
   * Determine link styling, thickness, and marker based on the incoming traffic to the target file/symbol
   */
  getLinkWeight(inCount) {
    if (inCount <= 1) {
      return {
        width: 1.6,
        tierClass: 'tier-normal',
        markerId: 'arrow-import',
        isThick: false,
        stroke: 'rgba(240, 246, 252, 0.22)'
      };
    } else if (inCount === 2) {
      return {
        width: 4.5,
        tierClass: 'tier-medium',
        markerId: 'arrow-import-medium',
        isThick: true,
        stroke: 'rgba(88, 166, 255, 0.75)'
      };
    } else if (inCount === 3) {
      return {
        width: 7.5,
        tierClass: 'tier-high',
        markerId: 'arrow-import-high',
        isThick: true,
        stroke: '#58a6ff'
      };
    } else if (inCount === 4) {
      return {
        width: 10.5,
        tierClass: 'tier-very-high',
        markerId: 'arrow-import-thick',
        isThick: true,
        stroke: '#388bfd'
      };
    } else {
      // 5+ files going to this target: major architectural highway
      const dynamicWidth = Math.min(16.0, 10.5 + (inCount - 4) * 1.5);
      return {
        width: dynamicWidth,
        tierClass: 'tier-highway',
        markerId: 'arrow-import-highway',
        isThick: true,
        stroke: '#1f6feb'
      };
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
        <div class="legend-item" style="border-left: 1px solid var(--border-color); padding-left: 8px; display: flex; align-items: center; gap: 5px;" title="Thicker call lines indicate higher call frequency">
          <span style="display: inline-block; width: 12px; height: 1.5px; background: rgba(240, 246, 252, 0.4); border-radius: 1px;"></span>
          <span style="display: inline-block; width: 14px; height: 3.8px; background: #39c5bb; border-radius: 2px;"></span>
          <span style="font-size: 10px; color: var(--text-muted);">Thickness: Call Volume</span>
        </div>
      `;
    } else {
      legend.innerHTML = `
        <div class="legend-item"><span class="legend-dot" style="background: #e3b341;"></span><span>Entry</span></div>
        <div class="legend-item"><span class="legend-dot" style="background: #39c5bb;"></span><span>Component</span></div>
        <div class="legend-item"><span class="legend-dot" style="background: #a371f7;"></span><span>Service</span></div>
        <div class="legend-item"><span class="legend-dot" style="background: #58a6ff;"></span><span>TypeScript/JS</span></div>
        <div class="legend-item"><span class="legend-dot" style="background: #3fb950;"></span><span>Python/Go/Rust</span></div>
        <div class="legend-item" style="border-left: 1px solid var(--border-color); padding-left: 8px; display: flex; align-items: center; gap: 5px;" title="Lines become thicker when more files import the target">
          <span style="display: inline-block; width: 12px; height: 1.5px; background: rgba(240, 246, 252, 0.4); border-radius: 1px;"></span>
          <span style="display: inline-block; width: 14px; height: 4px; background: #58a6ff; border-radius: 2px;"></span>
          <span style="font-size: 10px; color: var(--text-muted);">Thickness: Inflow Traffic</span>
        </div>
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
      .attr('class', d => `diagram-node${d.inDegree >= 4 ? ' node-hub' : ''}`)
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
      .attr('class', 'node-card')
      .attr('width', d => d.width || 130)
      .attr('height', d => d.height || 28)
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('stroke', d => this.getRoleColor(d.role));

    // GitDiagram Left Role Color Accent Strip
    nodeSelection.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 3.5)
      .attr('height', d => d.height || 28)
      .attr('rx', 1.5)
      .attr('fill', d => this.getRoleColor(d.role));

    // Role color dot indicator
    nodeSelection.append('circle')
      .attr('cx', 12)
      .attr('cy', d => (d.height || 28) / 2)
      .attr('r', 3.5)
      .attr('fill', d => this.getRoleColor(d.role));

    // Node label
    nodeSelection.append('text')
      .attr('class', 'diagram-node-label')
      .attr('x', 22)
      .attr('y', d => (d.height || 28) > 30 ? 17 : 14)
      .text(d => {
        const maxLen = (d.width || 130) > 160 ? 22 : 13;
        return d.name.length > maxLen ? d.name.substring(0, maxLen - 1) + '…' : d.name;
      });

    // Line count badge / size + incoming traffic badge
    nodeSelection.append('text')
      .attr('class', 'diagram-node-badge')
      .attr('x', 22)
      .attr('y', d => (d.height || 28) > 30 ? 29 : 23)
      .text(d => {
        const sizeStr = d.lines ? d.lines + 'L' : (d.size / 1024).toFixed(1) + ' KB';
        return d.inDegree > 1 ? `${sizeStr} • ${d.inDegree} in` : sizeStr;
      });

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
    const esc = typeof escapeHtml === 'function' ? escapeHtml : str => str;
    this.tooltip.innerHTML = `
      <div class="tooltip-title">${esc(d.name)}</div>
      <div class="tooltip-row"><span>Path:</span> <code>${esc(d.relativePath)}</code></div>
      <div class="tooltip-row"><span>Role:</span> <strong>${esc(d.role)}</strong></div>
      <div class="tooltip-row"><span>Lines:</span> <span>${esc(d.lines || 'N/A')}</span></div>
      <div class="tooltip-row"><span>Dependencies:</span> <span>${esc(d.outDegree)} out, ${esc(d.inDegree)} in</span></div>
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
   * Select a node externally from File Explorer, Monaco tabs, or Search
   * Smoothly pans and centers the diagram camera on the selected file node
   */
  selectNodeByPath(relPath) {
    if (!relPath) return;
    const cleanPath = relPath.replace(/\\/g, '/');

    // In Symbols mode: if target is a different file, update activeTargetFile
    if (this.currentMode === 'sym') {
      if (this.activeTargetRelPath !== cleanPath) {
        const fileObj = this.flatFiles ? this.flatFiles.find(f => f.relativePath === cleanPath) : null;
        if (fileObj) {
          this.setActiveTargetFile(fileObj.path, cleanPath);
          return;
        }
      }
    }

    let targetNode = null;

    if (this.currentMode === 'tree') {
      // Tree mode uses hierarchy descendants
      this.zoomGroup.selectAll('.tree-node-item').each(function(d) {
        const match = d.data && d.data.fileNode && (d.data.fileNode.relativePath === cleanPath || d.data.fileNode.path === cleanPath);
        d3.select(this).classed('active', match);
        if (match && !targetNode) {
          targetNode = { x: d.y + 60, y: d.x + 60 };
        }
      });
    } else {
      // Architecture clusters, Import dependencies, or Git DAG
      this.zoomGroup.selectAll('.diagram-node').each(function(d) {
        const match = d.relativePath === cleanPath || d.id === cleanPath || (d.path && d.path.replace(/\\/g, '/') === cleanPath);
        d3.select(this)
          .classed('active', match)
          .classed('dimmed', !match);
        if (match && !targetNode) {
          targetNode = d;
        }
      });
    }

    // Camera moves with you: smoothly pan and center target node on the diagram
    if (targetNode && targetNode.x !== undefined && targetNode.y !== undefined) {
      const fullWidth = this.container.clientWidth;
      const fullHeight = this.container.clientHeight;

      const currentK = (this.svg.node() && d3.zoomTransform(this.svg.node()).k) || 1.15;
      const scale = Math.max(1.0, Math.min(1.35, currentK));

      const transform = d3.zoomIdentity
        .translate(fullWidth / 2 - targetNode.x * scale, fullHeight / 2 - targetNode.y * scale)
        .scale(scale);

      this.svg.transition()
        .duration(500)
        .ease(d3.easeCubicOut)
        .call(this.zoom.transform, transform);
    }
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

      const rawScale = 0.88 / Math.max((width + 40) / fullWidth, (height + 40) / fullHeight);
      const scale = Math.max(0.35, Math.min(1.15, rawScale));
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
