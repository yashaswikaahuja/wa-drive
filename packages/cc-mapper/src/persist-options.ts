/**
 * Mapping persist for dropdown options.
 *
 * AJAX / cascade fields must stay `options: "dynamic"`. A later extract that
 * happens to see currently-loaded `<option>` nodes must not freeze that
 * snapshot into the mapping — it is page-state, not the catalog.
 */

export function isAjaxFieldOptions(info: any): boolean {
  if (!info || typeof info !== 'object') return false;
  if (info.optionsDynamic) return true;
  if (info.options === 'dynamic') return true;
  if (info.dependsOn) return true;
  return false;
}

export function mappingOptionsToStore(info: any, existing?: any): any {
  if (isAjaxFieldOptions(info) || (existing && existing.options === 'dynamic')) {
    return 'dynamic';
  }
  if (info && info.options !== undefined && info.options !== null) return info.options;
  if (existing && existing.options !== undefined) return existing.options;
  return null;
}
