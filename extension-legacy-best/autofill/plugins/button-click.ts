/**
 * button-click plugin — workflow transition primitive.
 *
 * Handles taught navigation/expand/add-row buttons.
 * Plugin owns: clicking the button.
 * Runtime owns: stabilization, field graph rebuild, phase progression.
 *
 * Only activates on saved mappings (taught workflows).
 * Schema: EXECUTION_SCHEMA v1.0, action: click_button
 */

var ButtonClickPlugin = {
  id: 'button-click',
  description: 'Workflow transition: click taught buttons (navigation, expand, add-row)',

  supports(el, fieldContext) {
    if (!el) return false;
    // Only claims fields explicitly marked as buttons in the mapping
    return fieldContext.type === 'button';
  },

  fill(el, value, context) {
    // Plugin only clicks. Runtime handles everything after.
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.click();
    return { success: true, settled: false, transition: true };
  },

  meta: {
    interactionFamily: 'button-click',
    needsStabilization: true,
    populatesChildren: false,
    dependsOn: [],
    waitFor: 'dom-quiet',
    needsParentValues: false,
  },
};

registerPlugin(ButtonClickPlugin);
