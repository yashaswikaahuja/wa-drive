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

  const plan = data.plan || data.action_plan || data;
  if (!plan || plan.kind !== 'action_plan') {
    throw new Error(
      `live response missing action_plan (keys=${Object.keys(data).join(',')})`
    );
  }
  if (plan.schema_version !== '3.0.0') {
    throw new Error(`unexpected plan schema_version ${plan.schema_version}`);
  }
  return { plan, raw: data };
}
