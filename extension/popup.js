const CURRENT_VERSION = '4.55';
let selectedProfile = null;

// Check for updates on every popup open
chrome.storage.local.get(['backendUrl'], async (result) => {
  if (!result.backendUrl) return;
  try {
    const _vbase = result.backendUrl.replace(/\/api$/, '');
    const res = await fetch(`${_vbase}/api/extension/version`);
    const { version, download_url } = await res.json();
    if (version && version !== CURRENT_VERSION) {
      const banner = document.getElementById('update-banner');
      const link = document.getElementById('update-link');
      if (banner && link) {
        link.href = (typeof download_url === 'string' && download_url.startsWith('http'))
          ? download_url : result.backendUrl + '/api/extension/download';
        banner.style.display = 'block';
      }
    }
  } catch { /* ignore */ }
});

// Load saved settings
chrome.storage.local.get(['backendUrl', 'groqKey'], (result) => {
  if (result.backendUrl) document.getElementById('backend-url').value = result.backendUrl;
  if (result.groqKey) document.getElementById('groq-key').value = result.groqKey;
  if (result.backendUrl) loadProfiles(result.backendUrl);
});

document.getElementById('save-settings').addEventListener('click', () => {
  const url = document.getElementById('backend-url').value.trim().replace(/\/$/, '');
  const key = document.getElementById('groq-key').value.trim();
  chrome.storage.local.set({ backendUrl: url, groqKey: key }, () => {
    showStatus('Settings saved!', 'success');
    loadProfiles(url);
  });
});

document.getElementById('refresh-btn').addEventListener('click', () => {
  const url = document.getElementById('backend-url').value.trim();
  if (url) loadProfiles(url);
});

