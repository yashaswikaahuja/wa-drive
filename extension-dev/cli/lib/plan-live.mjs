/**
 * Live POST /fill-plan against extension-service.
 */

export async function fetchLivePlan({
  backendUrl,
  token,
  snapshot,
  profile,
  profileId,
  executionPreference,
}) {
  if (!backendUrl) throw new Error('live plan requires --backend-url or CC_BACKEND_URL');
  if (!token) throw new Error('live plan requires --token or CC_ACCESS_TOKEN');
  if (!profile || typeof profile !== 'object') {
    throw new Error('live plan requires profile object');
  }

  const base = String(backendUrl).replace(/\/$/, '');
  // Accept either https://host/api or https://host/api/ (routes are /fill-plan under /api)
  const url = base.endsWith('/fill-plan') ? base : `${base}/fill-plan`;

  const body = {
    snapshot,
    profile,
    profileId: profileId || null,
    // match extension fill-orchestrator field names
    operator_execution_preference: executionPreference || 'AUTO',
    executionPreference: executionPreference || 'AUTO',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`fill-plan non-JSON HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!res.ok) {
    throw new Error(
      `fill-plan HTTP ${res.status}: ${JSON.stringify(data).slice(0, 500)}`
    );
  }

  // Server shape: { plan, classification, session, diagnostics, message? }
  // plan may be null when planner finds nothing to fill (still HTTP 200).
  const plan = data.plan ?? data.action_plan ?? null;
  if (!plan) {
    const diag = data.diagnostics || {};
    const msg = data.message || diag.note || 'server returned plan: null';
    const err = new Error(
      `NO FILL PLAN from server — nothing to execute.\n` +
        `  message: ${msg}\n` +
        `  diagnostics: ${JSON.stringify(diag).slice(0, 600)}\n` +
        `  classification: ${JSON.stringify(data.classification)}\n` +
        `Tip: --url must be an actual form page (not a homepage/landing page). ` +
        `SSC home (ssc.gov.in) has links, not fillable mapped fields.`
    );
    err.raw = data;
    err.code = 'empty_plan';
    throw err;
  }
  if (plan.kind && plan.kind !== 'action_plan') {
    throw new Error(`unexpected plan.kind=${plan.kind} (want action_plan)`);
  }
  if (plan.schema_version && plan.schema_version !== '3.0.0') {
    throw new Error(`unexpected plan schema_version ${plan.schema_version}`);
  }
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    const err = new Error(
      `Server plan has 0 steps — mapping found no fields to fill.\n` +
        `  diagnostics: ${JSON.stringify(data.diagnostics || {}).slice(0, 600)}`
    );
    err.raw = data;
    err.code = 'empty_steps';
    throw err;
  }
  return { plan, raw: data };
}
