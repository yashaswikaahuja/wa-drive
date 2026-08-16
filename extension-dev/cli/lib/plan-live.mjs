/**
 * Phase 2: live /fill-plan against extension-service.
 * Offline MVP does not require this; implemented for --mode live.
 */

export async function fetchLivePlan({ backendUrl, token, snapshot, profile, executionPreference }) {
  if (!backendUrl) throw new Error('live plan requires --backend-url or CC_BACKEND_URL');
  if (!token) throw new Error('live plan requires --token or CC_ACCESS_TOKEN / ACCESS_TOKEN');
  if (!profile) throw new Error('live plan requires --profile <json-file>');

  const base = String(backendUrl).replace(/\/$/, '');
  const url = `${base}/fill-plan`;
  const body = {
    snapshot,
    profile,
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
    throw new Error(`fill-plan non-JSON ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`fill-plan HTTP ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }

  const plan = data.plan || data.action_plan || data;
  if (plan.kind !== 'action_plan' || plan.schema_version !== '3.0.0') {
    throw new Error(
      `live plan is not action_plan 3.0.0 (kind=${plan.kind} schema=${plan.schema_version})`
    );
  }
  return { plan, raw: data };
}