let _autofillRunning = false;
document.getElementById('autofill-btn').addEventListener('click', async () => {
  if (_autofillRunning) return;
  _autofillRunning = true;
  setTimeout(() => { _autofillRunning = false; }, 8000);
  if (!selectedProfile) return;
  const { groqKey, backendUrl } = await chrome.storage.local.get(['groqKey', 'backendUrl']);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  showStatus('Analyzing form...', 'info');

  // Step 1: Get all form fields + generate form fingerprint
  const fieldsResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractFormFieldsWithFingerprint,
  });

  const { formFields, formKey, semanticFormKey } = fieldsResult?.[0]?.result ?? { formFields: [], formKey: '', semanticFormKey: '' };
  if (!formFields.length) { showStatus('No form fields found on this page.', 'error'); return; }

  let mapping = {};
  let filledBySource = {}; // track {selector: {label, profileKey, source}}

  // Debug: send form fields + unfilled dropdown HTML to backend for analysis
  if (backendUrl) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const dropdowns = [];
        // Cast wide net - find anything that could be a dropdown
        const selectors = [
          'select', 'mat-select', 'ng-select', 'p-dropdown',
          '[role="combobox"]', '[role="listbox"]', '[role="option"]',
          '[class*="dropdown"]', '[class*="select"]', '[class*="Select"]',
          'mat-form-field', '.mat-select', '.ng-select',
          '[formcontrolname]', '[ng-reflect-name]',
        ];
        selectors.forEach(sel => {
          try {
            document.querySelectorAll(sel).forEach(el => {
              if (dropdowns.length >= 30) return;
              dropdowns.push({
                sel,
                tag: el.tagName,
                id: el.id,
                class: el.className.toString().slice(0,80),
                role: el.getAttribute('role'),
                formcontrolname: el.getAttribute('formcontrolname') || el.getAttribute('ng-reflect-name'),
                outerHTML: el.outerHTML.slice(0,300),
              });
            });
          } catch {}
        });
        // Also capture full body structure summary
        const allTags = {};
        document.querySelectorAll('*').forEach(el => {
          const t = el.tagName.toLowerCase();
          if (!['div','span','p','br','script','style','path','svg','g'].includes(t)) {
            allTags[t] = (allTags[t]||0)+1;
          }
        });
        return { url: location.href, dropdowns, allTags };
      }
    }).then(r => {
      const data = r?.[0]?.result;
      if (data) fetch(backendUrl + '/debug/form', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formFields: formFields.slice(0,30), ...data }),
      }).catch(() => {});
    });
  }

  // Step 2: Load saved mapping with confidence scores
  let savedMapping = null;
  if (backendUrl && formKey) {
    try {
      const res = await fetch(`${backendUrl}/mappings/${formKey}`);
      const data = await res.json();
      if (data && typeof data === 'object') savedMapping = data;
    } catch { /* ignore */ }
  }

  // Step 3: Apply saved mappings (confidence > 0.4)
  if (savedMapping) {
    for (const field of formFields) {
      const semanticKey = getSemanticKey(field.label);
      const saved = savedMapping[semanticKey];
      if (!saved) continue;
      const conf = calcConfidence(saved.fills || 0, saved.corrections || 0);
      if (conf >= 0.2 && saved.profileKey && selectedProfile[saved.profileKey]) { // lowered from 0.4 — new mappings start at 0.3
        mapping[field.selector] = { value: selectedProfile[saved.profileKey], type: field.type };
        filledBySource[field.selector] = { label: field.label, semanticKey, profileKey: saved.profileKey, source: 'saved', confidence: conf };
      }
    }
  }

  // Step 4: Fuzzy match for unmapped fields
  const unmapped1 = formFields.filter(f => !mapping[f.selector]);
  const fuzzyResult = fuzzyMatch(unmapped1, selectedProfile);
  for (const [sel, val] of Object.entries(fuzzyResult)) {
    mapping[sel] = val;
    const field = formFields.find(f => f.selector === sel);
    if (field) {
      const profileKey = Object.entries(selectedProfile).find(([, v]) => v === val.value)?.[0];
      filledBySource[sel] = { label: field.label, semanticKey: getSemanticKey(field.label), profileKey, source: 'fuzzy', confidence: 0.6 };
    }
  }

  // Step 5: Groq AI for still-unmapped fields
  const unmapped2 = formFields.filter(f => !mapping[f.selector]);
  if (unmapped2.length > 0 && groqKey) {
    showStatus(`AI mapping ${unmapped2.length} fields...`, 'info');
    const aiMapping = await aiMatch(unmapped2, selectedProfile, groqKey);
    for (const [sel, val] of Object.entries(aiMapping)) {
      mapping[sel] = val;
      const field = formFields.find(f => f.selector === sel);
      if (field) {
        const profileKey = Object.entries(selectedProfile).find(([, v]) => v === val.value)?.[0];
        filledBySource[sel] = { label: field.label, semanticKey: getSemanticKey(field.label), profileKey, source: 'ai', confidence: 0.5 };
      }
    }
  }

  // Step 5b: Load portal adapters for component-based fields
  let portalAdapters = {};
  if (backendUrl) {
    try {
      const hostname = new URL(tab.url).hostname;
      const ar = await fetch(`${backendUrl}/adapters/${hostname}`);
      portalAdapters = await ar.json();
      console.log('[CC] portalAdapters loaded:', Object.keys(portalAdapters));
    } catch (e) { console.warn('[CC] adapter fetch failed:', e.message); }
  }

  // Step 5c: Add ng-dropdown fields into mapping if adapter exists
  if (portalAdapters && Object.keys(portalAdapters).length > 0) {
    const ngResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const fields = [];
        document.querySelectorAll('div.ng-dropdown').forEach((el, idx) => {
          const lbl = el.querySelector('.label')?.textContent?.trim() || '';
          if (!lbl || /^(-+select-+|--|please)/i.test(lbl)) return;
          const selected = el.querySelector('.select-type')?.textContent?.trim() || '';
          const filled = selected && !/^(select|choose|--)$/i.test(selected);
          const isVerify = /verify|confirm/i.test(lbl);
          fields.push({ label: lbl, domIndex: idx, filled, isVerify });
        });
        return fields;
      }
    }).catch(() => [{ result: [] }]);
    const ngFields = ngResult?.[0]?.result || [];
    for (const ngf of ngFields) {
      if (ngf.filled) continue;
      const adapter = portalAdapters['ng-dropdown'];
      if (!adapter) continue;
      // Verify/confirm fields: mirror value from the corresponding base ng-dropdown
      if (ngf.isVerify) {
        // Strip "verify"/"confirm" words to get base concept e.g. "Verify Gender" -> "gender"
        const baseNorm = ngf.label.replace(/^\d+\.\s*/, '').replace(/\*$/, '').trim()
          .toLowerCase().replace(/verify|confirm/gi, '').replace(/[^a-z0-9\s]/g, '').trim();
        // Find matching base field in ngFields (non-verify, same concept)
        const baseNgf = ngFields.find(f => !f.isVerify && (() => {
          const bl = f.label.replace(/^\d+\.\s*/, '').replace(/\*$/, '').trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
          return bl && baseNorm && (bl.includes(baseNorm) || baseNorm.includes(bl));
        })());
        if (baseNgf) {
          const baseSel = `ng-dropdown-${baseNgf.domIndex}`;
          const baseVal = mapping[baseSel];
          if (baseVal) {
            const sel = `ng-dropdown-${ngf.domIndex}`;
            mapping[sel] = { value: baseVal.value, type: 'ng-dropdown' };
            filledBySource[sel] = { label: ngf.label, semanticKey: baseNorm, profileKey: filledBySource[baseSel]?.profileKey, source: 'verify-mirror', confidence: 1 };
            console.log('[CC] verify-mirror:', ngf.label, '->', baseVal.value);
          }
        }
        continue;
      }
      // Normalize label
      const normLabel = ngf.label.replace(/^\d+\.\s*/, '').replace(/^[a-z]\.\s*/i, '').replace(/\*$/, '').trim().toLowerCase();
      // Explicit label→profileKey map for common SSC fields
      const LABEL_MAP = {
        'gender': 'gender',
        'state/ut': 'state', 'state': 'state',
        'district': 'district',
        'year of passing': 'year_of_passing',
        'matriculation (10th class) year of passing': 'passing_year_10th',
        'matriculation (10th class) education board': 'board_10th',
        'your highest level of educational qualification': 'highest_education_qualification',
        'nationality': 'nationality',
        'religion': 'religion',
      };
      // Try explicit map first, then fuzzy
      let profileKey = LABEL_MAP[normLabel];
      if (!profileKey) {
        profileKey = Object.keys(selectedProfile).find(k => {
          const nk = k.toLowerCase().replace(/_/g, ' ');
          return normLabel === nk || normLabel.includes(nk) || nk.includes(normLabel.split(' ')[0]);
        });
      }
      if (!profileKey || !selectedProfile[profileKey]) continue;
      const sel = `ng-dropdown-${ngf.domIndex}`;
      console.log('[CC] adding ng-dropdown to mapping:', sel, ngf.label, '->', selectedProfile[profileKey]);
      mapping[sel] = { value: selectedProfile[profileKey], type: 'ng-dropdown' };
      filledBySource[sel] = { label: ngf.label, semanticKey: normLabel, profileKey, source: 'adapter', confidence: 0.9 };
    }
  }

  // Step 6: Fill the form (sequential for dependent dropdowns)
  // Type-safety: remove mappings that are incompatible with field type
  const BOOLEAN_LIKE = new Set(['yes','true','1','checked','on','no','false','0','off','unchecked']);
  for (const field of formFields) {
    const m = mapping[field.selector];
    if (!m) continue;
    if (field.type === 'checkbox' && !BOOLEAN_LIKE.has(m.value.toLowerCase())) {
      console.debug('[CC] type-safe: removed checkbox mapping with non-boolean value', field.selector, m.value);
      delete mapping[field.selector];
      delete filledBySource[field.selector];
    }
  }
  // Set groqKey on page for AI-assisted option matching
  if (groqKey) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (k) => { window._cc_groq_key = k; },
      args: [groqKey],
    }).catch(() => {});
  }
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: fillFormFieldsSequential,
    args: [mapping, filledBySource, portalAdapters],
  });

  // Read replay telemetry written by executor
  // Wait for all ng-dropdowns to finish (each takes up to 5500ms)
  // Poll until results stop changing or 60s max
  const ngDropdownCount = Object.values(mapping).filter(v => v.type === 'ng-dropdown').length;
  // Each ng-dropdown takes up to 5500ms; wait for all + 2s buffer, min 3s
  const cascadeCount = Object.values(mapping).filter((v,_,arr) => {
    // count cascade/dependent fields
    const label = (v.label||'').toLowerCase();
    return ['district','sub_division','block','panchayat'].some(k=>label.includes(k));
  }).length;
  const waitMs = Math.max(5000, ngDropdownCount * 5500 + cascadeCount * 9000 + 2000);
  await new Promise(r => setTimeout(r, waitMs));

  // Re-fill Angular reactive form fields that were reset (run in MAIN world for zone awareness)
  if (Object.keys(mapping).length > 0) {
    const angularRefills = Object.entries(mapping)
      .filter(([sel, {type}]) => type === 'text' || type === 'email' || type === 'tel')
      .map(([sel, {value}]) => ({ sel, value }));
    if (angularRefills.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: (refills) => {
          const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          refills.forEach(({sel, value}) => {
            const el = document.querySelector(sel);
            if (!el || el.value === value) return; // skip if already correct
            if (niv) niv.set.call(el, value); else el.value = value;
            ['input','change','blur'].forEach(ev => el.dispatchEvent(new Event(ev, {bubbles:true})));
          });
        },
        args: [angularRefills],
      }).catch(() => {});
    }
  }

  const replayTelemetryResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const raw = sessionStorage.getItem('_cc_replay_records');
      sessionStorage.removeItem('_cc_replay_records');
      const records = raw ? JSON.parse(raw) : [];
      return { results: {}, records };
    }
  });
  // Read _cc_replay_results from MAIN world (executor runs in MAIN world)
  const replayResultsRaw = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const v = sessionStorage.getItem('_cc_replay_results');
      sessionStorage.removeItem('_cc_replay_results');
      return v ? JSON.parse(v) : {};
    }
  }).catch(() => [{ result: {} }]);
  const replayResults = replayResultsRaw?.[0]?.result ?? {};
  // Read replay records from DOM attribute (written by executor, shared between worlds)
  const _replayDomResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const raw = document.body.getAttribute('data-cc-records');
      document.body.removeAttribute('data-cc-records');
      return raw ? JSON.parse(raw) : [];
    }
  }).catch(() => [{ result: [] }]);
  const replayRecords = _replayDomResult?.[0]?.result || [];

  // POST FormSession to backend for observability
  if (backendUrl && formKey) {
    const session = {
      formKey, semanticFormKey,
      hostname: new URL(tab.url).hostname,
      profileId: selectedProfile?.phone || '',
      startedAt: Date.now(),
      runtimeVersion: chrome.runtime.getManifest().version,
      strategyVersion: '1.0',
      waitEngineVersion: '1.0',
      records: replayRecords,
      totalFilled: replayRecords.filter(r => r.result === 'filled').length,
      totalFailed: replayRecords.filter(r => ['skipped','error','reset'].includes(r.result)).length,
    };
    await fetch(`${backendUrl}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(session) }).catch(() => {});
  }

  // Unresolved detection — semantic field groups, not raw DOM nodes
  const skipLabels = /^(yes|no|true|false|select|choose|dd.mm.yyyy|mm.yyyy|please select)$/i;
  const skipLabelPatterns = /verify|confirm|re.?enter|captcha|otp|token|password/i;

  // Deduplicate radio groups — one entry per name group, using the group's context label
  const seenRadioGroups = new Set();
  const allUnresolved = formFields.filter(f => {
    if (mapping[f.selector]) return false;
    if (!f.label) return false;
    const lbl = f.label.replace(/\n/g,' ').trim();
    if (skipLabels.test(lbl)) return false;
    if (skipLabelPatterns.test(lbl)) return false;
    if (['hidden','submit','button'].includes(f.type)) return false;
    // Deduplicate radio groups by name
    if (f.type === 'radio' && f.name) {
      if (seenRadioGroups.has(f.name)) return false;
      seenRadioGroups.add(f.name);
    }
    return true;
  });

  // Also detect ng-dropdown fields from the page (not captured in formFields)
  // Use adapter componentClass if available, otherwise scan generically
  const _adapterCompClass = portalAdapters && Object.keys(portalAdapters)[0];
  const _adapterTrigger = _adapterCompClass && portalAdapters[_adapterCompClass]?.triggerSelector;
  const _adapterVerify = _adapterCompClass && portalAdapters[_adapterCompClass]?.verifySelector;
  const ngDropdownResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (compClass, triggerSel, verifySel) => {
      const fields = [];
      const seenLabels = new Set();
      // Build selector: use adapter componentClass if known, else broad generic
      const sel = compClass ? `div.${compClass}` : 'div.ng-dropdown';
      let els = Array.from(document.querySelectorAll(sel));
      // Generic fallback: find div/span elements that look like custom dropdowns
      if (els.length === 0) {
        const candidates = document.querySelectorAll('[class*="dropdown"],[class*="select"],[class*="picker"],[class*="combo"],div.relative');
        candidates.forEach(el => {
          if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
          // Skip wrappers around native selects — those are already handled
          if (el.querySelector('select')) return;
          // Must have visible text and be interactive
          const hasOptions = el.querySelector('li, [class*="option"], [class*="item"]') ||
                             el.getAttribute('role') === 'combobox' ||
                             el.querySelector('button > span') || // Vue teleported dropdowns
                             el.classList.contains('relative');
          if (hasOptions) els.push(el);
        });
      }
      els.forEach((el, idx) => {
        // Try to get label: look for sibling label, parent label, aria-label, or first text node
        // Walk up to 5 levels to find a label (handles Vue flex-gap wrappers)
        let lbl = el.querySelector('.label, label, mat-label')?.textContent?.trim()
                 || el.getAttribute('aria-label') || '';
        if (!lbl) {
          let node = el;
          for (let _i = 0; _i < 5 && !lbl; _i++) {
            node = node.parentElement;
            if (!node) break;
            const found = node.querySelector('label');
            if (found && !found.closest('div.relative')) lbl = found.textContent.trim();
            if (!lbl && node.previousElementSibling) {
              const ps = node.previousElementSibling;
              lbl = (ps.tagName === 'LABEL' ? ps : ps.querySelector('label'))?.textContent?.trim() || '';
            }
          }
        }
        if (!lbl || /verify/i.test(lbl) || /^(-+select-+|--|please)/i.test(lbl)) return;
        // Get current selected value
        const verifyEl = verifySel ? el.querySelector(verifySel) : null;
        const selected = verifyEl?.textContent?.trim()
                      || el.querySelector('.select-type,.value-area,[class*="selected"],[class*="value"]')?.textContent?.trim()
                      || el.querySelector('button > span:first-child')?.textContent?.trim()
                      || '';
        const filled = selected && !/^(select|choose|--|day|month|year)$/i.test(selected.trim());
        const key = seenLabels.has(lbl) ? `${lbl} (${idx})` : lbl;
        seenLabels.add(lbl);
        fields.push({ label: key, type: 'ng-dropdown', filled, domIndex: idx, componentClass: compClass || el.className.trim().split(/\s+/)[0] });
      });
      return fields;
    },
    args: [_adapterCompClass || null, _adapterTrigger || null, _adapterVerify || null],
  });
  const ngDropdowns = (ngDropdownResult?.[0]?.result || []).filter(f => !f.filled);

  const INTERACTIVE_TYPES = ['ng-dropdown','mat-select','mat-radio','mat-checkbox','select'];
  const failedFields = [
    // Only custom dropdowns need teaching — native selects are handled by executor+Groq
    ...allUnresolved.filter(f => INTERACTIVE_TYPES.includes(f.type) && f.type !== 'ng-dropdown' && f.type !== 'select'),
    ...ngDropdowns.map(f => ({ ...f, selector: null, profileValue: selectedProfile ? (selectedProfile[f.label?.toLowerCase().replace(/[^a-z0-9]/g,'_')] || '') : '' })),
  ];
  const unmappedTextFields = allUnresolved.filter(f => !INTERACTIVE_TYPES.includes(f.type));

  const count = result?.[0]?.result ?? 0;

  // Populate result panel
  const resultPanel = document.getElementById('result-panel');
  resultPanel.style.display = 'block';
  document.getElementById('count-filled').textContent = count;

  const allDisplay = [...failedFields, ...unmappedTextFields];
  if (allDisplay.length > 0) {
    document.getElementById('row-unresolved').style.display = 'flex';
    document.getElementById('count-unresolved').textContent = allDisplay.length;
    const list = document.getElementById('unresolved-list');
    list.innerHTML = '';
    for (const f of allDisplay) {
      const isInteractive = INTERACTIVE_TYPES.includes(f.type);
      const compClass = f.type === 'ng-dropdown' ? 'ng-dropdown' : f.type;
      const adapter = isInteractive ? (portalAdapters && portalAdapters[compClass]) : null;
      const replayStatus = replayResults[f.label] || replayResults[normalizeFieldLabel(f.label)];
      let reason, badgeClass;
      if (!isInteractive) {
        reason = '⚠ not mapped'; badgeClass = 'adapter-missing';
      } else if (replayStatus === 'ok') {
        reason = '✓ replayed'; badgeClass = 'adapter-learned';
      } else if (replayStatus === 'verify-fail') {
        reason = '⚠ replay failed'; badgeClass = 'adapter-missing';
      } else if (replayStatus === 'no-option') {
        reason = '⚠ option not found'; badgeClass = 'adapter-missing';
      } else if (!adapter) {
        reason = '⚠ no adapter'; badgeClass = 'adapter-missing';
      } else if (adapter.stale) {
        reason = '⚠ stale'; badgeClass = 'adapter-missing';
      } else {
        reason = '✓ adapter'; badgeClass = 'adapter-learned';
      }
      const item = document.createElement('div');
      item.className = 'unresolved-item';
      item.innerHTML = `<span title="${f.selector || f.label}">${normalizeFieldLabel(f.label).slice(0,32)}</span><span class="adapter-badge ${badgeClass}">${reason}</span>`;
      list.appendChild(item);
    }
  }

  // Show Teach button whenever there are unresolved interactive fields (even if count=0)
  if (failedFields.length > 0) {
    const teachBtn = document.getElementById('teach-btn');
    teachBtn.style.display = 'block';
    teachBtn.onclick = () => startTeachMode(tab, failedFields, backendUrl, selectedProfile, groqKey);
  }

  if (count > 0) {
    showStatus(`Filled ${count} field(s)${failedFields.length ? ` · ${failedFields.length} unresolved` : ''}`, count > 0 ? 'success' : 'info');

    // Step 7: Inject correction observer
    if (backendUrl && formKey) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: injectCorrectionObserver,
        args: [mapping, filledBySource, selectedProfile, backendUrl, formKey],
      });
    }

    // teach button already shown above

    // Show Save Learning button
    document.getElementById('save-learning-btn').style.display = 'block';
    document.getElementById('save-learning-btn').onclick = async () => {
      // Get enrichments from page
      const enrichResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const e = sessionStorage.getItem('_cc_enrichments');
          return e ? JSON.parse(e) : [];
        }
      });
      const enrichments = enrichResult?.[0]?.result ?? [];

      // Show enrichment confirmation if any
      if (enrichments.length > 0) {
        const msg = enrichments.map(e => `${e.label}: "${e.value}"`).join('\n');
        if (confirm(`Add to profile?\n\n${msg}`)) {
          // Save enrichments to profile
          const updatedProfile = { ...selectedProfile };
          enrichments.forEach(e => { updatedProfile[e.semanticKey] = e.value; });
          await fetch(`${backendUrl}/profiles`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedProfile),
          });
          showStatus(`Profile enriched with ${enrichments.length} new field(s)!`, 'success');
        }
      }

      await saveLearning(backendUrl, formKey, filledBySource, selectedProfile, false);
      showStatus('Learning saved!', 'success');
      document.getElementById('save-learning-btn').style.display = 'none';
    };
  } else {
    const hasGroq = !!groqKey;
    const hasProfile = selectedProfile && Object.keys(selectedProfile).length > 2;
    const fieldCount = formFields.length;
    showStatus(`No fields filled. Fields detected: ${fieldCount}. Profile: ${hasProfile?'✓':'✗'}. Groq: ${hasGroq?'✓':'✗ (add key in settings)'}`, 'error');
  }
});

// ── Assisted Learning Mode ───────────────────────────────────────────────────
async function startTeachMode(tab, failedFields, backendUrl, profile, groqKey) {
  showStatus('Teaching started — interact with the highlighted field on the page.', 'info');
  document.getElementById('teach-btn').style.display = 'none';

  // Listen for progress updates from background via storage
  chrome.storage.onChanged.addListener(function onTeachProgress(changes, area) {
    if (area !== 'local' || !changes._cc_teach_progress?.newValue) return;
    const msg = changes._cc_teach_progress.newValue;
    showStatus(msg.status, msg.done ? 'success' : 'info');
    if (msg.done) {
      chrome.storage.onChanged.removeListener(onTeachProgress);
      chrome.storage.local.remove('_cc_teach_progress');
    }
  });

  const job = {
    tabId: tab.id,
    fields: failedFields,
    backendUrl,
    hostname: (() => { try { return new URL(tab.url).hostname; } catch(e) { console.warn('[CC] teach: cannot parse tab url, using empty hostname'); return ''; } })(),
    groqKey: groqKey || null,
    ts: Date.now(),
  };
  // Write job to storage first (alarm will wake SW even if it's sleeping)
  chrome.storage.local.set({ _cc_teach_job: job }, () => {
    console.log('[CC] popup: teach job written to storage, creating alarm');
    // Alarm is the most reliable way to wake a sleeping MV3 service worker
    chrome.alarms.create('cc_teach_wake', { delayInMinutes: 0.5 }); // 30s min enforced in packed ext
    // Also try sendMessage in case SW is already awake (faster path)
    chrome.runtime.sendMessage({ type: 'TEACH_JOB', job }).catch(() => {
      console.log('[CC] popup: SW sleeping, alarm will wake it in ~6s');
    });
  });
}

// Runs in page context — injects overlay badge, waits for user interaction via sessionStorage polling
// ── Profile loader ────────────────────────────────────────────────────────────
async function loadProfiles(backendUrl) {
  const list = document.getElementById('profiles-list');
  list.innerHTML = '<div class="empty">Loading...</div>';
  try {
    const res = await fetch(`${backendUrl}/profiles`);
    const profiles = await res.json();
    if (!Array.isArray(profiles) || !profiles.length) {
      list.innerHTML = '<div class="empty">No profiles saved yet.<br>Use CyberControl to save student profiles.</div>';
      return;
    }
    list.innerHTML = '';
    profiles.forEach(profile => {
      const card = document.createElement('div');
      card.className = 'profile-card';
      const name = profile.name || profile.full_name || 'Unknown';
      const phone = profile.phone || '';
      const count = Object.keys(profile).filter(k => profile[k] && !['phone','updatedAt'].includes(k)).length;
      card.innerHTML = `<div class="profile-name">${name}</div><div class="profile-phone">📱 ${phone}</div><div class="profile-fields">${count} fields</div>`;
      card.addEventListener('click', () => {
        document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedProfile = profile;
        document.getElementById('autofill-btn').disabled = false;
      });
      list.appendChild(card);
    });
  } catch {
    list.innerHTML = '<div class="empty">Failed to load. Check backend URL.</div>';
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status ${type}`;
  el.style.display = 'block';
  if (type !== 'info') setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── Save Learning ─────────────────────────────────────────────────────────────
async function saveLearning(backendUrl, formKey, filledBySource, profile, fromCorrection) {
  if (!backendUrl || !formKey) return;
  const updates = {};
  for (const [, info] of Object.entries(filledBySource)) {
    if (!info.profileKey || !info.semanticKey) continue;
    updates[info.semanticKey] = {
      profileKey: info.profileKey,
      // fromCorrection = strong signal, Save Learning = weak signal
      delta: fromCorrection ? { corrections: 0, fills: 1 } : { corrections: 0, fills: 0.3 },
    };
  }
  if (Object.keys(updates).length > 0) {
    fetch(`${backendUrl}/mappings/${formKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates, formKey }),
    }).catch(() => {});
  }
}

