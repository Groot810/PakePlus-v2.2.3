/**
 * interaction.js — 交互逻辑模块
 * 负责：批注 UI、右侧面板渲染、路径分析展示、维度切换、导入/导出触发
 */

const InteractionManager = {
  currentUser: localStorage.getItem('cognitive_viz_user') || '访客',
  annotationEditingId: null,

  // =============================================
  // 初始化
  // =============================================
  init() {
    this._checkLogin();
    this._bindGlobalEvents();
    this._bindToolbarEvents();
    this._bindSidebarEvents();
    this._bindImportExportEvents();
    this._renderAnnotationPanel();
    this._renderSavedGraphsPanel();
  },

  // =============================================
  // 登录与用户状态
  // =============================================
  _checkLogin() {
    const user = localStorage.getItem('cognitive_viz_user');
    if (!user) {
      document.getElementById('login-modal').classList.add('open');
      document.getElementById('login-username').focus();
      
      const loginBtn = document.getElementById('btn-login-start');
      const input = document.getElementById('login-username');
      
      const doLogin = () => {
        const name = input.value.trim();
        if (name) {
          localStorage.setItem('cognitive_viz_user', name);
          this.currentUser = name;
          document.getElementById('login-modal').classList.remove('open');
          this._updateUserUI();
          this._showToast(`欢迎回来，${name}`);
        }
      };

      loginBtn.onclick = doLogin;
      input.onkeypress = (e) => { if (e.key === 'Enter') doLogin(); };
    } else {
      this.currentUser = user;
      this._updateUserUI();
    }
  },

  _updateUserUI() {
    const el = document.querySelector('.collab-text');
    if (el) el.textContent = `在线 · ${this.currentUser}`;
    
    // 更新评论区当前用户
    const commentUser = document.querySelector('.comment-user');
    if (commentUser) commentUser.textContent = this.currentUser;

    // 绑定退出按钮
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.onclick = () => {
        if (confirm('确定要退出并清除本次操作的所有数据吗？')) {
          localStorage.removeItem('cognitive_viz_user');
          localStorage.removeItem('cognitive_viz_data');
          location.reload();
        }
      };
    }
  },

  // =============================================
  // 全局事件监听
  // =============================================
  _bindGlobalEvents() {
    // 节点被点击 → 更新右侧节点信息区
    document.addEventListener('nodeSelected', (e) => {
      this._updateNodeInfoPanel(e.detail);
      this._highlightNodeAnnotations(e.detail.id);
    });

    // 连线被点击
    document.addEventListener('edgeSelected', (e) => {
      this._updateEdgeInfoPanel(e.detail);
    });

    document.addEventListener('nodeDeselected', () => {
      this._clearNodeInfoPanel();
    });

    document.addEventListener('nodeHovered', (e) => {
      this._showNodeTooltipBadge(e.detail);
    });

    document.addEventListener('nodeUnhovered', () => {
      this._hideNodeTooltipBadge();
    });

    // 双击画布元素直接编辑
    document.addEventListener('nodeDoubleClicked', (e) => {
      this._renameNode(e.detail.id);
    });

    document.addEventListener('edgeDoubleClicked', (e) => {
      this._editEdgeLabel(e.detail.source, e.detail.target);
    });
  },

  // =============================================
  // 顶部工具栏
  // =============================================
  _bindToolbarEvents() {
    // 图表类型切换
    document.querySelectorAll('[data-chart-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.chartType;
        document.querySelectorAll('[data-chart-type]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._showLoading();
        setTimeout(() => {
          const graphData = DataManager.switchGraphType(type);
          ChartManager.renderGraph(graphData);
          this._updateDimensionSelector(graphData.dimensions, graphData.activeDimension);
          this._renderAnnotationPanel();
          this._clearAnalysisPanel();
          this._hideLoading();
        }, 400);
      });
    });

    // 布局切换
    document.getElementById('btn-auto-layout')?.addEventListener('click', () => {
      document.getElementById('btn-auto-layout').classList.add('active');
      document.getElementById('btn-manual-layout').classList.remove('active');
      ChartManager.autoLayout();
      this._showToast('已切换为自动布局');
    });

    document.getElementById('btn-manual-layout')?.addEventListener('click', () => {
      document.getElementById('btn-manual-layout').classList.add('active');
      document.getElementById('btn-auto-layout').classList.remove('active');
      ChartManager.manualLayout();
      this._showToast('已切换为手动布局，可自由拖拽节点');
    });

    // 导出按钮组
    document.getElementById('btn-export-png')?.addEventListener('click', () => {
      const dataURL = ChartManager.getImageDataURL();
      DataManager.exportPNG(dataURL);
      this._showToast('图片已导出');
    });

    document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
      const chartEl = document.getElementById('chart-container');
      this._showLoading('正在生成 PDF...');
      await DataManager.exportPDF(chartEl);
      this._hideLoading();
      this._showToast('PDF 已导出');
    });

    document.getElementById('btn-export-excel')?.addEventListener('click', () => {
      DataManager.exportExcel();
      this._showToast('Excel 已导出');
    });

    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      DataManager.exportCSV();
      this._showToast('CSV 已导出');
    });
  },

  // =============================================
  // 左侧面板事件
  // =============================================
  _bindSidebarEvents() {
    // 1. 节点/连线详情面板按钮事件委托
    const infoPanel = document.getElementById('node-info-panel');
    if (infoPanel) {
      infoPanel.addEventListener('click', (e) => {
        const target = e.target;
        
        // 添加批注
        const btnAddAnn = target.closest('.btn-add-annotation');
        if (btnAddAnn) {
          const { nodeId, nodeName } = btnAddAnn.dataset;
          this._openAnnotationForm(nodeId, nodeName);
          return;
        }

        // 分析路径
        const btnAnalyze = target.closest('.btn-analyze-node');
        if (btnAnalyze) {
          const { nodeId } = btnAnalyze.dataset;
          this._runPathAnalysis(nodeId);
          return;
        }

        // 编辑连线标签
        const btnEditEdge = target.closest('.btn-edit-edge-label');
        if (btnEditEdge) {
          const { source, target: targetNode } = btnEditEdge.dataset;
          console.log('[DEBUG] Edge Edit Clicked:', { source, targetNode });
          this._editEdgeLabel(source, targetNode);
          return;
        }

        // 删除连线
        const btnDelEdge = target.closest('.btn-delete-edge');
        if (btnDelEdge) {
          const { source, target: targetNode } = btnDelEdge.dataset;
          this._deleteEdge(source, targetNode);
          return;
        }
      });
    }

    // 2. 已保存图表点击
    const savedList = document.getElementById('saved-graphs-list');
    if (savedList) {
      savedList.addEventListener('click', (e) => {
        // 删除按钮
        if (e.target.closest('.saved-graph-btn.delete')) {
          e.stopPropagation();
          const item = e.target.closest('.saved-graph-item');
          if (item && confirm('确定删除此图表？')) {
            const graphId = item.dataset.graphId;
            DataManager.deleteGraph(graphId);
            this._renderSavedGraphsPanel();
            this._showToast('图表已删除');
          }
          return;
        }

        // 重命名按钮
        if (e.target.closest('.saved-graph-btn.rename')) {
          e.stopPropagation();
          const item = e.target.closest('.saved-graph-item');
          if (item) {
            const graphId = item.dataset.graphId;
            const oldName = item.querySelector('.saved-graph-name').textContent;
            const newName = prompt('请输入新图表名称：', oldName);
            if (newName && newName.trim() && newName !== oldName) {
              const success = DataManager.renameGraph(graphId, newName.trim());
              if (success) {
                this._renderSavedGraphsPanel();
                this._showToast('图表已重命名');
              } else {
                this._showToast('重命名失败', 'error');
              }
            }
          }
          return;
        }
        
        // 加载图表
        const item = e.target.closest('.saved-graph-item');
        if (!item) return;
        const graphId = item.dataset.graphId;
        
        this._showLoading('正在加载图表...');
        setTimeout(() => {
          const graph = DataManager.loadGraph(graphId);
          if (graph) {
            ChartManager.renderGraph(graph);
            this._updateDimensionSelector(graph.dimensions, graph.activeDimension);
            this._clearAnalysisPanel();
            this._renderSavedGraphsPanel(); // 更新选中状态
            this._showToast(`已加载图表：${graph.name}`);
          }
          this._hideLoading();
        }, 300);
      });
    }

    // 模板点击 —— 使用事件委托，绑定在父容器上
    const templateGrid = document.getElementById('template-grid');
    if (templateGrid) {
      templateGrid.addEventListener('click', (e) => {
        const card = e.target.closest('[data-template-id]');
        if (!card) return;
        const tplId = card.dataset.templateId;
        
        // 空白图表 - 弹出创建框
        if (tplId === '__blank') {
          this._openCreateGraphModal();
          return;
        }

        document.querySelectorAll('[data-template-id]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this._showLoading('正在加载模板...');
        setTimeout(() => {
          const graphData = DataManager.createFromTemplate(tplId) || DataManager.currentGraph;
          ChartManager.renderGraph(graphData);
          this._updateDimensionSelector(graphData.dimensions, graphData.activeDimension);
          this._clearAnalysisPanel();
          this._renderSavedGraphsPanel();
          this._hideLoading();
          this._showToast(`已加载模板：${card.querySelector('.tpl-name')?.textContent || tplId}`);
        }, 500);
      });
    }

    // 绑定创建图表模态框事件
    document.getElementById('cgm-confirm')?.addEventListener('click', () => {
      const name = document.getElementById('cgm-name').value.trim() || '未命名图表';
      
      this._showLoading('正在创建图表...');
      const graphData = DataManager.createEmptyGraph(name);
      ChartManager.renderGraph(graphData);
      this._updateDimensionSelector(graphData.dimensions, graphData.activeDimension);
      this._clearAnalysisPanel();
      this._renderSavedGraphsPanel();
      
      document.getElementById('create-graph-modal').classList.remove('open');
      this._hideLoading();
      this._showToast('已创建新图表');
    });

    document.getElementById('cgm-cancel')?.addEventListener('click', () => {
      document.getElementById('create-graph-modal').classList.remove('open');
    });

    // =========================================
    // 节点编辑工具箱
    // =========================================

    // 节点类型 chip 快速添加
    document.querySelectorAll('[data-add-type]').forEach(chip => {
      chip.addEventListener('click', () => {
        this._openNodeCreateModal(chip.dataset.addType);
      });
    });

    // 节点创建对话框 —— 确认
    document.getElementById('ncm-confirm')?.addEventListener('click', () => {
      const name = document.getElementById('ncm-name')?.value.trim();
      if (!name) { this._showToast('请输入节点名称', 'warning'); return; }
      const desc = document.getElementById('ncm-desc')?.value.trim() || '';
      const weight = parseInt(document.getElementById('ncm-weight')?.value) || 50;
      const dimName = document.getElementById('ncm-dimension')?.value.trim() || '默认';
      const type = document.getElementById('node-create-modal')?.dataset.pendingType || 'process';
      this._addNodeToGraph(name, desc, weight, type, dimName);
      document.getElementById('node-create-modal')?.classList.remove('open');
    });

    // 节点创建对话框 —— 取消
    document.getElementById('ncm-cancel')?.addEventListener('click', () => {
      document.getElementById('node-create-modal')?.classList.remove('open');
    });

    // 连接两个节点按钮
    document.getElementById('btn-connect-nodes')?.addEventListener('click', () => {
      this._toggleConnectMode();
    });

    // 删除选中节点按钮
    document.getElementById('btn-delete-node')?.addEventListener('click', () => {
      this._deleteSelectedNode();
    });

    // 连接模式下节点选中监听
    document.addEventListener('nodeSelected', (e) => {
      if (this._connectMode) {
        this._handleConnectNodeSelect(e.detail.id, e.detail.name);
      }
    });

    // 维度切换
    document.getElementById('dimension-selector')?.addEventListener('change', (e) => {
      const dim = e.target.value;
      if (DataManager.currentGraph) {
        DataManager.currentGraph.activeDimension = dim;
        ChartManager.renderGraph(DataManager.currentGraph);
        this._showToast(`维度已切换为：${dim}`);
      }
    });

    // 维度编辑按钮
    document.getElementById('btn-add-dim')?.addEventListener('click', () => {
      const name = prompt('请输入新维度名称（例如：成本、风险、工时）：');
      if (name && name.trim()) {
        const success = DataManager.addDimension(name.trim());
        if (success) {
          const graph = DataManager.currentGraph;
          // 自动切换到新维度
          graph.activeDimension = name.trim();
          this._updateDimensionSelector(graph.dimensions, graph.activeDimension);
          ChartManager.renderGraph(graph);
          this._showToast(`已添加维度：${name.trim()}`);
        } else {
          this._showToast('添加失败，可能名称已存在', 'warning');
        }
      }
    });

    document.getElementById('btn-edit-dim')?.addEventListener('click', () => {
      const graph = DataManager.currentGraph;
      if (!graph) return;
      const oldName = graph.activeDimension;
      const newName = prompt(`重命名维度 "${oldName}" 为：`, oldName);
      if (newName && newName.trim() && newName !== oldName) {
        const success = DataManager.renameDimension(oldName, newName.trim());
        if (success) {
          this._updateDimensionSelector(graph.dimensions, graph.activeDimension);
          ChartManager.renderGraph(graph); // 刷新图表（可能影响节点大小等）
          this._showToast(`维度已重命名为：${newName.trim()}`);
        } else {
          this._showToast('重命名失败，可能名称已存在', 'warning');
        }
      }
    });

    document.getElementById('btn-del-dim')?.addEventListener('click', () => {
      const graph = DataManager.currentGraph;
      if (!graph) return;
      const name = graph.activeDimension;
      if (graph.dimensions.length <= 1) {
        this._showToast('至少保留一个维度', 'warning');
        return;
      }
      if (confirm(`确定删除维度 "${name}" 及其所有数据吗？此操作不可恢复。`)) {
        const success = DataManager.deleteDimension(name);
        if (success) {
          this._updateDimensionSelector(graph.dimensions, graph.activeDimension);
          ChartManager.renderGraph(graph);
          this._showToast(`维度 "${name}" 已删除`);
        } else {
          this._showToast('删除失败', 'error');
        }
      }
    });

    // 分析影响按钮
    document.getElementById('btn-analyze')?.addEventListener('click', () => {
      if (!ChartManager.selectedNodeId) {
        this._showToast('请先在图表中点击选择一个节点', 'warning');
        return;
      }
      this._runPathAnalysis(ChartManager.selectedNodeId);
    });

    // 3. 批注模态框事件 (初始化一次即可)
    const annModal = document.getElementById('annotation-modal');
    if (annModal) {
      document.getElementById('ann-modal-confirm')?.addEventListener('click', () => {
        const nodeId = annModal.dataset.targetNodeId;
        const text = document.getElementById('ann-modal-input').value.trim();
        if (!text) { this._showToast('请输入批注内容', 'warning'); return; }
        DataManager.addAnnotation(nodeId, text, this.currentUser);
        annModal.classList.remove('open');
        this._renderAnnotationPanel();
        this._showToast('批注已添加');
      });

      document.getElementById('ann-modal-cancel')?.addEventListener('click', () => {
        annModal.classList.remove('open');
      });
    }
  },

  // =========================================
  // 节点工具箱辅助方法
  // =========================================

  _connectMode: false,
  _connectSourceId: null,
  _connectSourceName: null,

  _openCreateGraphModal() {
    const modal = document.getElementById('create-graph-modal');
    if (!modal) return;
    document.getElementById('cgm-name').value = '新建图表';
    modal.classList.add('open');
    setTimeout(() => document.getElementById('cgm-name')?.focus(), 100);
  },

  /** 打开节点创建对话框 */
  _openNodeCreateModal(type) {
    const modal = document.getElementById('node-create-modal');
    if (!modal) return;
    const labels = {
      process: '流程', decision: '决策', start: '起始', end: '终止',
      cause: '原因', effect: '结果', branch: '分支', leaf: '叶子',
      root: '根', core: '核心', method: '方法', tool: '工具', goal: '目标'
    };
    document.getElementById('ncm-type-label').textContent = labels[type] || type;
    document.getElementById('ncm-name').value = '';
    document.getElementById('ncm-desc').value = '';
    // 默认使用当前维度
    const graph = DataManager.currentGraph;
    document.getElementById('ncm-dimension').value = graph?.activeDimension || '默认';
    document.getElementById('ncm-weight').value = '50';
    modal.dataset.pendingType = type;
    modal.classList.add('open');
    setTimeout(() => document.getElementById('ncm-name')?.focus(), 100);
  },

  /** 添加新节点到当前图表并重新渲染 */
  _addNodeToGraph(name, desc, weight, category, dimName) {
    const graph = DataManager.currentGraph;
    if (!graph) { this._showToast('请先选择或新建一个图表', 'warning'); return; }
    if (graph.nodes.find(n => n.name === name)) {
      this._showToast(`节点"${name}"已存在，请换一个名称`, 'warning');
      return;
    }

    // 处理新维度
    if (dimName && !graph.dimensions.includes(dimName)) {
      graph.dimensions.push(dimName);
      graph.activeDimension = dimName;
      this._updateDimensionSelector(graph.dimensions, graph.activeDimension);
      this._showToast(`新增数据维度：${dimName}`);
    } else if (dimName) {
      // 切换到选择的维度（如果是现有维度）
      if (graph.activeDimension !== dimName) {
        graph.activeDimension = dimName;
        this._updateDimensionSelector(graph.dimensions, graph.activeDimension);
      }
    }
    
    const activeDim = graph.activeDimension || '默认';

    const containerW = document.getElementById('chart-el')?.clientWidth || 800;
    const containerH = document.getElementById('chart-el')?.clientHeight || 600;
    const margin = 120;
    const newNode = {
      id: `n_${Date.now()}`,
      name, description: desc, weight, category,
      x: margin + Math.random() * (containerW - margin * 2),
      y: margin + Math.random() * (containerH - margin * 2),
      data: { [activeDim]: weight }
    };
    graph.nodes.push(newNode);
    ChartManager.renderGraph(graph);
    this._showToast(`✅ 已添加节点：${name}`);
  },

  /** 切换连接模式 */
  _toggleConnectMode() {
    const btn = document.getElementById('btn-connect-nodes');
    if (this._connectMode) {
      this._connectMode = false;
      this._connectSourceId = null;
      this._connectSourceName = null;
      if (btn) {
        btn.classList.remove('connect-mode');
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><line x1="10.5" y1="10.5" x2="15.5" y2="7.5"/></svg> 连接两个节点`;
      }
      this._showToast('已退出连接模式');
    } else {
      this._connectMode = true;
      this._connectSourceId = null;
      this._connectSourceName = null;
      if (btn) {
        btn.classList.add('connect-mode');
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><line x1="10.5" y1="10.5" x2="15.5" y2="7.5"/></svg> 连接中（再次点击取消）`;
      }
      this._showToast('🔗 请点击第一个节点作为起点', 'warning');
    }
  },

  /** 连接模式中处理节点点击 */
  _handleConnectNodeSelect(nodeId, nodeName) {
    if (!this._connectSourceId) {
      this._connectSourceId = nodeId;
      this._connectSourceName = nodeName;
      this._showToast(`起点：${nodeName}，请再点击目标节点`, 'warning');
    } else {
      if (nodeId === this._connectSourceId) {
        this._showToast('不能连接同一节点', 'warning');
        return;
      }
      const graph = DataManager.currentGraph;
      const exists = graph.edges.find(e => e.source === this._connectSourceId && e.target === nodeId);
      if (exists) {
        this._showToast('该方向连线已存在', 'warning');
        this._connectSourceId = null;
        return;
      }
      graph.edges.push({ id: `e_${Date.now()}`, source: this._connectSourceId, target: nodeId, label: '', weight: 1.0 });
      ChartManager.renderGraph(graph);
      this._showToast(`✅ 已连接：${this._connectSourceName} → ${nodeName}`);
      this._toggleConnectMode();
    }
  },

  /** 删除当前选中节点及其所有相关连线 */
  _deleteSelectedNode() {
    const nodeId = ChartManager.selectedNodeId;
    if (!nodeId) { this._showToast('请先点击图表中的节点以选中', 'warning'); return; }
    const graph = DataManager.currentGraph;
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return;
    if (!confirm(`确定删除节点"${node.name}"及其所有连线？`)) return;
    graph.nodes = graph.nodes.filter(n => n.id !== nodeId);
    graph.edges = graph.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    ChartManager.selectedNodeId = null;
    ChartManager.renderGraph(graph);
    this._clearNodeInfoPanel();
    this._showToast(`已删除节点：${node.name}`);
  },

  /** 编辑连线标签 */
  _editEdgeLabel(source, target) {
    const graph = DataManager.currentGraph;
    const edge = graph.edges.find(e => e.source === source && e.target === target);
    if (!edge) return;
    const newLabel = prompt('输入连线文字（留空则清除）：', edge.label || '');
    if (newLabel !== null) {
      edge.label = newLabel.trim();
      ChartManager.renderGraph(graph);
      this._updateEdgeInfoPanel({ source, target, label: edge.label, value: edge.weight });
      this._showToast('连线标签已更新');
    }
  },

  /** 重命名节点 */
  _renameNode(nodeId) {
    const graph = DataManager.currentGraph;
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newName = prompt('重命名节点：', node.name || '');
    if (newName && newName.trim() && newName !== node.name) {
      node.name = newName.trim();
      ChartManager.renderGraph(graph);
      this._updateNodeInfoPanel(node);
      this._showToast('节点名称已更新');
    }
  },

  /** 删除连线 */
  _deleteEdge(source, target) {
    if (!confirm('确定删除这条连线？')) return;
    const graph = DataManager.currentGraph;
    graph.edges = graph.edges.filter(e => !(e.source === source && e.target === target));
    ChartManager.selectedEdge = null;
    ChartManager.renderGraph(graph);
    this._clearNodeInfoPanel();
    this._showToast('连线已删除');
  },



  // =============================================
  // 导入/导出事件
  // =============================================
  _bindImportExportEvents() {
    // 保存本地 (LocalStorage)
    document.getElementById('btn-save')?.addEventListener('click', () => {
      const success = DataManager.saveToLocalStorage();
      if (success) {
        this._showToast('✅ 当前图表已成功保存到左侧“已保存图表”库');
        this._renderSavedGraphsPanel();
      } else {
        this._showToast('❌ 保存失败，请检查浏览器存储限制', 'warning');
      }
    });

    const fileInput = document.getElementById('import-file-input');
    const importBtn = document.getElementById('btn-import');

    importBtn?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      this._showLoading(`正在导入 ${file.name}...`);
      try {
        const graphData = await DataManager.importFile(file);
        ChartManager.renderGraph(graphData);
        this._updateDimensionSelector(graphData.dimensions, graphData.activeDimension);
        this._clearAnalysisPanel();
        this._showToast(`成功导入：${file.name}`);
      } catch (err) {
        this._showToast(err.message, 'error');
      } finally {
        this._hideLoading();
        fileInput.value = '';
      }
    });
  },

  _deleteComment(id) {
    if (confirm('确定删除此评论？')) {
      const item = document.querySelector(`.comment-item[data-id="${id}"]`);
      if (item) item.remove();
      this._showToast('评论已删除');
    }
  },

  // =============================================
  // 右侧面板
  // =============================================

  /**
   * 当前选中节点信息展示
   */
  _updateNodeInfoPanel(nodeData) {
    const panel = document.getElementById('node-info-panel');
    if (!panel) return;
    const graph = DataManager.currentGraph;
    const dim = graph?.activeDimension || '默认';
    const val = nodeData.data?.[dim] !== undefined ? nodeData.data[dim] :
      (nodeData.value !== undefined ? nodeData.value : (nodeData.weight || '-'));

    panel.innerHTML = `
      <div class="node-info-header">
        <span class="node-info-badge ${nodeData.category || 'default'}">${this._getCategoryLabel(nodeData.category)}</span>
        <h3 class="node-info-name">${nodeData.name}</h3>
      </div>
      ${nodeData.description ? `<p class="node-info-desc">${nodeData.description}</p>` : ''}
      <div class="node-info-stats">
        <div class="stat-item">
          <span class="stat-label">${dim}</span>
          <span class="stat-value">${val}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">权重</span>
          <span class="stat-value">${nodeData.weight || 0}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">ID</span>
          <span class="stat-value node-id-text">${nodeData.id}</span>
        </div>
      </div>
      <button class="btn-add-annotation" data-node-id="${nodeData.id}" data-node-name="${nodeData.name}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        添加批注
      </button>
      <button class="btn-analyze-node" data-node-id="${nodeData.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        分析影响路径
      </button>
    `;
    panel.classList.add('has-node');
  },

  /**
   * 连线信息展示
   */
  _updateEdgeInfoPanel(edgeData) {
    const panel = document.getElementById('node-info-panel');
    if (!panel) return;

    const graph = DataManager.currentGraph;
    // 优先使用 ID 查找，如果找不到则回退到 source/target 匹配
    let realEdge = null;
    if (edgeData.id) {
        realEdge = graph.edges.find(e => e.id === edgeData.id);
    }
    if (!realEdge) {
        realEdge = graph.edges.find(e => e.source === edgeData.source && e.target === edgeData.target);
    }
    
    // 如果仍然找不到（可能数据不同步），则直接使用 edgeData
    const edge = realEdge || edgeData;
    
    // 获取节点名称
    const sourceNode = graph.nodes.find(n => n.id === edge.source);
    const targetNode = graph.nodes.find(n => n.id === edge.target);
    const sourceName = sourceNode ? sourceNode.name : edge.source;
    const targetName = targetNode ? targetNode.name : edge.target;
    
    const label = edge.label || '';
    const weight = edge.weight || edge.value || 1;
    const edgeId = edge.id || '';

    panel.innerHTML = `
      <div class="node-info-header">
        <span class="node-info-badge default">连线</span>
        <h3 class="node-info-name" style="font-size:13px">${sourceName} → ${targetName}</h3>
      </div>
      <div class="node-info-stats">
        <div class="stat-item">
          <span class="stat-label">标签</span>
          <span class="stat-value">${label || '(无)'}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">权重</span>
          <span class="stat-value">${weight}</span>
        </div>
      </div>
      <button class="btn-edit-edge-label" data-edge-id="${edgeId}" data-source="${edge.source}" data-target="${edge.target}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        编辑标签
      </button>
      <button class="ann-btn ann-btn-delete btn-delete-edge" style="width:100%;margin-top:6px;padding:7px;justify-content:center" data-edge-id="${edgeId}" data-source="${edge.source}" data-target="${edge.target}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path></svg>
        删除连线
      </button>
    `;
    panel.classList.add('has-node');
  },

  _clearNodeInfoPanel() {
    const panel = document.getElementById('node-info-panel');
    if (!panel) return;
    panel.innerHTML = `<div class="node-info-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <span>点击图表中的节点或连线查看详情</span>
    </div>`;
    panel.classList.remove('has-node');
  },

  // =============================================
  // 批注面板
  // =============================================

  /**
   * 渲染批注列表
   */
  _renderAnnotationPanel() {
    const list = document.getElementById('annotation-list');
    if (!list) return;
    const annotations = DataManager.annotations;

    if (annotations.length === 0) {
      list.innerHTML = '<div class="annotation-empty">暂无批注，点击节点后添加</div>';
      return;
    }

    list.innerHTML = annotations.map(ann => {
      const graph = DataManager.currentGraph;
      const nodeName = graph?.nodes?.find(n => n.id === ann.nodeId)?.name || ann.nodeId;
      return `
        <div class="annotation-card ${ann.id === this._highlightedAnnotationId ? 'highlighted' : ''}" data-ann-id="${ann.id}">
          <div class="ann-header">
            <div class="ann-node-tag">${nodeName}</div>
            <div class="ann-meta">${ann.author} · ${ann.time}</div>
          </div>
          <div class="ann-text">${ann.text}</div>
          <div class="ann-actions">
            <button class="ann-btn" onclick="InteractionManager._openReplyForm('${ann.id}')">回复</button>
            <button class="ann-btn ann-btn-delete" onclick="InteractionManager._deleteAnnotation('${ann.id}')">删除</button>
          </div>
          ${ann.replies.length > 0 ? `
            <div class="ann-replies">
              ${ann.replies.map(r => `
                <div class="ann-reply">
                  <span class="reply-author">${r.author}</span>
                  <span class="reply-text">${r.text}</span>
                  <span class="reply-time">${r.time}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  },

  /**
   * 打开添加批注表单
   */
  _openAnnotationForm(nodeId, nodeName) {
    const modal = document.getElementById('annotation-modal');
    if (!modal) return;
    document.getElementById('ann-modal-node-name').textContent = nodeName;
    document.getElementById('ann-modal-input').value = '';
    modal.dataset.targetNodeId = nodeId;
    modal.classList.add('open');
    setTimeout(() => document.getElementById('ann-modal-input')?.focus(), 100);
  },

  _openReplyForm(annId) {
    const text = prompt('输入回复内容：');
    if (text?.trim()) {
      DataManager.replyAnnotation(annId, text.trim(), this.currentUser);
      this._renderAnnotationPanel();
      this._showToast('回复已添加');
    }
  },

  _deleteAnnotation(annId) {
    if (!confirm('确定删除此批注？')) return;
    DataManager.deleteAnnotation(annId);
    this._renderAnnotationPanel();
    this._showToast('批注已删除');
  },

  _highlightNodeAnnotations(nodeId) {
    document.querySelectorAll('.annotation-card').forEach(card => {
      const ann = DataManager.annotations.find(a => a.id === card.dataset.annId);
      if (ann && ann.nodeId === nodeId) {
        card.classList.add('highlighted');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        card.classList.remove('highlighted');
      }
    });
  },

  // =============================================
  // 路径分析
  // =============================================

  /**
   * 执行路径分析并展示结果
   */
  _runPathAnalysis(nodeId) {
    const graph = DataManager.currentGraph;
    const nodeName = graph?.nodes?.find(n => n.id === nodeId)?.name || nodeId;

    this._showLoading('正在分析影响路径...');
    setTimeout(() => {
      const results = DataManager.analyzeInfluence(nodeId);
      this._hideLoading();

      if (results.length === 0) {
        this._showToast('未找到有效路径，请确认图表连线', 'warning');
        return;
      }

      // 高亮路径
      const pathIds = results.slice(0, 3).map(r => r.pathIds);
      ChartManager.highlightPaths(pathIds, 3);

      this._renderAnalysisPanel(nodeName, results);
      this._switchRightPanel('analysis');
      this._showToast(`已分析 ${results.length} 条路径`);
    }, 600);
  },

  /**
   * 渲染分析结果面板
   */
  _renderAnalysisPanel(targetName, results) {
    const panel = document.getElementById('analysis-result-panel');
    if (!panel) return;

    const top3 = results.slice(0, 3);
    const rest = results.slice(3);

    panel.innerHTML = `
      <div class="analysis-header">
        <h3 class="analysis-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          路径推理报告
        </h3>
        <div class="analysis-target">目标节点：<strong>${targetName}</strong></div>
        <div class="analysis-summary">共找到 <strong>${results.length}</strong> 条有效路径，高亮前 3 条高影响路径</div>
      </div>
      <div class="analysis-paths">
        <div class="paths-section-title">⭐ 高影响路径（Top 3）</div>
        ${top3.map((r, i) => `
          <div class="path-item path-top" style="--rank:${i}">
            <div class="path-rank">#${i + 1}</div>
            <div class="path-chain">
              ${r.path.map((name, ni) => `
                <span class="path-node">${name}</span>
                ${ni < r.path.length - 1 ? '<span class="path-arrow">→</span>' : ''}
              `).join('')}
            </div>
            <div class="path-weight">
              <span class="weight-label">累计权重</span>
              <span class="weight-value">${(r.totalWeight * 100).toFixed(1)}%</span>
            </div>
            <div class="path-bar">
              <div class="path-bar-fill" style="width:${(r.totalWeight * 100).toFixed(1)}%;--color:${['#00d4aa', '#4dabf7', '#f9c74f'][i]}"></div>
            </div>
          </div>
        `).join('')}
        ${rest.length > 0 ? `
          <div class="paths-section-title" style="margin-top:12px">其他路径</div>
          ${rest.map((r, i) => `
            <div class="path-item">
              <div class="path-rank muted">#${i + 4}</div>
              <div class="path-chain small">
                ${r.path.map((name, ni) => `
                  <span class="path-node muted">${name}</span>
                  ${ni < r.path.length - 1 ? '<span class="path-arrow muted">→</span>' : ''}
                `).join('')}
              </div>
              <div class="path-weight muted">${(r.totalWeight * 100).toFixed(1)}%</div>
            </div>
          `).join('')}
        ` : ''}
      </div>
      <button class="btn-clear-highlight" onclick="InteractionManager._clearAnalysis()">
        清除高亮
      </button>
    `;
  },

  _clearAnalysisPanel() {
    const panel = document.getElementById('analysis-result-panel');
    if (panel) panel.innerHTML = '<div class="analysis-empty">选中节点后点击"分析影响"，查看路径推理报告</div>';
  },

  _clearAnalysis() {
    ChartManager.clearHighlight();
    this._clearAnalysisPanel();
  },

  // =============================================
  // 左侧面板渲染
  // =============================================
  _renderSavedGraphsPanel() {
    const list = document.getElementById('saved-graphs-list');
    if (!list) return;

    const savedGraphs = DataManager.getSavedGraphsList();
    if (savedGraphs.length === 0) {
      list.innerHTML = '<div style="font-size:10px;color:var(--text-muted);text-align:center;padding:10px">暂无保存的图表</div>';
      return;
    }

    const currentId = DataManager.currentGraph?.id;

    list.innerHTML = savedGraphs.map(g => {
      const date = g.lastModified ? new Date(g.lastModified).toLocaleString('zh-CN', {month:'numeric', day:'numeric', hour:'numeric', minute:'numeric'}) : '未知时间';
      return `
        <div class="saved-graph-item ${g.id === currentId ? 'active' : ''}" data-graph-id="${g.id}">
          <div style="overflow:hidden">
            <div class="saved-graph-name" title="${g.name}">${g.name}</div>
            <div class="saved-graph-time">${date}</div>
          </div>
          <div class="saved-graph-actions">
            <div class="saved-graph-btn rename" title="重命名">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </div>
            <div class="saved-graph-btn delete" title="删除">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1 14H6L5 6"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  // =============================================
  // 面板切换
  // =============================================
  _switchRightPanel(panel) {
    document.querySelectorAll('.right-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.panel === panel);
    });
    document.querySelectorAll('.right-panel-section').forEach(sec => {
      sec.classList.toggle('active', sec.dataset.panelSection === panel);
    });
  },

  // =============================================
  // 维度选择器
  // =============================================
  _updateDimensionSelector(dimensions, active) {
    const sel = document.getElementById('dimension-selector');
    if (!sel || !dimensions) return;
    sel.innerHTML = dimensions.map(d => `<option value="${d}" ${d === active ? 'selected' : ''}>${d}</option>`).join('');
  },

  // =============================================
  // 工具函数：加载遮罩、Toast
  // =============================================
  _showLoading(msg = '加载中...') {
    const mask = document.getElementById('loading-mask');
    if (mask) {
      mask.querySelector('.loading-text').textContent = msg;
      mask.classList.add('visible');
    }
  },

  _hideLoading() {
    const mask = document.getElementById('loading-mask');
    if (mask) mask.classList.remove('visible');
  },

  /**
   * 展示轻提示
   * @param {string} msg
   * @param {'success'|'warning'|'error'} type
   */
  _showToast(msg, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✓' : type === 'warning' ? '⚠' : '✕'}</span>
      <span>${msg}</span>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  _showNodeTooltipBadge(nodeData) {
    // 节点悬浮时在左侧面板底部显示快捷信息
    const badge = document.getElementById('hover-badge');
    if (!badge) return;
    badge.textContent = `${nodeData.name}`;
    badge.style.opacity = '1';
  },

  _hideNodeTooltipBadge() {
    const badge = document.getElementById('hover-badge');
    if (badge) badge.style.opacity = '0';
  },

  _getCategoryLabel(cat) {
    const map = {
      start: '起点', end: '终点', process: '流程', decision: '决策',
      branch: '分支', leaf: '叶节点', root: '根节点',
      cause: '原因', effect: '结果', root_cause: '根因',
      core: '核心', method: '方法', tool: '工具', goal: '目标'
    };
    return map[cat] || '节点';
  }
};

window.InteractionManager = InteractionManager;
