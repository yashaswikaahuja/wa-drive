// planner.js — Generates FillPlan from formFields + profile
// Callable from popup, background, floating button, or remote trigger
// Does NOT touch DOM or execute fills — only produces the plan

async function generateFillPlan({ tabId, profile, backendUrl, groqKey }) {
  // Step 1: Extract form fields
  const fieldsResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractFormFieldsWithFingerprint,
  });
  const { formFields, formKey, semanticFormKey } = fieldsResult?.[0]?.result ?? { formFields: [], formKey: '', semanticFormKey: '' };
  if (!formFields.length) return { error: 'No form fields found', formFields: [], mapping: {}, filledBySource: {} };

  let mapping = {};
  let filledBySource = {};
  const primaryKey = semanticFormKey || formKey;

  // Step 2: Load saved mappings
  let savedMapping = null;
  if (backendUrl) {
    for (const key of [primaryKey, formKey]) {
      if (!key) continue;
      try {
        const res = await fetch(`${backendUrl}/mappings/${key}`);
        const data = await res.json();
        if (data && typeof data === 'object' && Object.keys(data).length > 0) { savedMapping = data; break; }
      } catch {}
    }
  }

  // Step 3: Apply saved mappings
  if (savedMapping) {
    for (const field of formFields) {
      const semanticKey = getSemanticKey(field.label);
      const saved = savedMapping[semanticKey];
      if (!saved) continue;
      const conf = calcConfidence(saved.fills || 0, saved.corrections || 0);
      if (conf >= 0.2 && saved.profileKey && profile[saved.profileKey]) {
        mapping[field.selector] = { value: profile[saved.profileKey], type: field.type };
        filledBySource[field.selector] = { label: field.label, semanticKey, profileKey: saved.profileKey, source: 'saved', confidence: conf };
      }
    }
  }

  // Step 4: AI-first for new forms
  const isNewForm = !savedMapping || Object.keys(savedMapping).length === 0;
  if (isNewForm && groqKey) {
    const allUnmappedForAI = formFields.filter(f => !mapping[f.selector] && !/captcha|otp|token|password|security.code/i.test(f.label));
    if (allUnmappedForAI.length > 0) {
      const aiFirst = await aiMatch(allUnmappedForAI, profile, groqKey);
      for (const [sel, val] of Object.entries(aiFirst)) {
        mapping[sel] = val;
        const field = formFields.find(f => f.selector === sel);
        if (field) {
          const profileKey = Object.entries(profile).find(([, v]) => v === val.value)?.[0];
          filledBySource[sel] = { label: field.label, semanticKey: getSemanticKey(field.label), profileKey, source: 'ai', confidence: 0.7 };
        }
      }
    }
  }

  // Step 5: Confirm/retype mirror
  for (const field of formFields) {
    if (mapping[field.selector]) continue;
    const ident = (field.label || '').toLowerCase() + ' ' + (field.id || '') + ' ' + (field.name || '');
    const isConfirm = /retype|re.type|confirm|re.enter|verify/i.test(ident);
    if (!isConfirm) continue;
    const baseId = (field.id || '').replace(/^c(?=[a-z])/i, '').replace(/^confirm/i, '').replace(/^retype/i, '').replace(/^re_?type_?/i, '');
    const baseLabel = ident.replace(/retype|re.type|confirm|re.enter|verify/gi, '').replace(/[^a-z0-9]/g, ' ').trim();
    // Match by ID
    for (const [sel, val] of Object.entries(mapping)) {
      const selId = sel.replace(/^#/, '').replace(/\[.*\]/, '');
      if (baseId && selId && selId.toLowerCase() === baseId.toLowerCase()) {
        mapping[field.selector] = { value: val.value, type: field.type };
        filledBySource[field.selector] = { label: field.label, semanticKey: baseLabel, profileKey: filledBySource[sel]?.profileKey, source: 'confirm-mirror', confidence: 1 };
        break;
      }
    }
    // Match by label
    if (!mapping[field.selector]) {
      for (const f2 of formFields) {
        if (!mapping[f2.selector] || f2.selector === field.selector) continue;
        const f2Label = (f2.label || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        if (baseLabel && f2Label && (f2Label.includes(baseLabel.split(' ')[0]) || baseLabel.includes(f2Label.split(' ')[0]))) {
          mapping[field.selector] = { value: mapping[f2.selector].value, type: field.type };
          filledBySource[field.selector] = { label: field.label, semanticKey: baseLabel, profileKey: filledBySource[f2.selector]?.profileKey, source: 'confirm-mirror', confidence: 0.9 };
          break;
        }
      }
    }
    // Match by intent
    if (!mapping[field.selector] && baseLabel) {
      for (const [sel, info] of Object.entries(filledBySource)) {
        if (!mapping[sel] || sel === field.selector) continue;
        const infoLabel = (info.semanticKey || info.label || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        if (infoLabel && baseLabel && (infoLabel.includes(baseLabel) || baseLabel.includes(infoLabel))) {
          mapping[field.selector] = { value: mapping[sel].value, type: field.type };
          filledBySource[field.selector] = { label: field.label, semanticKey: baseLabel, profileKey: info.profileKey, source: 'confirm-mirror', confidence: 0.85 };
          break;
        }
      }
    }
  }

  // Step 6: Fuzzy match (skip if AI already ran on new form)
  const unmapped1 = isNewForm && groqKey ? [] : formFields.filter(f => !mapping[f.selector]);
  const fuzzyResult = fuzzyMatch(unmapped1, profile);
  for (const [sel, val] of Object.entries(fuzzyResult)) {
    mapping[sel] = val;
    const field = formFields.find(f => f.selector === sel);
    if (field) {
      const profileKey = Object.entries(profile).find(([, v]) => v === val.value)?.[0];
      filledBySource[sel] = { label: field.label, semanticKey: getSemanticKey(field.label), profileKey, source: 'fuzzy', confidence: 0.6 };
    }
  }

  // Step 7: AI for remaining unmapped (known forms only)
  if (!isNewForm) {
    const unmapped2 = formFields.filter(f => !mapping[f.selector]);
    const worthMapping = unmapped2.filter(f => !/verify|confirm|captcha|otp|token|password/i.test(f.label));
    if (worthMapping.length > 0 && groqKey) {
      const aiMapping = await aiMatch(worthMapping, profile, groqKey);
      for (const [sel, val] of Object.entries(aiMapping)) {
        mapping[sel] = val;
        const field = formFields.find(f => f.selector === sel);
        if (field) {
          const profileKey = Object.entries(profile).find(([, v]) => v === val.value)?.[0];
          filledBySource[sel] = { label: field.label, semanticKey: getSemanticKey(field.label), profileKey, source: 'ai', confidence: 0.5 };
        }
      }
    }
  }

  // Step 8: Load portal adapters
  let portalAdapters = {};
  if (backendUrl) {
    try {
      const hostname = new URL((await chrome.tabs.get(tabId)).url).hostname;
      const ar = await fetch(`${backendUrl}/adapters/${hostname}`);
      portalAdapters = await ar.json();
    } catch {}
  }

  return { mapping, filledBySource, formFields, formKey, semanticFormKey, primaryKey, portalAdapters, isNewForm };
}
