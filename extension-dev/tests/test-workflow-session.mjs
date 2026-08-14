#!/usr/bin/env node
/**
 * Phase 4.14 — Continuous Workflow Execution tests
 * Issue #208: Workflow sessions, task transitions, pause/resume/recovery.
 */
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const modPath = resolve(ROOT, 'extension-service/workflow-session.js');
const {
  createWorkflow, getWorkflow, linkFillSession,
  completeCurrentTask, pauseWorkflow, resumeWorkflow,
  completeRecovery, failCurrentTask, getWorkflowSummary,
} = await import(pathToFileURL(modPath).href);

let passed = 0;
let failed = 0;

function ok(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function test(name, fn) {
  try { fn(); }
  catch (e) { failed++; console.error(`  FAIL: ${name} — ${e.message}`); }
}

// ── createWorkflow ──────────────────────────────────────────────────────

test('creates workflow with tasks', () => {
  const wf = createWorkflow({
    workspace_id: 'ws:1', customer_id: 'cust:1', profile_id: 'prof:1',
    tasks: [
      { type: 'fill', form_key: '/form-a', portal_id: 'portal.gov.in' },
      { type: 'fill', form_key: '/form-b', portal_id: 'portal.gov.in' },
    ],
  });
  ok(wf.workflow_id.startsWith('wf:'), `id=${wf.workflow_id}`);
  ok(wf.status === 'active', `status=${wf.status}`);
  ok(wf.tasks.length === 2, `tasks=${wf.tasks.length}`);
  ok(wf.tasks[0].status === 'active', 'first task active');
  ok(wf.tasks[1].status === 'pending', 'second task pending');
  ok(wf.current_task_index === 0, 'index=0');
  ok(wf.customer_id === 'cust:1', 'customer set');
});

test('creates empty workflow as idle', () => {
  const wf = createWorkflow({ workspace_id: 'ws:2' });
  ok(wf.status === 'idle', `empty workflow status=${wf.status}`);
  ok(wf.tasks.length === 0, 'no tasks');
});

// ── getWorkflow ─────────────────────────────────────────────────────────

test('retrieves workflow by ID', () => {
  const wf = createWorkflow({ workspace_id: 'ws:get', tasks: [{ type: 'fill' }] });
  const retrieved = getWorkflow(wf.workflow_id);
  ok(retrieved !== null, 'found');
  ok(retrieved.workflow_id === wf.workflow_id, 'same id');
});

test('returns null for unknown workflow', () => {
  ok(getWorkflow('wf:nonexistent') === null, 'null for unknown');
});

// ── linkFillSession ─────────────────────────────────────────────────────

test('links fill session to current task', () => {
  const wf = createWorkflow({ workspace_id: 'ws:link', tasks: [{ type: 'fill' }] });
  linkFillSession(wf.workflow_id, 'fsess:abc');
  const updated = getWorkflow(wf.workflow_id);
  ok(updated.tasks[0].fill_session_id === 'fsess:abc', 'linked');
  ok(updated.status === 'fill_in_progress', `status=${updated.status}`);
});

// ── completeCurrentTask ─────────────────────────────────────────────────

test('completes task and advances to next', () => {
  const wf = createWorkflow({ workspace_id: 'ws:adv', tasks: [{ type: 'fill' }, { type: 'fill' }] });
  const { next_task } = completeCurrentTask(wf.workflow_id, { filled: 5 });
  ok(next_task !== null, 'has next task');
  ok(next_task.status === 'active', 'next is active');
  const updated = getWorkflow(wf.workflow_id);
  ok(updated.tasks[0].status === 'completed', 'first completed');
  ok(updated.tasks[0].result?.filled === 5, 'result stored');
  ok(updated.current_task_index === 1, 'index advanced');
  ok(updated.status === 'active', `status=${updated.status}`);
});

test('completing last task marks workflow completed', () => {
  const wf = createWorkflow({ workspace_id: 'ws:last', tasks: [{ type: 'fill' }] });
  const { next_task } = completeCurrentTask(wf.workflow_id);
  ok(next_task === null, 'no next task');
  const updated = getWorkflow(wf.workflow_id);
  ok(updated.status === 'completed', `status=${updated.status}`);
  ok(updated.completed_at !== null, 'completed_at set');
});

// ── pauseWorkflow ───────────────────────────────────────────────────────

test('pauses workflow with browser state', () => {
  const wf = createWorkflow({ workspace_id: 'ws:pause', tasks: [{ type: 'fill' }] });
  pauseWorkflow(wf.workflow_id, { document_id: 'doc:1', revision: 3 });
  const updated = getWorkflow(wf.workflow_id);
  ok(updated.status === 'paused', `status=${updated.status}`);
  ok(updated.recovery_state?.document_id === 'doc:1', 'recovery state saved');
});

// ── resumeWorkflow ──────────────────────────────────────────────────────

test('resume requires revalidation (never assumes stale state)', () => {
  const wf = createWorkflow({ workspace_id: 'ws:resume', tasks: [{ type: 'fill' }] });
  pauseWorkflow(wf.workflow_id);
  const { requires_revalidation } = resumeWorkflow(wf.workflow_id);
  ok(requires_revalidation === true, 'revalidation required');
  const updated = getWorkflow(wf.workflow_id);
  ok(updated.status === 'recovering', `status=${updated.status}`);
});

test('cannot resume non-paused workflow', () => {
  const wf = createWorkflow({ workspace_id: 'ws:noresume', tasks: [{ type: 'fill' }] });
  let threw = false;
  try { resumeWorkflow(wf.workflow_id); } catch { threw = true; }
  ok(threw, 'throws on non-paused resume');
});

// ── completeRecovery ────────────────────────────────────────────────────

test('recovery clears state and resumes', () => {
  const wf = createWorkflow({ workspace_id: 'ws:recover', tasks: [{ type: 'fill' }] });
  linkFillSession(wf.workflow_id, 'fsess:r');
  pauseWorkflow(wf.workflow_id, { doc: 'state' });
  resumeWorkflow(wf.workflow_id);
  completeRecovery(wf.workflow_id);
  const updated = getWorkflow(wf.workflow_id);
  ok(updated.status === 'fill_in_progress', `status=${updated.status}`);
  ok(updated.recovery_state === null, 'recovery state cleared');
});

// ── failCurrentTask ─────────────────────────────────────────────────────

test('failing task marks workflow failed', () => {
  const wf = createWorkflow({ workspace_id: 'ws:fail', tasks: [{ type: 'fill' }] });
  failCurrentTask(wf.workflow_id, 'perception_failed');
  const updated = getWorkflow(wf.workflow_id);
  ok(updated.status === 'failed', `status=${updated.status}`);
  ok(updated.tasks[0].status === 'failed', 'task failed');
  ok(updated.tasks[0].result?.error === 'perception_failed', 'reason stored');
});

// ── getWorkflowSummary ──────────────────────────────────────────────────

test('summary shows operator-visible state', () => {
  const wf = createWorkflow({ workspace_id: 'ws:summary', customer_id: 'cust:x',
    tasks: [{ type: 'fill', form_key: '/a' }, { type: 'fill', form_key: '/b' }] });
  completeCurrentTask(wf.workflow_id);
  const summary = getWorkflowSummary(wf.workflow_id);
  ok(summary.total_tasks === 2, `total=${summary.total_tasks}`);
  ok(summary.completed_tasks === 1, `completed=${summary.completed_tasks}`);
  ok(summary.current_task?.form_key === '/b', `current=${summary.current_task?.form_key}`);
  ok(summary.customer_id === 'cust:x', 'customer visible');
});

test('summary null for unknown workflow', () => {
  ok(getWorkflowSummary('wf:nope') === null, 'null');
});

// ── History ─────────────────────────────────────────────────────────────

test('workflow records history events', () => {
  const wf = createWorkflow({ workspace_id: 'ws:hist', tasks: [{ type: 'fill' }] });
  linkFillSession(wf.workflow_id, 'fsess:h');
  pauseWorkflow(wf.workflow_id);
  resumeWorkflow(wf.workflow_id);
  completeRecovery(wf.workflow_id);
  const updated = getWorkflow(wf.workflow_id);
  ok(updated.history.events.length >= 3, `events=${updated.history.events.length}`);
  ok(updated.history.events.some(e => e.type === 'fill_linked'), 'has fill_linked');
  ok(updated.history.events.some(e => e.type === 'paused'), 'has paused');
  ok(updated.history.events.some(e => e.type === 'recovery_complete'), 'has recovery_complete');
});

// ── HIM compatibility ───────────────────────────────────────────────────

test('pause during HIM preserves fill_session_id', () => {
  const wf = createWorkflow({ workspace_id: 'ws:him', tasks: [{ type: 'fill' }] });
  linkFillSession(wf.workflow_id, 'fsess:him');
  pauseWorkflow(wf.workflow_id, { him_active: true });
  const updated = getWorkflow(wf.workflow_id);
  ok(updated.tasks[0].fill_session_id === 'fsess:him', 'session preserved across HIM pause');
});

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\nWorkflow Session (M4.14): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
