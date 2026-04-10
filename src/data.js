/**
 * data.js — 数据处理模块
 * 负责：数据读取、导入解析、导出逻辑
 */

// =============================================
// 全局数据状态
// =============================================
const DataManager = {
    /** 当前图表数据 */
    currentGraph: null,
    /** 所有模板列表 */
    templates: [],
    /** 所有图表数据集合 */
    allGraphs: {},
    /** 路径分析结果 */
    analysisResults: [],
    /** 批注数据 */
    annotations: [],
    /** 评论数据 */
    comments: [],

    /**
     * 初始化 —— 优先使用 data-config.js 内嵌数据（兼容 file:// 协议），
     * 后台尝试 fetch data.json 以获取最新数据（HTTP 环境）。
     */
    async init() {
        // 1. 尝试从 LocalStorage 加载（用户保存过的数据优先级最高）
        const hasLocal = this.loadFromLocalStorage();

        // 2. 如果没有本地保存，读取内嵌数据
        if (!hasLocal && window.DEFAULT_DATA) {
            const data = window.DEFAULT_DATA;
            this.templates = data.templates || [];
            this.allGraphs = data.graphs || {};
            this.currentGraph = JSON.parse(JSON.stringify(this.allGraphs['flowchart'] || Object.values(this.allGraphs)[0]));
        }

        // 3. 无论如何，尝试从服务器更新模板（如果有的话）
        fetch('./data.json')
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d && d.graphs) {
                    // 仅更新模板，不覆盖用户已保存的图表内容，除非本地没数据
                    if (!hasLocal) {
                        this.allGraphs = d.graphs;
                        this.currentGraph = JSON.parse(JSON.stringify(this.allGraphs['flowchart'] || Object.values(this.allGraphs)[0]));
                    }
                    this.templates = d.templates || this.templates;
                }
            })
            .catch(() => { });

        if (this.currentGraph) return true;

        // 4. 备用：纯空白初始化
        this.currentGraph = this._createEmptyGraph('flowchart');
        return false;
    },

    /**
     * 保存当前状态到 LocalStorage
     * @param {boolean} onlyPersist - 是否仅执行持久化（不更新当前图表到集合）
     */
    saveToLocalStorage(onlyPersist = false) {
        try {
            // 在保存前，确保当前编辑的图表已同步到 allGraphs
            if (!onlyPersist && this.currentGraph && this.currentGraph.id) {
                this.currentGraph.lastModified = Date.now();
                
                // 使用 ID 作为主要存储键
                this.allGraphs[`_id_${this.currentGraph.id}`] = JSON.parse(JSON.stringify(this.currentGraph));
                
                // 同时也更新类型键（用于默认加载）
                if (this.currentGraph.type) {
                    this.allGraphs[this.currentGraph.type] = this.allGraphs[`_id_${this.currentGraph.id}`];
                }
            }

            const data = {
                graphs: this.allGraphs,
                templates: this.templates,
                lastUpdated: Date.now()
            };
            localStorage.setItem('cognitive_viz_data', JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('本地保存失败:', e);
            return false;
        }
    },

    /**
     * 从 LocalStorage 加载数据
     */
    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('cognitive_viz_data');
            if (saved) {
                const data = JSON.parse(saved);
                if (data && data.graphs) {
                    this.allGraphs = data.graphs;
                    this.templates = data.templates || this.templates;
                    // 加载最后一个活跃图表或者默认图表
                    this.currentGraph = JSON.parse(JSON.stringify(this.allGraphs['flowchart'] || Object.values(this.allGraphs)[0]));
                    return true;
                }
            }
        } catch (e) {
            console.warn('读取本地缓存失败:', e);
        }
        return false;
    },

    /**
     * 获取所有已保存的图表列表（按修改时间倒序）
     */
    getSavedGraphsList() {
        return Object.keys(this.allGraphs)
            .filter(k => k.startsWith('_id_'))
            .map(k => this.allGraphs[k])
            .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    },

    /**
     * 加载指定 ID 的图表
     */
    loadGraph(graphId) {
        const key = `_id_${graphId}`;
        if (this.allGraphs[key]) {
            this.currentGraph = JSON.parse(JSON.stringify(this.allGraphs[key]));
            return this.currentGraph;
        }
        return null;
    },

    /**
     * 删除指定 ID 的图表
     */
    deleteGraph(graphId) {
        const key = `_id_${graphId}`;
        if (this.allGraphs[key]) {
            delete this.allGraphs[key];
            // 更新缓存，但不重新保存 currentGraph，避免复活已删除的图表
            this.saveToLocalStorage(true);
        }
    },

    /**
     * 重命名图表
     */
    renameGraph(graphId, newName) {
        const key = `_id_${graphId}`;
        if (this.allGraphs[key]) {
            this.allGraphs[key].name = newName;
            this.allGraphs[key].lastModified = Date.now();
            
            // 如果是当前图表，也更新 currentGraph
            if (this.currentGraph && this.currentGraph.id === graphId) {
                this.currentGraph.name = newName;
            }
            
            this.saveToLocalStorage();
            return true;
        }
        return false;
    },

    /**
     * 切换图表类型（加载对应示例数据）
     * @param {string} type - 图表类型
     */
    switchGraphType(type) {
        if (this.allGraphs[type]) {
            this.currentGraph = JSON.parse(JSON.stringify(this.allGraphs[type]));
        } else {
            this.currentGraph = this._createEmptyGraph(type);
        }
        this.analysisResults = [];
        return this.currentGraph;
    },

    /**
     * 从模板创建新图表
     * @param {string} templateId - 模板ID，'__blank' 表示新建空白图表
     */
    createFromTemplate(templateId) {
        const tpl = this.templates.find(t => t.id === templateId);
        if (!tpl) return null;
        return this.switchGraphType(tpl.type);
    },

    /**
     * 创建自定义空白图表
     */
    createEmptyGraph(name) {
        const dim = '默认';
        this.currentGraph = {
            id: `g_${Date.now()}`,
            type: 'custom',
            name: name || '新建图表',
            description: '',
            dimensions: [dim],
            activeDimension: dim,
            nodes: [],
            edges: [],
            analysisRules: { algorithm: 'weighted_path', weightField: 'weight', aggregation: 'multiply' },
            lastModified: Date.now()
        };
        this.analysisResults = [];
        // 自动保存
        this.saveToLocalStorage();
        return this.currentGraph;
    },

    /**
     * 添加新维度
     * @param {string} name 
     */
    addDimension(name) {
        if (!this.currentGraph || !name) return false;
        if (this.currentGraph.dimensions.includes(name)) return false;
        
        this.currentGraph.dimensions.push(name);
        
        // 为所有现有节点初始化该维度的权重（默认为50）
        this.currentGraph.nodes.forEach(n => {
            if (!n.data) n.data = {};
            if (n.data[name] === undefined) {
                n.data[name] = 50;
            }
        });
        
        this.saveToLocalStorage();
        return true;
    },

    /**
     * 重命名维度
     * @param {string} oldName 
     * @param {string} newName 
     */
    renameDimension(oldName, newName) {
        if (!this.currentGraph || !oldName || !newName) return false;
        const idx = this.currentGraph.dimensions.indexOf(oldName);
        if (idx === -1) return false;
        if (this.currentGraph.dimensions.includes(newName)) return false;

        // 更新维度列表
        this.currentGraph.dimensions[idx] = newName;
        
        // 更新当前激活维度
        if (this.currentGraph.activeDimension === oldName) {
            this.currentGraph.activeDimension = newName;
        }

        // 更新所有节点的数据键名
        this.currentGraph.nodes.forEach(n => {
            if (n.data && n.data[oldName] !== undefined) {
                n.data[newName] = n.data[oldName];
                delete n.data[oldName];
            }
        });

        this.saveToLocalStorage();
        return true;
    },

    /**
     * 删除维度
     * @param {string} name 
     */
    deleteDimension(name) {
        if (!this.currentGraph || !name) return false;
        // 至少保留一个维度
        if (this.currentGraph.dimensions.length <= 1) return false;

        const idx = this.currentGraph.dimensions.indexOf(name);
        if (idx === -1) return false;

        // 移除维度
        this.currentGraph.dimensions.splice(idx, 1);

        // 如果删除的是当前激活维度，切换到第一个
        if (this.currentGraph.activeDimension === name) {
            this.currentGraph.activeDimension = this.currentGraph.dimensions[0];
        }

        // 清理节点数据（可选，保留也不影响，但为了整洁最好清理）
        this.currentGraph.nodes.forEach(n => {
            if (n.data && n.data[name] !== undefined) {
                delete n.data[name];
            }
        });

        this.saveToLocalStorage();
        return true;
    },

    /**
     * 创建内部空白图表
     * @param {string} type
     */
    _createEmptyGraph(type) {
        return {
            id: `g_blank_${Date.now()}`,
            type,
            name: '新建图表',
            description: '',
            dimensions: ['默认'],
            activeDimension: '默认',
            nodes: [],
            edges: [],
            analysisRules: { algorithm: 'weighted_path', weightField: 'weight', aggregation: 'multiply' }
        };
    },

    // =============================================
    // 数据导入
    // =============================================

    /**
     * 统一导入入口：根据文件类型分发处理
     * @param {File} file
     * @returns {Promise<Object>} 解析后的图表数据
     */
    async importFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        let graphData = null;

        if (ext === 'json') {
            graphData = await this._importJSON(file);
        } else if (ext === 'csv') {
            graphData = await this._importCSV(file);
        } else if (ext === 'xlsx' || ext === 'xls') {
            graphData = await this._importExcel(file);
        } else {
            throw new Error(`不支持的文件格式：.${ext}，请使用 JSON、CSV 或 Excel 文件`);
        }

        const errors = this.validateData(graphData);
        if (errors.length > 0) {
            throw new Error('数据校验失败：\n' + errors.join('\n'));
        }

        this.currentGraph = graphData;
        return graphData;
    },

    /**
     * 导入 JSON 文件
     * @param {File} file
     */
    async _importJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    // 支持两种格式：直接图表数据 或 包含 graphs 字段的完整数据包
                    if (data.graphs) {
                        const firstKey = Object.keys(data.graphs)[0];
                        resolve(data.graphs[firstKey]);
                    } else if (data.nodes && data.edges) {
                        resolve(data);
                    } else {
                        reject(new Error('JSON 格式不正确，需包含 nodes 和 edges 字段'));
                    }
                } catch (err) {
                    reject(new Error('JSON 解析失败：' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file, 'utf-8');
        });
    },

    /**
     * 导入 CSV 文件
     * CSV 格式：id,name,weight,description,source,target,label
     * 前几行为节点数据，使用特定标记区分边数据
     * @param {File} file
     */
    async _importCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const lines = e.target.result.split('\n').map(l => l.trim()).filter(l => l);
                    const nodes = [];
                    const edges = [];
                    let mode = 'nodes'; // 'nodes' or 'edges'

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (line.startsWith('#EDGES')) { mode = 'edges'; continue; }
                        if (line.startsWith('#NODES')) { mode = 'nodes'; continue; }
                        if (line.startsWith('#')) continue; // 注释行

                        const cols = this._parseCSVLine(line);

                        if (i === 0 && mode === 'nodes') continue; // 跳过表头

                        if (mode === 'nodes' && cols.length >= 2) {
                            nodes.push({
                                id: cols[0] || `n${i}`,
                                name: cols[1],
                                weight: parseFloat(cols[2]) || 50,
                                description: cols[3] || '',
                                x: parseFloat(cols[4]) || (100 + nodes.length * 150),
                                y: parseFloat(cols[5]) || 100,
                                category: cols[6] || 'process',
                                data: { '默认': parseFloat(cols[2]) || 50 }
                            });
                        } else if (mode === 'edges' && cols.length >= 2) {
                            edges.push({
                                id: `e${edges.length}`,
                                source: cols[0],
                                target: cols[1],
                                label: cols[2] || '',
                                weight: parseFloat(cols[3]) || 1.0
                            });
                        }
                    }

                    resolve({
                        id: `g_import_${Date.now()}`,
                        type: 'flowchart',
                        name: file.name.replace('.csv', ''),
                        description: 'CSV 导入',
                        dimensions: ['默认'],
                        activeDimension: '默认',
                        nodes,
                        edges,
                        analysisRules: { algorithm: 'weighted_path', weightField: 'weight', aggregation: 'multiply' }
                    });
                } catch (err) {
                    reject(new Error('CSV 解析失败：' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file, 'utf-8');
        });
    },

    /**
     * 解析单行 CSV（处理引号内的逗号）
     * @param {string} line
     * @returns {string[]}
     */
    _parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuote = !inQuote;
            } else if (ch === ',' && !inQuote) {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current.trim());
        return result;
    },

    /**
     * 导入 Excel 文件（依赖全局 XLSX 库）
     * @param {File} file
     */
    async _importExcel(file) {
        return new Promise((resolve, reject) => {
            if (typeof XLSX === 'undefined') {
                reject(new Error('Excel 解析库未加载，请检查网络连接'));
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const workbook = XLSX.read(e.target.result, { type: 'array' });
                    const nodes = [];
                    const edges = [];

                    // 读取 Nodes sheet
                    const nodesSheet = workbook.Sheets['Nodes'] || workbook.Sheets[workbook.SheetNames[0]];
                    if (nodesSheet) {
                        const rows = XLSX.utils.sheet_to_json(nodesSheet);
                        rows.forEach((row, idx) => {
                            if (!row['名称'] && !row['name']) return;
                            nodes.push({
                                id: row['ID'] || row['id'] || `n${idx}`,
                                name: row['名称'] || row['name'],
                                weight: parseFloat(row['权重'] || row['weight']) || 50,
                                description: row['描述'] || row['description'] || '',
                                x: parseFloat(row['X坐标'] || row['x']) || (100 + idx * 150),
                                y: parseFloat(row['Y坐标'] || row['y']) || 100,
                                category: row['类别'] || row['category'] || 'process',
                                data: { '默认': parseFloat(row['权重'] || row['weight']) || 50 }
                            });
                        });
                    }

                    // 读取 Edges sheet
                    const edgesSheet = workbook.Sheets['Edges'] || workbook.Sheets[workbook.SheetNames[1]];
                    if (edgesSheet) {
                        const rows = XLSX.utils.sheet_to_json(edgesSheet);
                        rows.forEach((row, idx) => {
                            if (!row['源节点'] && !row['source']) return;
                            edges.push({
                                id: `e${idx}`,
                                source: row['源节点'] || row['source'],
                                target: row['目标节点'] || row['target'],
                                label: row['标签'] || row['label'] || '',
                                weight: parseFloat(row['权重'] || row['weight']) || 1.0
                            });
                        });
                    }

                    resolve({
                        id: `g_import_${Date.now()}`,
                        type: 'flowchart',
                        name: file.name.replace(/\.(xlsx|xls)$/, ''),
                        description: 'Excel 导入',
                        dimensions: ['默认'],
                        activeDimension: '默认',
                        nodes,
                        edges,
                        analysisRules: { algorithm: 'weighted_path', weightField: 'weight', aggregation: 'multiply' }
                    });
                } catch (err) {
                    reject(new Error('Excel 解析失败：' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * 数据格式校验
     * @param {Object} data - 图表数据
     * @returns {string[]} 错误信息列表（空数组表示通过）
     */
    validateData(data) {
        const errors = [];
        if (!data) { errors.push('数据为空'); return errors; }
        if (!Array.isArray(data.nodes)) errors.push('缺少 nodes 字段（节点列表）');
        if (!Array.isArray(data.edges)) errors.push('缺少 edges 字段（连线关系）');

        if (Array.isArray(data.nodes)) {
            data.nodes.forEach((n, i) => {
                if (!n.id) errors.push(`节点 #${i + 1} 缺少 id 字段`);
                if (!n.name) errors.push(`节点 #${i + 1} (${n.id || '未知'}) 缺少 name（节点名称）`);
                if (n.weight !== undefined && isNaN(parseFloat(n.weight))) {
                    errors.push(`节点 ${n.id} 的 weight 数据类型不匹配，应为数字`);
                }
            });

            // 校验边引用的节点是否存在
            const nodeIds = new Set(data.nodes.map(n => n.id));
            if (Array.isArray(data.edges)) {
                data.edges.forEach((e, i) => {
                    if (e.source && !nodeIds.has(e.source)) {
                        errors.push(`连线 #${i + 1} 的源节点 "${e.source}" 不存在于节点列表`);
                    }
                    if (e.target && !nodeIds.has(e.target)) {
                        errors.push(`连线 #${i + 1} 的目标节点 "${e.target}" 不存在于节点列表`);
                    }
                });
            }
        }
        return errors;
    },

    // =============================================
    // 数据导出
    // =============================================

    /**
     * 导出为 CSV 文件
     */
    exportCSV() {
        const graph = this.currentGraph;
        if (!graph) return;

        let csv = '#NODES\n';
        csv += 'ID,名称,权重,描述,X坐标,Y坐标,类别\n';
        graph.nodes.forEach(n => {
            csv += `"${n.id}","${n.name}",${n.weight || 0},"${n.description || ''}",${n.x || 0},${n.y || 0},"${n.category || ''}"` + '\n';
        });

        csv += '\n#EDGES\n';
        csv += '源节点,目标节点,标签,权重\n';
        graph.edges.forEach(e => {
            csv += `"${e.source}","${e.target}","${e.label || ''}",${e.weight || 1}` + '\n';
        });

        // 附加分析结果
        if (this.analysisResults.length > 0) {
            csv += '\n#ANALYSIS_RESULTS\n';
            csv += '路径,总权重,节点数\n';
            this.analysisResults.forEach(r => {
                csv += `"${r.path.join(' → ')}",${r.totalWeight.toFixed(4)},${r.path.length}` + '\n';
            });
        }

        this._downloadFile(`${graph.name || '图表'}_${this._timestamp()}.csv`, csv, 'text/csv;charset=utf-8;');
    },

    /**
     * 导出为 Excel 文件（依赖 SheetJS）
     */
    exportExcel() {
        if (typeof XLSX === 'undefined') {
            alert('Excel 导出库未加载，请检查网络连接后重试');
            return;
        }
        const graph = this.currentGraph;
        if (!graph) return;

        const wb = XLSX.utils.book_new();

        // Nodes Sheet
        const nodeRows = graph.nodes.map(n => ({
            'ID': n.id,
            '名称': n.name,
            '类别': n.category || '',
            '权重': n.weight || 0,
            '描述': n.description || '',
            'X坐标': n.x || 0,
            'Y坐标': n.y || 0,
            ...(graph.activeDimension ? { [graph.activeDimension]: n.data?.[graph.activeDimension] || 0 } : {})
        }));
        const nodeSheet = XLSX.utils.json_to_sheet(nodeRows);
        XLSX.utils.book_append_sheet(wb, nodeSheet, 'Nodes');

        // Edges Sheet
        const edgeRows = graph.edges.map(e => ({
            'ID': e.id || '',
            '源节点': e.source,
            '目标节点': e.target,
            '标签': e.label || '',
            '权重': e.weight || 1
        }));
        const edgeSheet = XLSX.utils.json_to_sheet(edgeRows);
        XLSX.utils.book_append_sheet(wb, edgeSheet, 'Edges');

        // Analysis Results Sheet
        if (this.analysisResults.length > 0) {
            const analysisRows = this.analysisResults.map((r, i) => ({
                '排名': i + 1,
                '路径': r.path.join(' → '),
                '总权重': parseFloat(r.totalWeight.toFixed(4)),
                '节点数': r.path.length,
                '路径类型': i < 3 ? '⭐ 高影响路径' : '普通路径'
            }));
            const analysisSheet = XLSX.utils.json_to_sheet(analysisRows);
            XLSX.utils.book_append_sheet(wb, analysisSheet, 'PathAnalysis');
        }

        XLSX.writeFile(wb, `${graph.name || '图表'}_${this._timestamp()}.xlsx`);
    },

    /**
     * 导出图表为 PNG 图片
     * @param {string} base64DataURL - ECharts getDataURL 返回的 base64
     */
    exportPNG(base64DataURL) {
        const graph = this.currentGraph;
        const link = document.createElement('a');
        link.href = base64DataURL;
        link.download = `${graph?.name || '图表'}_${this._timestamp()}.png`;
        link.click();
    },

    /**
     * 导出为 PDF（依赖 jspdf + html2canvas）
     * @param {HTMLElement} element - 要导出的 DOM 元素（图表容器）
     */
    async exportPDF(element) {
        if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
            alert('PDF 导出库未加载，请检查网络连接后重试');
            return;
        }
        const graph = this.currentGraph;
        const canvas = await html2canvas(element, { backgroundColor: '#0d1117', scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [canvas.width / 2, canvas.height / 2]
        });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
        pdf.save(`${graph?.name || '图表'}_${this._timestamp()}.pdf`);
    },

    // =============================================
    // 批注管理
    // =============================================

    /**
     * 添加批注
     * @param {string} nodeId
     * @param {string} text
     * @param {string} author
     */
    addAnnotation(nodeId, text, author = '访客') {
        const annotation = {
            id: `ann_${Date.now()}`,
            nodeId,
            text,
            author,
            time: new Date().toLocaleString('zh-CN'),
            replies: []
        };
        this.annotations.push(annotation);
        return annotation;
    },

    /**
     * 删除批注
     * @param {string} annotationId
     */
    deleteAnnotation(annotationId) {
        this.annotations = this.annotations.filter(a => a.id !== annotationId);
    },

    /**
     * 回复批注
     * @param {string} annotationId
     * @param {string} replyText
     * @param {string} author
     */
    replyAnnotation(annotationId, replyText, author = '访客') {
        const ann = this.annotations.find(a => a.id === annotationId);
        if (ann) {
            ann.replies.push({
                id: `rep_${Date.now()}`,
                text: replyText,
                author,
                time: new Date().toLocaleString('zh-CN')
            });
        }
        return ann;
    },

    /**
     * 获取节点上的所有批注
     * @param {string} nodeId
     */
    getNodeAnnotations(nodeId) {
        return this.annotations.filter(a => a.nodeId === nodeId);
    },

    deleteComment(id) {
        this.comments = this.comments.filter(c => c.id !== id);
        // 如果有持久化需求，这里也应该保存
    },

    // =============================================
    // 路径分析
    // =============================================

    /**
     * 分析目标节点的影响路径（从所有根节点到目标节点的路径）
     * @param {string} targetNodeId
     * @returns {Array} 排序后的路径列表
     */
    analyzeInfluence(targetNodeId) {
        const graph = this.currentGraph;
        if (!graph || !graph.nodes.length) return [];

        const adjList = {}; // 反向邻接表（目标 → 源）
        graph.nodes.forEach(n => { adjList[n.id] = []; });
        graph.edges.forEach(e => {
            if (adjList[e.target] !== undefined) {
                adjList[e.target].push({ nodeId: e.source, edgeWeight: e.weight || 1 });
            }
        });

        // BFS 找到所有到达 targetNodeId 的路径
        const allPaths = [];
        const queue = [{ nodeId: targetNodeId, path: [targetNodeId], weight: 1 }];

        while (queue.length > 0) {
            const { nodeId, path, weight } = queue.shift();
            const parents = adjList[nodeId] || [];

            if (parents.length === 0) {
                // 到达根节点
                allPaths.push({
                    path: [...path].reverse(),
                    totalWeight: weight,
                    pathIds: [...path].reverse()
                });
                continue;
            }

            // 防止无限循环
            if (path.length > 15) {
                allPaths.push({
                    path: [...path].reverse(),
                    totalWeight: weight,
                    pathIds: [...path].reverse()
                });
                continue;
            }

            parents.forEach(parent => {
                if (!path.includes(parent.nodeId)) { // 避免环
                    queue.push({
                        nodeId: parent.nodeId,
                        path: [...path, parent.nodeId],
                        weight: weight * parent.edgeWeight
                    });
                }
            });
        }

        // 按总权重降序排序
        const sorted = allPaths
            .sort((a, b) => b.totalWeight - a.totalWeight)
            .slice(0, 10); // 最多展示10条路径

        // 把节点 ID 映射为节点名称
        const nodeMap = {};
        graph.nodes.forEach(n => { nodeMap[n.id] = n.name; });
        sorted.forEach(p => {
            p.path = p.pathIds.map(id => nodeMap[id] || id);
        });

        this.analysisResults = sorted;
        return sorted;
    },

    // =============================================
    // 工具函数
    // =============================================

    /**
     * 生成时间戳字符串
     */
    _timestamp() {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_` +
            `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    },

    /**
     * 触发文件下载
     * @param {string} filename
     * @param {string} content
     * @param {string} mimeType
     */
    _downloadFile(filename, content, mimeType) {
        const blob = new Blob(['\uFEFF' + content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
};

// 暴露给全局
window.DataManager = DataManager;
