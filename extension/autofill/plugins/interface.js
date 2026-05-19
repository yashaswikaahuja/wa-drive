/**
 * PluginInterface — contract for interaction plugins.
 *
 * Plugins are bounded interaction adapters. They declare capability and topology.
 * Runtime owns: timing, retries, verification, replay, escalation.
 * Plugins own: HOW to interact with a specific widget family.
 */
const PluginInterface = {
  // Required: unique plugin identifier
  id: '',
  // Required: human-readable description
  description: '',
  // Required: does this plugin handle this element?
  // (el: HTMLElement, fieldContext: {type, label, selector}) => boolean
  supports: null,
  // Required: execute the interaction
  // (el: HTMLElement, value: string, context: {profileKey, parentValues, attempt}) => {success: boolean, settled: boolean, waitMs?: number}
  fill: null,
  // Required: declarative metadata for planner/runtime
  meta: {
    interactionFamily: '',       // e.g. 'cascade', 'ng-dropdown', 'file-upload'
    needsStabilization: false,   // runtime should wait after fill
    populatesChildren: false,    // filling this triggers async option population downstream
    dependsOn: [],               // profileKey[] of fields that must fill before this one
    waitFor: null,               // stabilization signal: 'options-populated' | 'dom-quiet' | null
    needsParentValues: false,    // if true, context.parentValues will be populated
  },
};

// Plugin registry — ordered by specificity (most specific first)
const PLUGIN_REGISTRY = [];

function registerPlugin(plugin) {
  if (!plugin.id || !plugin.supports || !plugin.fill) throw new Error('Invalid plugin: missing id/supports/fill');
  PLUGIN_REGISTRY.push(plugin);
}

function findPlugin(el, fieldContext) {
  for (const plugin of PLUGIN_REGISTRY) {
    try { if (plugin.supports(el, fieldContext)) return plugin; } catch {}
  }
  return null;
}
