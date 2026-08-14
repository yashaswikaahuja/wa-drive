/**
 * Phase 4.14 — Continuous Workflow Execution
 *
 * Models an operator workflow: a sequence of tasks (fills) for a customer,
 * preserving execution state across transitions.
 *
 * Architecture: Server = Brain + Memory + Knowledge.
 * Strategic workflow ownership lives here, not in the extension.
 *
 * A workflow session:
 * - Tracks current customer/task
 * - Preserves perception/execution history
 * - Manages transitions between completed fills and next tasks
 * - Supports pause/resume/recovery without assuming stale state
 * - Compatible with HIM (Phase 4.0/4.13)
 */

import { randomUUID } from 'node:crypto';

/**
 * @typedef {'idle'|'active'|'fill_in_progress'|'fill_complete'|'paused'|'recovering'|'completed'|'failed'} WorkflowStatus
 */

/**
 * @typedef {object} WorkflowTask
 * @property {string} task_id
 * @property {string} type - 'fill' | 'navigate' | 'verify'
 * @property {string|null} form_key - Target form scope
 * @property {string|null} portal_id - Target portal
 * @property {string} status - 'pending' | 'active' | 'completed' | 'failed' | 'skipped'
 * @property {string|null} fill_session_id - Associated fill session
 * @property {string|null} started_at
 * @property {string|null} completed_at
 * @property {object|null} result - Task outcome summary
 */

/**
 * @typedef {object} WorkflowSession
 * @property {string} workflow_id
 * @property {string} workspace_id
 * @property {string|null} customer_id - Current customer/profile being served
 * @property {string|null} profile_id
 * @property {WorkflowStatus} status
 * @property {WorkflowTask[]} tasks - Ordered task list
 * @property {number} current_task_index - Index of active task
 * @property {object|null} recovery_state - Browser state for recovery validation
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string|null} completed_at
 * @property {object} history - Execution history log
 */

/** In-memory workflow store. */
const workflows = new Map();

/**
 * Create a new workflow session.
 *
 * @param {object} params
 * @param {string} params.workspace_id
 * @param {string} [params.customer_id]
 * @param {string} [params.profile_id]
 * @param {WorkflowTask[]} [params.tasks] - Pre-planned task list
 * @returns {WorkflowSession}
 */
export function createWorkflow({ workspace_id, customer_id = null, profile_id = null, tasks = [] }) {
  const now = new Date().toISOString();
  const workflow = {
    workflow_id: `wf:${randomUUID().replace(/-/g, '').slice(0, 20)}`,
    workspace_id,
    customer_id,
    profile_id,
    status: tasks.length > 0 ? 'active' : 'idle',
    tasks: tasks.map((t, i) => ({
      task_id: t.task_id || `task:${randomUUID().slice(0, 8)}`,
      type: t.type || 'fill',
      form_key: t.form_key || null,
      portal_id: t.portal_id || null,
      status: i === 0 ? 'active' : 'pending',
      fill_session_id: null,
      started_at: i === 0 ? now : null,
      completed_at: null,
      result: null,
    })),
    current_task_index: 0,
    recovery_state: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    history: { events: [] },
  };

  workflows.set(workflow.workflow_id, workflow);
  return workflow;
}

/**
 * Get a workflow by ID.
 * @param {string} workflow_id
 * @returns {WorkflowSession|null}
 */
export function getWorkflow(workflow_id) {
  return workflows.get(workflow_id) || null;
}

/**
 * Link a fill session to the current workflow task.
 *
 * @param {string} workflow_id
 * @param {string} fill_session_id
 * @returns {WorkflowSession}
 */
export function linkFillSession(workflow_id, fill_session_id) {
  const wf = workflows.get(workflow_id);
  if (!wf) throw new Error(`Workflow not found: ${workflow_id}`);
  const task = wf.tasks[wf.current_task_index];
  if (!task) throw new Error('No active task');
  task.fill_session_id = fill_session_id;
  wf.status = 'fill_in_progress';
  wf.updated_at = new Date().toISOString();
  addEvent(wf, 'fill_linked', { fill_session_id, task_id: task.task_id });
  return wf;
}

/**
 * Mark the current task as completed and advance to next.
 *
 * @param {string} workflow_id
 * @param {object} [result] - Task outcome summary
 * @returns {{ workflow: WorkflowSession, next_task: WorkflowTask|null }}
 */
