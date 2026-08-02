// ═══════════════════════════════════════════════════════════════════════════
// WORLD — what exists. (Primitive 1 of 6)
// ═══════════════════════════════════════════════════════════════════════════
// The system's belief state about reality: the current Interface (page/form)
// and the Customer (records + documents). Wraps the proven extractor and
// derivation code; adds a STABLE field identity (semantic key) so knowledge
// survives DOM/selector changes.
// ───────────────────────────────────────────────────────────────────────────

(function () {
  if (window.CCWorld) return;

  const norm = (s) => (s == null ? '' : String(s)).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

  // Describe the current page/form as the system perceives it.
  // Returns { interface: {hostname,title,formKey}, fields: [ {id, label, type,
  //   options, optionSelectors, selector, placeholder} ] } — selector is the
  //   RESOLUTION handle for THIS DOM; id (semantic key) is the STABLE identity.
  function describePage(extracted) {
    if (!extracted && typeof extractFormFieldsWithFingerprint !== 'function') {
      return { interface: { hostname: location.hostname, title: document.title, formKey: null }, fields: [], raw: [] };
    }
    const ex = extracted || extractFormFieldsWithFingerprint();
    const formFields = ex.formFields || [];
    const semanticFormKey = ex.semanticFormKey;
    const fields = formFields.map(f => ({
      id: norm(f.label),                 // STABLE semantic identity
      label: f.label || '',
      type: f.type || 'text',
      options: f.options || null,
      optionSelectors: f.optionSelectors || null,
      selector: f.selector,              // volatile DOM handle (resolved at execution)
      placeholder: f.placeholder || '',
      order: f.index,
    }));
    return {
      interface: {
        hostname: location.hostname,
        title: (document.title || '').slice(0, 120),
        formKey: semanticFormKey,
      },
      fields,
      raw: formFields,                    // original extractor output (for fuzzy/AI/executor)
    };
  }

  // Describe the customer: enriched records (via derivation) + documents.
  // profile is the flattened profile passed from popup.
  function describeCustomer(profile) {
    let records = profile || {};
    if (typeof ccDeriveProfile === 'function') {
      try { records = ccDeriveProfile(profile); } catch (e) { console.warn('[CC] derive failed:', e.message); }
    }
    // Documents: the profile may carry a documents[] list (typed file refs).
    const documents = Array.isArray(profile && profile.documents) ? profile.documents : [];
    return {
      records,                            // flat key→value facts (+ _derived list)
      documents,                          // [{type, url, filename, ...}]
      derived: records._derived || [],
      has: (key) => records[key] != null && String(records[key]).trim() !== '',
    };
  }

  window.CCWorld = { describePage, describeCustomer, norm };
})();
