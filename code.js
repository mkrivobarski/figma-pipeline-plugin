// Design Pipeline Plugin — main thread
// Stores iteration instructions on nodes via sharedPluginData so the MCP pipeline
// can scan and process them. Optionally notifies figma-console-mcp via postMessage
// when the queue changes, but works fully standalone without that connection.

figma.showUI(__html__, { width: 320, height: 460, visible: true, themeColors: true });

// ============================================================================
// SELECTION CHANGE — push live selection to UI
// ============================================================================
figma.on('selectionchange', function () {
  var selection = figma.currentPage.selection;
  var nodes = [];
  for (var i = 0; i < Math.min(selection.length, 10); i++) {
    var n = selection[i];
    nodes.push({ id: n.id, name: n.name, type: n.type });
  }
  figma.ui.postMessage({
    type: 'SELECTION_CHANGE',
    data: { nodes: nodes, page: figma.currentPage.name }
  });
});

// ============================================================================
// MESSAGE HANDLER — requests from UI
// ============================================================================
figma.ui.onmessage = async function (msg) {

  // ── PIPELINE_SUBMIT ────────────────────────────────────────────────────────
  // Store an iteration instruction on a node.
  if (msg.type === 'PIPELINE_SUBMIT') {
    try {
      var targetNode = null;

      if (msg.nodeId) {
        targetNode = await figma.getNodeByIdAsync(msg.nodeId);
        if (!targetNode) throw new Error('Node not found: ' + msg.nodeId);
      } else {
        var sel = figma.currentPage.selection;
        if (!sel || sel.length === 0) throw new Error('No node selected');
        targetNode = sel[0];
      }

      if (!msg.instruction || !msg.instruction.trim()) {
        throw new Error('Instruction is required');
      }

      var payload = {
        instruction: msg.instruction.trim(),
        intent:      msg.intent || 'iterate',
        constraints: msg.constraints || null,
        submittedAt: Date.now(),
        status:      'pending',
        nodeId:      targetNode.id,
        nodeName:    targetNode.name,
        nodeType:    targetNode.type,
        pageName:    figma.currentPage.name
      };

      targetNode.setSharedPluginData('pipeline', 'instruction', JSON.stringify(payload));

      figma.ui.postMessage({
        type: 'PIPELINE_SUBMIT_RESULT',
        requestId: msg.requestId,
        success: true,
        data: {
          nodeId:      targetNode.id,
          nodeName:    targetNode.name,
          nodeType:    targetNode.type,
          pageName:    figma.currentPage.name,
          instruction: payload.instruction,
          intent:      payload.intent,
          submittedAt: payload.submittedAt
        }
      });

    } catch (err) {
      figma.ui.postMessage({
        type: 'PIPELINE_SUBMIT_RESULT',
        requestId: msg.requestId,
        success: false,
        error: err && err.message ? err.message : String(err)
      });
    }
  }

  // ── PIPELINE_STATUS_UPDATE ─────────────────────────────────────────────────
  // Write back processing status after a pipeline run.
  else if (msg.type === 'PIPELINE_STATUS_UPDATE') {
    try {
      var statusNode = await figma.getNodeByIdAsync(msg.nodeId);
      if (!statusNode) throw new Error('Node not found: ' + msg.nodeId);

      var raw = statusNode.getSharedPluginData('pipeline', 'instruction');
      var existing = raw ? JSON.parse(raw) : {};
      existing.status      = msg.status;
      existing.processedAt = Date.now();
      if (msg.runId) existing.runId = msg.runId;
      if (msg.error) existing.error = msg.error;

      statusNode.setSharedPluginData('pipeline', 'instruction', JSON.stringify(existing));

      figma.ui.postMessage({
        type: 'PIPELINE_STATUS_UPDATE_RESULT',
        requestId: msg.requestId,
        success: true,
        data: { nodeId: msg.nodeId, status: msg.status }
      });

    } catch (err) {
      figma.ui.postMessage({
        type: 'PIPELINE_STATUS_UPDATE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: err && err.message ? err.message : String(err)
      });
    }
  }

  // ── PIPELINE_CLEAR ─────────────────────────────────────────────────────────
  // Remove the pipeline instruction from a node.
  else if (msg.type === 'PIPELINE_CLEAR') {
    try {
      var clearNode = await figma.getNodeByIdAsync(msg.nodeId);
      if (!clearNode) throw new Error('Node not found: ' + msg.nodeId);
      clearNode.setSharedPluginData('pipeline', 'instruction', '');
      figma.ui.postMessage({
        type: 'PIPELINE_CLEAR_RESULT',
        requestId: msg.requestId,
        success: true,
        data: { nodeId: msg.nodeId }
      });
    } catch (err) {
      figma.ui.postMessage({
        type: 'PIPELINE_CLEAR_RESULT',
        requestId: msg.requestId,
        success: false,
        error: err && err.message ? err.message : String(err)
      });
    }
  }

  // ── PIPELINE_SCAN_QUEUE ────────────────────────────────────────────────────
  // Scan all pages for pending pipeline instructions (for the UI queue display).
  else if (msg.type === 'PIPELINE_SCAN_QUEUE') {
    try {
      await figma.loadAllPagesAsync();
      var items = [];
      for (var pi = 0; pi < figma.root.children.length; pi++) {
        var page = figma.root.children[pi];
        var nodes = page.findAll(function (n) {
          try { return !!n.getSharedPluginData('pipeline', 'instruction'); } catch (e) { return false; }
        });
        for (var ni = 0; ni < nodes.length; ni++) {
          var node = nodes[ni];
          var raw = node.getSharedPluginData('pipeline', 'instruction');
          if (!raw) continue;
          try {
            var entry = JSON.parse(raw);
            if (!msg.statusFilter || msg.statusFilter === 'all' || entry.status === msg.statusFilter) {
              items.push(entry);
            }
          } catch (e) { /* skip malformed */ }
        }
      }
      figma.ui.postMessage({
        type: 'PIPELINE_SCAN_QUEUE_RESULT',
        requestId: msg.requestId,
        success: true,
        data: { items: items, total: items.length }
      });
    } catch (err) {
      figma.ui.postMessage({
        type: 'PIPELINE_SCAN_QUEUE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: err && err.message ? err.message : String(err)
      });
    }
  }

};
