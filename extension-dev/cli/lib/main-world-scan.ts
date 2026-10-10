/**
 * Read form controls from the page main world (querySelectorAll),
 * independent of BindingRegistry — catches "executor claimed filled but page empty".
 */
export async function scanMainWorldControls(page) {
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('input, select, textarea'));
    return els.map((el) => ({
      tag: el.tagName,
      id: el.id || null,
      name: el.name || null,
      type: el.type || null,
      value: 'value' in el ? String(el.value ?? '') : null,
      checked: 'checked' in el ? !!el.checked : null,
    }));
  });
}

/**
 * Count controls that look "filled" (nonempty value or checked).
 */
export function summarizeMainWorld(scan) {
  const nonempty = (scan || []).filter((r) => {
    if (r.type === 'checkbox' || r.type === 'radio') return r.checked;
    if (r.type === 'hidden' || r.type === 'submit' || r.type === 'button') return false;
    return r.value != null && String(r.value).trim() !== '';
  });
  return {
    total: (scan || []).length,
    nonempty: nonempty.length,
    nonemptyIds: nonempty.map((r) => r.id || r.name || r.tag),
  };
}
