/**
 * Phase 4.4 — Operator Execution Mode Control
 *
 * Merges operator preference with system classification to produce
 * the effective execution mode for a fill run.
 *
 * Authority hierarchy (highest wins for safety):
 * 1. Hard runtime evidence → always demotes to dynamic (handled by clamp)
 * 2. Server policy → bounds, refuses unsafe multi-step
 * 3. Operator preference → AUTO/STATIC/DYNAMIC
 * 4. System classification → belief input
 *
 * Decision table:
 * | Operator | System   | Effective          |
 * |----------|----------|--------------------|
 * | AUTO     | STATIC   | static (demotable) |
 * | AUTO     | DYNAMIC  | dynamic            |
 * | AUTO     | UNKNOWN  | dynamic            |
 * | STATIC   | STATIC   | static             |
 * | STATIC   | DYNAMIC  | dynamic (safety)   |
 * | STATIC   | UNKNOWN  | dynamic (safety)   |
 * | DYNAMIC  | *        | dynamic            |
 */

const VALID_PREFERENCES = ['AUTO', 'STATIC', 'DYNAMIC'];

/**
 * Merge operator preference with system classification.
 *
 * @param {object} params
 * @param {string} params.operatorPreference - AUTO | STATIC | DYNAMIC
 * @param {string} params.systemClassification - STATIC | DYNAMIC | UNKNOWN
 * @returns {{ effective_execution_mode: string, preference_applied: string, demotion: boolean, reason: string }}
 */
export function mergeExecutionMode({ operatorPreference, systemClassification }) {
  const pref = (operatorPreference || 'AUTO').toUpperCase();
  const sys = (systemClassification || 'UNKNOWN').toUpperCase();

  // Validate
  const safePref = VALID_PREFERENCES.includes(pref) ? pref : 'AUTO';

  // DYNAMIC preference always → dynamic
  if (safePref === 'DYNAMIC') {
    return {
      effective_execution_mode: 'dynamic',
      preference_applied: 'DYNAMIC',
      demotion: false,
      reason: 'operator_chose_dynamic',
    };
  }

  // STATIC preference
  if (safePref === 'STATIC') {
    // Server policy: if system says DYNAMIC or UNKNOWN, safety wins → dynamic
    if (sys === 'DYNAMIC' || sys === 'UNKNOWN') {
      return {
        effective_execution_mode: 'dynamic',
        preference_applied: 'STATIC',
        demotion: true,
        reason: sys === 'DYNAMIC'
          ? 'system_dynamic_overrides_operator_static'
          : 'system_unknown_overrides_operator_static',
      };
    }
    // System is STATIC, operator wants STATIC → static
    return {
      effective_execution_mode: 'static',
      preference_applied: 'STATIC',
      demotion: false,
      reason: 'operator_static_system_static',
    };
  }

  // AUTO (default)
  if (sys === 'STATIC') {
    return {
      effective_execution_mode: 'static',
      preference_applied: 'AUTO',
      demotion: false,
      reason: 'auto_system_static',
    };
  }
  // DYNAMIC or UNKNOWN → dynamic
  return {
    effective_execution_mode: 'dynamic',
    preference_applied: 'AUTO',
    demotion: sys === 'DYNAMIC' ? false : false,
    reason: sys === 'DYNAMIC' ? 'auto_system_dynamic' : 'auto_system_unknown',
  };
}
