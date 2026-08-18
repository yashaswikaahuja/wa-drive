// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl ActionPlan Runner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Phase 1.5: Graph execution runtime.
//
// Takes an ActionPlan (graph per protocol.yml Section 2), walks the
// execution graph, dispatches actions through ccCapabilities, resolves
// semantic targets through ccResolver, and produces an Observation.
//
// Supports:
//   - action nodes: dispatch through capability registry
//   - checkpoint nodes: record milestone + optional state snapshot
//   - branch nodes: evaluate condition → follow matching edge
//   - terminal nodes: complete execution with status
//   - retry: per-node retry with configurable delay
//   - linear plan conversion: actions[] → graph
//
// Exposes: window.ccRunner.{execute, executeLinear, fromLinear}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

;(function () {
  'use strict';

  var RUNNER_VERSION = '1.0.0';

  // ══════════════════════════════════════════════════════════════════════
  // Linear → Graph Converter
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Convert a linear action list to a graph plan.
   * Linear plan: { plan_id, session_id, actions: [...] }
   * Graph plan:  { plan_id, session_id, version, entry_node, nodes, edges }
   *
   * @param {object} linearPlan
   * @returns {object} graph plan
   */
  function fromLinear(linearPlan) {
    var actions = linearPlan.actions || [];
    if (actions.length === 0) {
      return {
        plan_id: linearPlan.plan_id || 'empty',
        session_id: linearPlan.session_id || '',
        version: 2,
        entry_node: 'terminal_complete',
        nodes: { terminal_complete: { type: 'terminal', terminal: { status: 'complete', reason: 'empty plan' } } },
        edges: [],
      };
    }

    var nodes = {};
    var edges = [];

    // Create action nodes: n0, n1, n2, ...
    for (var i = 0; i < actions.length; i++) {
      var nodeId = 'n' + i;
      nodes[nodeId] = {
        type: 'action',
        action: actions[i],
      };
    }

    // Terminal nodes
    nodes['terminal_complete'] = { type: 'terminal', terminal: { status: 'complete', reason: null } };
    nodes['terminal_abort'] = { type: 'terminal', terminal: { status: 'aborted', reason: 'action_failed' } };

    // Chain edges: n0→n1 (success), n0→abort (failure)
    for (var j = 0; j < actions.length; j++) {
      var from = 'n' + j;
      var to = j < actions.length - 1 ? 'n' + (j + 1) : 'terminal_complete';
      edges.push({ from: from, to: to, condition: 'success' });
      edges.push({ from: from, to: 'terminal_abort', condition: 'failure' });
    }

    return {
      plan_id: linearPlan.plan_id || 'linear_' + Date.now(),
      session_id: linearPlan.session_id || '',
      version: 2,
      entry_node: 'n0',
      nodes: nodes,
      edges: edges,
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Graph Execution
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Execute an ActionPlan graph.
   * @param {object} plan — Graph plan (protocol.yml Section 2)
   * @param {object} [options] — { onNodeStart, onNodeEnd, maxNodes }
   * @returns {Promise<object>} Observation
   */
  async function execute(plan, options) {
    options = options || {};
    var maxNodes = options.maxNodes || 100;
    var onNodeStart = options.onNodeStart || null;
    var onNodeEnd = options.onNodeEnd || null;

    // Build edge index: from → [{to, condition}]
    var edgeIndex = {};
    (plan.edges || []).forEach(function (e) {
      if (!edgeIndex[e.from]) edgeIndex[e.from] = [];
      edgeIndex[e.from].push(e);
    });

    // Execution state
    var observation = _createObservation(plan);
    var currentNode = plan.entry_node;
    var visited = 0;
    var _navigated = false;
    var _formSubmitted = false;

    // Track navigation
    var _startUrl = window.location.href;
    function _checkNavigation() {
      if (window.location.href !== _startUrl) _navigated = true;
    }

    while (currentNode && visited < maxNodes) {
      visited++;
      var nodeDef = plan.nodes[currentNode];

      if (!nodeDef) {
        observation.execution_path.push({
          node_id: currentNode,
          status: 'failed',
          actual_value: null,
          error: 'node_not_found',
          duration_ms: 0,
        });
        break;
      }

      if (onNodeStart) onNodeStart(currentNode, nodeDef);

      var result;
      switch (nodeDef.type) {
        case 'action':
          result = await _executeAction(currentNode, nodeDef.action, options);
          break;
        case 'checkpoint':
          result = _executeCheckpoint(currentNode, nodeDef.checkpoint, observation);
          break;
        case 'branch':
          result = await _executeBranch(currentNode, nodeDef.condition);
          break;
        case 'terminal':
          result = _executeTerminal(currentNode, nodeDef.terminal, observation);
          observation.execution_path.push(result.pathEntry);
          if (onNodeEnd) onNodeEnd(currentNode, result.pathEntry);
          currentNode = null; // End execution
          continue;
        default:
          result = { pathEntry: { node_id: currentNode, status: 'failed', actual_value: null, error: 'unknown_node_type: ' + nodeDef.type, duration_ms: 0 }, outcome: 'failure' };
      }

      observation.execution_path.push(result.pathEntry);
      if (onNodeEnd) onNodeEnd(currentNode, result.pathEntry);

      // Collect tracking flags from action nodes
      if (result.didNavigate) _navigated = true;
      if (result.didSubmit) _formSubmitted = true;

      // Inter-action delay: let frameworks settle between fills
      if (nodeDef.type === 'action' && result.outcome === 'success') {
        var settleMs = (options && options.interActionDelay) || 120;
        await new Promise(function (r) { setTimeout(r, settleMs); });
      }

      // Handle waiting_human: pause execution, record in observation
      if (result.outcome === 'waiting_human') {
        observation.human_interactions.push({
          node_id: currentNode,
          checkpoint_type: (nodeDef.action && nodeDef.action.reason) || 'unknown',
          outcome: 'waiting',
          duration_ms: result.pathEntry.duration_ms,
        });
        // Try human_complete edge, fall back to success edge (plan should define the path)
        var nextNode = _followEdge(edgeIndex, currentNode, 'human_complete') ||
                       _followEdge(edgeIndex, currentNode, 'success');
        if (!nextNode) {
          // No edge defined — execution pauses here (observation is partial)
          break;
        }
        currentNode = nextNode;
        continue;
      }

      // Follow edge based on outcome
      var outcome = result.outcome; // 'success', 'failure', 'timeout', 'skip'
      currentNode = _followEdge(edgeIndex, currentNode, outcome);
    }

    // If we ran out of nodes without hitting terminal
    if (visited >= maxNodes) {
      observation.execution_path.push({
        node_id: '_overflow',
        status: 'failed',
        error: 'max_nodes_exceeded',
        actual_value: null,
        duration_ms: 0,
      });
    }

    // Finalize observation
    _checkNavigation();
    observation.page_state = _capturePageState(_navigated, _formSubmitted);
    return observation;
  }

  /**
   * Shortcut: execute a linear plan directly.
   * @param {object} linearPlan — { plan_id, session_id, actions: [...] }
   * @param {object} [options]
   * @returns {Promise<object>} Observation
   */
  async function executeLinear(linearPlan, options) {
    var graph = fromLinear(linearPlan);
    return execute(graph, options);
  }

  // ══════════════════════════════════════════════════════════════════════
  // Node Executors
  // ══════════════════════════════════════════════════════════════════════

  async function _executeAction(nodeId, actionDef, options) {
    var t0 = Date.now();
    var maxAttempts = (actionDef.retry && actionDef.retry.max_attempts) || 1;
    var retryDelay = (actionDef.retry && actionDef.retry.delay_ms) || 500;

    var lastResult = null;

    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise(function (r) { setTimeout(r, retryDelay); });
      }

      // Resolve semantic target to DOM element
      var element = null;
      var widgetType = 'generic';

      if (actionDef.target) {
        var resolution = window.ccResolver.resolve(actionDef.target);
        if (resolution.error) {
          lastResult = {
            status: 'failed',
            error: resolution.error,
            actual_value: null,
          };
          continue; // Try again if retries remaining
        }
        element = resolution.element;
        widgetType = window.ccCapabilities.resolveWidgetType(element);
      }

      // Scroll element into view before interacting (mimics human behavior)
      if (element && element.scrollIntoView) {
        element.scrollIntoView({ block: 'center', behavior: 'instant' });
      }

      // Dispatch through capability registry
      // Forward all action properties to the capability handler
      var dispatchAction = Object.assign({}, actionDef, {
        timeout_ms: actionDef.timeout_ms || 10000,
      });

      var context = {
        element: element,
        widgetType: widgetType,
      };

      lastResult = await window.ccCapabilities.dispatch(dispatchAction, context);

      if (lastResult.status === 'success') break;
    }

    // Track navigate and form_submitted from successful actions
    var _didSubmit = false;
    if (lastResult.status === 'success') {
      if (actionDef.action === 'click' && element) {
        var tag = (element.tagName || '').toLowerCase();
        var elType = (element.type || '').toLowerCase();
        if ((tag === 'button' && elType === 'submit') ||
            (tag === 'input' && elType === 'submit') ||
            (element.getAttribute && element.getAttribute('type') === 'submit')) {
          _didSubmit = true;
        }
      }
    }

    var duration = Date.now() - t0;
    var outcome = lastResult.status === 'success' ? 'success' :
                  lastResult.status === 'timeout' ? 'timeout' :
                  lastResult.status === 'waiting_human' ? 'waiting_human' : 'failure';

    return {
      pathEntry: {
        node_id: nodeId,
        status: lastResult.status,
        actual_value: lastResult.actual_value || null,
        error: lastResult.error || null,
        duration_ms: duration,
      },
      outcome: outcome,
      didNavigate: lastResult.status === 'success' && actionDef.action === 'navigate',
      didSubmit: _didSubmit,
    };
  }

  function _executeCheckpoint(nodeId, checkpointDef, observation) {
    var t0 = Date.now();
    observation.checkpoints_reached.push(checkpointDef.checkpoint_id || nodeId);

    // Optional state snapshot
    if (checkpointDef.save_state && typeof extractFormFieldsWithFingerprint === 'function') {
      try {
        var state = extractFormFieldsWithFingerprint();
        observation.page_state = {
          url: window.location.href,
          navigated: false,
          form_submitted: false,
          fields_snapshot: state.formFields.map(function (f) {
            return { label: f.label, value: f.value || '' };
          }),
        };
      } catch (e) { /* extraction failure is non-fatal for checkpoint */ }
    }

    return {
      pathEntry: {
        node_id: nodeId,
        status: 'success',
        actual_value: checkpointDef.label || checkpointDef.checkpoint_id,
        error: null,
        duration_ms: Date.now() - t0,
      },
      outcome: 'success',
    };
  }

  async function _executeBranch(nodeId, conditionDef) {
    var t0 = Date.now();

    if (!conditionDef) {
      return {
        pathEntry: { node_id: nodeId, status: 'failed', actual_value: null, error: 'no_condition', duration_ms: 0 },
        outcome: 'failure',
      };
    }

    var result = false;
    var element = null;

    // Resolve target if condition needs it
    if (conditionDef.target) {
      var resolution = window.ccResolver.resolve(conditionDef.target);
      element = resolution.element;
    }

    switch (conditionDef.condition_type) {
      case 'element_exists':
        result = !!element;
        break;

      case 'element_visible':
        if (element && window.ccDomUtils && window.ccDomUtils.isVisible) {
          result = window.ccDomUtils.isVisible(element);
        } else if (element) {
          var rect = element.getBoundingClientRect();
          result = rect.width > 0 && rect.height > 0;
        }
        break;

      case 'value_equals':
        if (element) {
          var actual = element.value || element.textContent || '';
          result = actual.trim() === (conditionDef.expected || '').trim();
        }
        break;

      case 'page_url_matches':
        if (conditionDef.pattern) {
          try {
            result = new RegExp(conditionDef.pattern).test(window.location.href);
          } catch (e) { result = false; }
        }
        break;

      case 'field_has_value':
        if (element) {
          result = !!(element.value && element.value.trim());
        }
        break;

      default:
        result = false;
    }

    return {
      pathEntry: {
        node_id: nodeId,
        status: 'success',
        actual_value: String(result),
        error: null,
        duration_ms: Date.now() - t0,
      },
      outcome: result ? 'success' : 'failure',
    };
  }

  function _executeTerminal(nodeId, terminalDef, observation) {
    return {
      pathEntry: {
        node_id: nodeId,
        status: terminalDef.status === 'complete' ? 'success' : 'failed',
        actual_value: terminalDef.status,
        error: terminalDef.reason || null,
        duration_ms: 0,
      },
      outcome: terminalDef.status === 'complete' ? 'success' : 'failure',
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Edge Following
  // ══════════════════════════════════════════════════════════════════════

  function _followEdge(edgeIndex, fromNode, outcome) {
    var edges = edgeIndex[fromNode] || [];

    // Try exact outcome match first
    for (var i = 0; i < edges.length; i++) {
      if (edges[i].condition === outcome) return edges[i].to;
    }

    // Try 'always' edge
    for (var j = 0; j < edges.length; j++) {
      if (edges[j].condition === 'always') return edges[j].to;
    }

    // No matching edge — execution ends
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Observation Builder
  // ══════════════════════════════════════════════════════════════════════

  function _createObservation(plan) {
    return {
      plan_id: plan.plan_id || '',
      session_id: plan.session_id || '',
      protocol_version: 2,
      execution_path: [],
      checkpoints_reached: [],
      corrections: [],
      human_interactions: [],
      page_state: null,
    };
  }

  function _capturePageState(navigated, formSubmitted) {
    return {
      url: window.location.href,
      navigated: !!navigated,
      form_submitted: !!formSubmitted,
      fields_snapshot: null,
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Expose
  // ══════════════════════════════════════════════════════════════════════

  window.ccRunner = {
    version: RUNNER_VERSION,
    execute: execute,
    executeLinear: executeLinear,
    fromLinear: fromLinear,
  };
})();
