/**
 * chart.js — ECharts 图表配置与渲染模块
 * 负责：图表初始化、各类型图表配置、节点样式、拖拽、高亮路径
 */

const ChartManager = {
    /** ECharts 实例 */
    instance: null,
    /** 当前图表容器 DOM */
    container: null,
    /** 当前布局模式：'auto' | 'manual' */
    layoutMode: 'auto',
    /** 手动布局活动标志（用于概念图） */
    _manualLayoutActive: false,
    /** 选中节点 ID */
    selectedNodeId: null,
    /** 悬浮节点 ID */
    hoveredNodeId: null,
    /** 高亮路径节点集合 */
    highlightedPathNodeIds: new Set(),

    /** 选中连线数据 */
    selectedEdge: null,

    // =============================================
    // 颜色与样式系统
    // =============================================
    COLORS: {
        start: { base: '#00d4aa', glow: 'rgba(0,212,170,0.5)' },
        end: { base: '#ff6b6b', glow: 'rgba(255,107,107,0.5)' },
        process: { base: '#4dabf7', glow: 'rgba(77,171,247,0.5)' },
        decision: { base: '#f9c74f', glow: 'rgba(249,199,79,0.5)' },
        branch: { base: '#a29bfe', glow: 'rgba(162,155,254,0.5)' },
        leaf: { base: '#74b9ff', glow: 'rgba(116,185,255,0.5)' },
        root: { base: '#00cec9', glow: 'rgba(0,206,201,0.5)' },
        cause: { base: '#fd79a8', glow: 'rgba(253,121,168,0.5)' },
        effect: { base: '#e17055', glow: 'rgba(225,112,85,0.6)' },
        root_cause: { base: '#d63031', glow: 'rgba(214,48,49,0.6)' },
        core: { base: '#00b894', glow: 'rgba(0,184,148,0.5)' },
        method: { base: '#0984e3', glow: 'rgba(9,132,227,0.5)' },
        tool: { base: '#6c5ce7', glow: 'rgba(108,92,231,0.5)' },
        goal: { base: '#e84393', glow: 'rgba(232,67,147,0.5)' },
        default: { base: '#4dabf7', glow: 'rgba(77,171,247,0.4)' }
    },

    GRADIENT_HIGH: ['#00d4aa', '#00b4d8'],
    GRADIENT_MED: ['#f9c74f', '#f77f00'],
    GRADIENT_LOW: ['#a29bfe', '#6c5ce7'],

    LINE_COLOR: 'rgba(100,160,220,0.55)',
    LINE_HIGHLIGHT: '#00d4aa',
    BG_COLOR: 'transparent',
    LABEL_COLOR: '#c8d6e5',

    // =============================================
    // 初始化
    // =============================================
    init(container) {
        this.container = container;
        this.instance = echarts.init(container, null, { renderer: 'canvas' });

        window.addEventListener('resize', () => {
            this.instance && this.instance.resize();
        });

        this.instance.on('click', (params) => {
            if (params.dataType === 'node') {
                this.selectedNodeId = params.data.id;
                this.selectedEdge = null;
                document.dispatchEvent(new CustomEvent('nodeSelected', { detail: params.data }));
            } else if (params.dataType === 'edge') {
                this.selectedNodeId = null;
                this.selectedEdge = params.data;
                document.dispatchEvent(new CustomEvent('edgeSelected', { detail: params.data }));
            } else {
                this.selectedNodeId = null;
                this.selectedEdge = null;
                document.dispatchEvent(new CustomEvent('nodeDeselected'));
            }
        });

        this.instance.on('dblclick', (params) => {
            if (params.dataType === 'node') {
                document.dispatchEvent(new CustomEvent('nodeDoubleClicked', { detail: params.data }));
            } else if (params.dataType === 'edge') {
                document.dispatchEvent(new CustomEvent('edgeDoubleClicked', { detail: params.data }));
            }
        });

        this.instance.on('mouseover', (params) => {
            if (params.dataType === 'node') {
                this.hoveredNodeId = params.data.id;
                document.dispatchEvent(new CustomEvent('nodeHovered', { detail: params.data }));
            }
        });

        this.instance.on('mouseout', (params) => {
            if (params.dataType === 'node') {
                this.hoveredNodeId = null;
                document.dispatchEvent(new CustomEvent('nodeUnhovered'));
            }
        });
    },

    // =============================================
    // 渲染图表
    // =============================================
    renderGraph(graphData) {
        if (!this.instance || !graphData) return;
        // 关键：将当前实例中的节点坐标同步回数据模型（保留手动拖拽后的位置）
        this._syncNodePositionsToData();
        this.highlightedPathNodeIds = new Set();
        this.selectedNodeId = null;

        let option;
        switch (graphData.type) {
            case 'tree':
                option = this._buildTreeOption(graphData);
                break;
            case 'causal':
                option = this._buildCausalOption(graphData);
                break;
            case 'concept':
                option = this._buildConceptOption(graphData, this._manualLayoutActive);
                break;
            case 'flowchart':
            default:
                option = this._buildFlowchartOption(graphData);
                break;
        }

        this.instance.setOption(option, { notMerge: true });
    },

    // =============================================
    // 流程图配置
    // =============================================
    _buildFlowchartOption(g) {
        const nodes = this._processNodes(g.nodes, g.activeDimension);
        const edges = this._processEdges(g.edges);
        return {
            backgroundColor: this.BG_COLOR,
            tooltip: this._buildTooltip(g),
            animationDuration: 800,
            series: [{
                type: 'graph',
                layout: 'none',
                data: nodes,
                links: edges,
                roam: true,
                draggable: true,
                label: { show: true, position: 'inside', color: '#fff', fontSize: 13, fontFamily: "'Noto Sans SC', sans-serif", fontWeight: 600 },
                lineStyle: { color: this.LINE_COLOR, width: 2, curveness: 0.15, opacity: 0.85 },
                edgeLabel: { show: true, fontSize: 11, color: 'rgba(200,214,229,0.8)', fontFamily: "'Noto Sans SC', sans-serif", formatter: params => params.data.label || '' },
                edgeSymbol: ['none', 'arrow'],
                edgeSymbolSize: [4, 10],
                emphasis: { focus: 'adjacency', lineStyle: { width: 3, color: this.LINE_HIGHLIGHT } }
            }]
        };
    },

    // =============================================
    // 树状图配置
    // =============================================
    _buildTreeOption(g) {
        const nodeMap = {};
        g.nodes.forEach(n => { nodeMap[n.id] = { ...n, children: [] }; });
        g.edges.forEach(e => {
            if (nodeMap[e.source] && nodeMap[e.target]) {
                nodeMap[e.source].children.push(nodeMap[e.target]);
            }
        });
        const hasParent = new Set(g.edges.map(e => e.target));
        const roots = g.nodes.filter(n => !hasParent.has(n.id));
        const rootNode = roots[0] ? nodeMap[roots[0].id] : nodeMap[g.nodes[0]?.id];

        const buildTreeNode = (node) => {
            const dim = g.activeDimension;
            const val = node.data?.[dim] || node.weight || 50;
            const color = this._getNodeColor(node.category);
            return {
                id: node.id, name: node.name, value: val,
                itemStyle: { color: color.base, borderColor: color.base, shadowColor: color.glow, shadowBlur: 12 },
                label: { color: '#fff', fontFamily: "'Noto Sans SC', sans-serif", fontWeight: 600, fontSize: 13 },
                tooltip: { formatter: () => this._formatTooltip(node, dim, val) },
                children: node.children.map(c => buildTreeNode(c))
            };
        };

        return {
            backgroundColor: this.BG_COLOR,
            tooltip: { trigger: 'item', backgroundColor: 'rgba(13,23,39,0.9)', borderColor: 'rgba(77,171,247,0.3)', textStyle: { color: '#c8d6e5' } },
            animationDuration: 900,
            series: [{
                type: 'tree',
                data: [buildTreeNode(rootNode)],
                top: '5%', left: '8%', bottom: '5%', right: '8%',
                symbolSize: 50, symbol: 'roundRect', orient: 'TB',
                expandAndCollapse: true, initialTreeDepth: 3,
                label: { position: 'inside', fontSize: 13, color: '#fff', fontFamily: "'Noto Sans SC', sans-serif", fontWeight: 600 },
                lineStyle: { color: this.LINE_COLOR, width: 2.5, curveness: 0.5 },
                leaves: { label: { position: 'inside' } },
                emphasis: { focus: 'ancestor', itemStyle: { borderWidth: 2 } },
                animationDurationUpdate: 750
            }]
        };
    },

    // =============================================
    // 因果图配置
    // =============================================
    _buildCausalOption(g) {
        const nodes = g.nodes.map(n => {
            const dim = g.activeDimension;
            const val = n.data?.[dim] || n.weight || 50;
            const color = this._getNodeColor(n.category);
            const size = 32 + (val / 100) * 28;
            return {
                id: n.id, name: n.name, value: val,
                x: n.x, y: n.y,
                symbolSize: size,
                symbol: n.category === 'effect' ? 'diamond' : 'roundRect',
                itemStyle: { color: color.base, borderColor: 'rgba(255,255,255,0.15)', borderWidth: 2, shadowColor: color.glow, shadowBlur: 20, opacity: 0.95 },
                label: { show: true, position: 'inside', color: '#fff', fontFamily: "'Noto Sans SC', sans-serif", fontWeight: 700, fontSize: 12 }
            };
        });
        const edges = g.edges.map(e => ({
            source: e.source, target: e.target, value: e.weight || 1,
            label: { show: !!e.label, formatter: e.label || '', color: 'rgba(200,214,229,0.75)', fontSize: 11, fontFamily: "'Noto Sans SC', sans-serif" },
            lineStyle: { color: this.LINE_COLOR, width: 2, curveness: 0.2, opacity: 0.8, type: 'solid' }
        }));
        return {
            backgroundColor: this.BG_COLOR,
            tooltip: this._buildTooltip(g),
            animationDuration: 800,
            series: [{
                type: 'graph', layout: 'none', data: nodes, links: edges, roam: true, draggable: true,
                focusNodeAdjacency: false, edgeSymbol: ['circle', 'arrow'], edgeSymbolSize: [4, 12],
                emphasis: { focus: 'adjacency', lineStyle: { width: 3.5, color: this.LINE_HIGHLIGHT } }
            }]
        };
    },

    // =============================================
    // 概念图（力导向/手动布局）配置
    // =============================================
    _buildConceptOption(g, isManualLayout = false) {
        const nodes = g.nodes.map(n => {
            const dim = g.activeDimension;
            const val = n.data?.[dim] || n.weight || 50;
            const color = this._getNodeColor(n.category);
            const size = 34 + (val / 100) * 26;
            return {
                id: n.id, name: n.name, value: val,
                x: n.x, y: n.y,
                symbolSize: size, symbol: 'roundRect',
                itemStyle: { color: color.base, borderColor: 'rgba(255,255,255,0.12)', borderWidth: 2, shadowColor: color.glow, shadowBlur: 18 },
                label: { show: true, position: 'inside', color: '#fff', fontFamily: "'Noto Sans SC', sans-serif", fontWeight: 600, fontSize: 12 }
            };
        });
        const edges = g.edges.map(e => ({
            source: e.source, target: e.target,
            label: { show: !!e.label, formatter: e.label || '', color: 'rgba(200,214,229,0.7)', fontSize: 11, fontFamily: "'Noto Sans SC', sans-serif" },
            lineStyle: { color: this.LINE_COLOR, width: 1.8, curveness: 0.2, opacity: 0.7 }
        }));
        const seriesConfig = {
            type: 'graph', layout: isManualLayout ? 'none' : 'force',
            data: nodes, links: edges, roam: true, draggable: true,
            focusNodeAdjacency: false, edgeSymbol: ['none', 'arrow'], edgeSymbolSize: [4, 9],
            emphasis: { focus: 'adjacency', lineStyle: { width: 3, color: this.LINE_HIGHLIGHT } }
        };
        if (!isManualLayout) {
            seriesConfig.force = { repulsion: 350, gravity: 0.12, edgeLength: [120, 280], friction: 0.6, layoutAnimation: true };
        }
        return {
            backgroundColor: this.BG_COLOR,
            tooltip: this._buildTooltip(g),
            animationDuration: isManualLayout ? 0 : 900,
            series: [seriesConfig]
        };
    },

    // =============================================
    // 路径高亮
    // =============================================
    highlightPaths(pathsNodeIds, topN = 3) {
        if (!this.instance) return;
        const option = this.instance.getOption();
        const series = option.series[0];
        if (!series || !series.data) return;
        const highlightSet = new Set();
        pathsNodeIds.slice(0, topN).forEach(pathIds => pathIds.forEach(id => highlightSet.add(id)));
        this.highlightedPathNodeIds = highlightSet;
        series.data = series.data.map(node => {
            const isHighlighted = highlightSet.has(node.id);
            return {
                ...node,
                itemStyle: {
                    ...node.itemStyle,
                    borderColor: isHighlighted ? '#00d4aa' : 'rgba(255,255,255,0.12)',
                    borderWidth: isHighlighted ? 3 : 2,
                    shadowBlur: isHighlighted ? 30 : 12
                }
            };
        });
        if (series.links) {
            series.links = series.links.map(link => {
                const isPathEdge = pathsNodeIds.slice(0, topN).some(pathIds => {
                    for (let i = 0; i < pathIds.length - 1; i++) {
                        if (pathIds[i] === link.source && pathIds[i + 1] === link.target) return true;
                    }
                    return false;
                });
                return {
                    ...link,
                    lineStyle: {
                        ...link.lineStyle,
                        color: isPathEdge ? this.LINE_HIGHLIGHT : this.LINE_COLOR,
                        width: isPathEdge ? 3.5 : 2,
                        opacity: isPathEdge ? 1 : 0.5
                    }
                };
            });
        }
        this.instance.setOption(option);
    },

    clearHighlight() {
        this.highlightedPathNodeIds = new Set();
        const graph = window.DataManager?.currentGraph;
        if (graph) this.renderGraph(graph);
    },

    // =============================================
    // 布局控制
    // =============================================
    autoLayout() {
        this._manualLayoutActive = false;
        this.layoutMode = 'auto';
        const graph = window.DataManager?.currentGraph;
        if (!graph) return;
        if (graph.type === 'concept') {
            this.renderGraph(graph);
        } else if (graph.type === 'flowchart' || graph.type === 'causal') {
            const newGraph = JSON.parse(JSON.stringify(graph));
            this._autoArrangeNodes(newGraph);
            this.renderGraph(newGraph);
        } else {
            this.renderGraph(graph);
        }
    },

    manualLayout() {
        this._manualLayoutActive = true;
        this.layoutMode = 'manual';
        this._syncNodePositionsToData();
        const graph = window.DataManager?.currentGraph;
        if (graph) this.renderGraph(graph);
    },

    _autoArrangeNodes(graph) {
        if (!graph.nodes.length) return;
        const inDegree = {};
        const adjList = {};
        graph.nodes.forEach(n => { inDegree[n.id] = 0; adjList[n.id] = []; });
        graph.edges.forEach(e => {
            inDegree[e.target] = (inDegree[e.target] || 0) + 1;
            if (adjList[e.source]) adjList[e.source].push(e.target);
        });
        const layers = [];
        const visited = new Set();
        let queue = graph.nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
        while (queue.length > 0) {
            layers.push([...queue]);
            queue.forEach(id => visited.add(id));
            const nextQueue = [];
            queue.forEach(id => {
                (adjList[id] || []).forEach(nid => {
                    if (!visited.has(nid)) {
                        inDegree[nid]--;
                        if (inDegree[nid] === 0) nextQueue.push(nid);
                    }
                });
            });
            queue = nextQueue;
        }
        graph.nodes.forEach(n => {
            if (!visited.has(n.id)) {
                if (!layers.last) layers.push([]);
                layers[layers.length - 1].push(n.id);
            }
        });
        const containerW = this.container?.clientWidth || 800;
        const layerH = Math.min(160, (this.container?.clientHeight || 600) / (layers.length || 1));
        const nodeMap = {};
        graph.nodes.forEach(n => { nodeMap[n.id] = n; });
        layers.forEach((layer, li) => {
            const totalW = containerW - 120;
            const step = layer.length > 1 ? totalW / (layer.length - 1) : 0;
            const startX = 80;
            layer.forEach((id, ni) => {
                if (nodeMap[id]) {
                    nodeMap[id].x = layer.length === 1 ? containerW / 2 : startX + ni * step;
                    nodeMap[id].y = 80 + li * layerH;
                }
            });
        });
    },

    // =============================================
    // 图表导出
    // =============================================
    getImageDataURL() {
        if (!this.instance) return '';
        return this.instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#0d1117' });
    },

    resize() {
        this.instance?.resize();
    },

    // =============================================
    // 节点/边处理函数
    // =============================================
    _processNodes(nodes, activeDimension) {
        return nodes.map(n => {
            const val = n.data?.[activeDimension] || n.weight || 50;
            const color = this._getNodeColor(n.category);
            const size = n.category === 'decision' ? 60 : 52 + (val / 100) * 20;
            return {
                id: n.id, name: n.name, value: val, x: n.x, y: n.y,
                symbolSize: n.category === 'decision' ? [80, 52] : [Math.max(size, 60), 44],
                symbol: n.category === 'decision' ? 'diamond' : n.category === 'start' ? 'roundRect' : 'roundRect',
                itemStyle: { color: color.base, borderColor: 'rgba(255,255,255,0.15)', borderWidth: 2, shadowColor: color.glow, shadowBlur: 15, opacity: 0.95 },
                category: n.category, description: n.description || '', weight: n.weight, data: n.data || {}
            };
        });
    },

    _processEdges(edges) {
        return edges.map(e => ({
            source: e.source, target: e.target, label: e.label || '', value: e.weight || 1,
            lineStyle: { color: this.LINE_COLOR, width: 2, curveness: 0.15, opacity: 0.85 }
        }));
    },

    _getNodeColor(category) {
        return this.COLORS[category] || this.COLORS.default;
    },

    _buildTooltip(g) {
        return {
            trigger: 'item',
            backgroundColor: 'rgba(13,23,39,0.92)',
            borderColor: 'rgba(77,171,247,0.3)',
            borderWidth: 1,
            padding: [12, 16],
            textStyle: { color: '#c8d6e5', fontFamily: "'Noto Sans SC', sans-serif" },
            formatter: (params) => {
                if (params.dataType !== 'node') return '';
                const node = params.data;
                const dim = g.activeDimension;
                const val = node.data?.[dim] || node.value || 0;
                return this._formatTooltip(node, dim, val);
            }
        };
    },

    _formatTooltip(node, dim, val) {
        return `
      <div style="font-weight:700;font-size:14px;color:#fff;margin-bottom:6px">${node.name}</div>
      ${node.description ? `<div style="color:#a0b4c8;font-size:12px;margin-bottom:8px">${node.description}</div>` : ''}
      <div style="color:#4dabf7;font-size:13px">
        ${dim}：<strong style="color:#00d4aa">${val}</strong>
      </div>
      ${node.weight ? `<div style="color:#a0b4c8;font-size:11px;margin-top:4px">权重：${node.weight}</div>` : ''}
    `;
    },

    // =============================================
    // 坐标同步辅助方法（修复版）
    // =============================================
    _syncNodePositionsToData() {
        if (!this.instance) return;
        try {
            const option = this.instance.getOption();
            // 关键修复：如果 option 不存在或没有 series，直接返回
            if (!option || !option.series || !option.series[0]) return;
            const series = option.series[0];
            if (!series.data) return;
            const graph = window.DataManager?.currentGraph;
            if (!graph || !graph.nodes) return;
            const chartNodes = series.data;
            chartNodes.forEach(chartNode => {
                const node = graph.nodes.find(n => n.id === chartNode.id);
                if (node && typeof chartNode.x === 'number' && typeof chartNode.y === 'number') {
                    node.x = chartNode.x;
                    node.y = chartNode.y;
                }
            });
        } catch (e) {
            console.warn('坐标同步失败', e);
        }
    }
};

window.ChartManager = ChartManager;