export function completeCurrentTask(workflow_id, result = null) {
  const wf = workflows.get(workflow_id);
  if (!wf) throw new Error(`Workflow not found: ${workflow_id}`);

  const task = wf.tasks[wf.current_task_index];
  if (!task) throw new Error('No active task');

  const now = new Date().toISOString();
  task.status = 'completed';
  task.completed_at = now;
  task.result = result;
  addEvent(wf, 'task_completed', { task_id: task.task_id, result });

  // Advance to next task
  wf.current_task_index++;
  const nextTask = wf.tasks[wf.current_task_index] || null;

  if (nextTask) {
    nextTask.status = 'active';
    nextTask.started_at = now;
    wf.status = 'active';
    addEvent(wf, 'task_started', { task_id: nextTask.task_id });
  } else {
    wf.status = 'completed';
    wf.completed_at = now;
    addEvent(wf, 'workflow_completed', {});
  }

  wf.updated_at = now;
  return { workflow: wf, next_task: nextTask };
}

/**
 * Pause the workflow (HIM, operator break, etc.).
 *
 * @param {string} workflow_id
 * @param {object} [browserState] - Current browser state for recovery
 * @returns {WorkflowSession}
 */
export function pauseWorkflow(workflow_id, browserState = null) {
  const wf = workflows.get(workflow_id);
  if (!wf) throw new Error(`Workflow not found: ${workflow_id}`);

  wf.status = 'paused';
  wf.recovery_state = browserState;
  wf.updated_at = new Date().toISOString();
  addEvent(wf, 'paused', { browser_state_captured: !!browserState });
  return wf;
}

/**
 * Resume a paused workflow.
 * Does NOT assume stale browser state — caller must revalidate.
 *
 * @param {string} workflow_id
 * @returns {{ workflow: WorkflowSession, requires_revalidation: boolean }}
 */
export function resumeWorkflow(workflow_id) {
  const wf = workflows.get(workflow_id);
  if (!wf) throw new Error(`Workflow not found: ${workflow_id}`);
  if (wf.status !== 'paused') throw new Error(`Cannot resume workflow in status: ${wf.status}`);

  const hadRecoveryState = !!wf.recovery_state;
  wf.status = 'recovering';
  wf.updated_at = new Date().toISOString();
  addEvent(wf, 'resuming', { had_recovery_state: hadRecoveryState });

  // Always require revalidation — never assume stale state is correct
  return { workflow: wf, requires_revalidation: true };
}

/**
 * Mark recovery complete, workflow is active again.
 *
 * @param {string} workflow_id
 * @returns {WorkflowSession}
 */
export function completeRecovery(workflow_id) {
  const wf = workflows.get(workflow_id);
  if (!wf) throw new Error(`Workflow not found: ${workflow_id}`);

  const task = wf.tasks[wf.current_task_index];
  wf.status = task ? (task.fill_session_id ? 'fill_in_progress' : 'active') : 'completed';
  wf.recovery_state = null;
  wf.updated_at = new Date().toISOString();
  addEvent(wf, 'recovery_complete', {});
  return wf;
}

/**
 * Fail the current task.
 *
 * @param {string} workflow_id
 * @param {string} reason
 * @returns {WorkflowSession}
 */
export function failCurrentTask(workflow_id, reason) {
  const wf = workflows.get(workflow_id);
  if (!wf) throw new Error(`Workflow not found: ${workflow_id}`);

  const task = wf.tasks[wf.current_task_index];
  if (task) {
    task.status = 'failed';
    task.completed_at = new Date().toISOString();
    task.result = { error: reason };
  }
  wf.status = 'failed';
  wf.updated_at = new Date().toISOString();
  addEvent(wf, 'task_failed', { task_id: task?.task_id, reason });
  return wf;
}

/**
 * Get operator-visible workflow state summary.
 *
 * @param {string} workflow_id
 * @returns {object|null}
 */
export function getWorkflowSummary(workflow_id) {
  const wf = workflows.get(workflow_id);
  if (!wf) return null;

  const completed = wf.tasks.filter(t => t.status === 'completed').length;
  const failed = wf.tasks.filter(t => t.status === 'failed').length;
  const currentTask = wf.tasks[wf.current_task_index] || null;

  return {
    workflow_id: wf.workflow_id,
    status: wf.status,
    customer_id: wf.customer_id,
    total_tasks: wf.tasks.length,
    completed_tasks: completed,
    failed_tasks: failed,
    current_task: currentTask ? {
      task_id: currentTask.task_id,
      type: currentTask.type,
      form_key: currentTask.form_key,
      status: currentTask.status,
    } : null,
    created_at: wf.created_at,
    updated_at: wf.updated_at,
  };
}

function addEvent(wf, type, data) {
  wf.history.events.push({ type, at: new Date().toISOString(), ...data });
  // Cap history at 100 events
  if (wf.history.events.length > 100) {
    wf.history.events = wf.history.events.slice(-50);
  }
}
