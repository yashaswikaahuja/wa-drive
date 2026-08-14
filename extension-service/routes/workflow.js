/**
 * Phase 4.14 — Workflow HTTP Routes
 *
 * POST /workflow-create — Create a new workflow for a customer session.
 * POST /workflow-complete-task — Mark current task complete, get next task.
 *
 * Architecture: Server = Brain + Memory + Knowledge.
 * Workflow layer owns task ordering, identity, and state.
 * Does NOT own execution mode, safety, or HIM decisions.
 */

import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import {
  createWorkflow,
  getWorkflow,
  completeCurrentTask,
  failCurrentTask,
  getWorkflowSummary,
} from '../workflow-session.js';

const router = Router();

/**
 * POST /workflow-create
 *
 * Body: { customer_id, profile_id, tasks: [{ type, form_key, portal_id }] }
 * Returns: { workflow_id, status, current_task }
 *
 * Called by popup.js before first fill to establish a workflow context.
 * The workflow coordinates task ordering — it does NOT plan fills.
 */
router.post('/workflow-create', authMiddleware, (req, res) => {
  try {
    const { customer_id, profile_id, tasks } = req.body;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'tasks array is required and must not be empty' });
    }

    // workspace_id from auth token (injected by authMiddleware)
    const workspace_id = req.user?.workspaceId || req.body.workspace_id || 'ws:default';

    const workflow = createWorkflow({
      workspace_id,
      customer_id: customer_id || null,
      profile_id: profile_id || null,
      tasks,
    });

    const currentTask = workflow.tasks[0] || null;

    res.json({
      workflow_id: workflow.workflow_id,
      status: workflow.status,
      current_task: currentTask ? {
        task_id: currentTask.task_id,
        type: currentTask.type,
        form_key: currentTask.form_key,
        portal_id: currentTask.portal_id,
        status: currentTask.status,
      } : null,
      total_tasks: workflow.tasks.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /workflow-complete-task
 *
 * Body: { workflow_id, result: { filled, skipped } }
 * Returns: { next_task, workflow_status, completed_tasks, total_tasks }
 *
 * Called by fill-orchestrator.js after a successful fill.
 * Only successful completion advances the workflow.
 * Failed fills must NOT call this endpoint.
 */
router.post('/workflow-complete-task', authMiddleware, (req, res) => {
  try {
    const { workflow_id, result } = req.body;

    if (!workflow_id) {
      return res.status(400).json({ error: 'workflow_id is required' });
    }

    const wf = getWorkflow(workflow_id);
    if (!wf) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Guard: workflow must be in a state where completion makes sense
    if (wf.status === 'completed' || wf.status === 'failed') {
      return res.status(409).json({
        error: `Workflow already ${wf.status}`,
        workflow_status: wf.status,
      });
    }

    // Guard: current task must exist
    const currentTask = wf.tasks[wf.current_task_index];
    if (!currentTask) {
      return res.status(409).json({ error: 'No active task to complete' });
    }

    // Complete the current task and advance
    const { workflow, next_task } = completeCurrentTask(workflow_id, result || null);

    res.json({
      next_task: next_task ? {
        task_id: next_task.task_id,
        type: next_task.type,
        form_key: next_task.form_key,
        portal_id: next_task.portal_id,
        status: next_task.status,
      } : null,
      workflow_status: workflow.status,
      completed_tasks: workflow.tasks.filter(t => t.status === 'completed').length,
      total_tasks: workflow.tasks.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
