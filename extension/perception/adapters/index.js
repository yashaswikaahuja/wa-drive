/**
 * CyberControl Adapter Contract Registry — Phase 3.2
 *
 * Versioned, behavior-first adapter contracts for all supported widget families.
 * Contracts describe WHAT the adapter does (capability envelope) not HOW (mechanics).
 * The actual interaction mechanics live in extension/autofill/plugins/.
 *
 * Contract schema:
 *   id:             unique stable adapter identifier (never changes)
 *   version:        semver — bump minor on new capability, major on breaking change
 *   behavior_kind:  maps to widget-taxonomy.yml classification
 *   interaction_mode
 *   cardinality:    none | one | many | unknown
 *   affordances:    actions this adapter can perform
 *   detection:      signals used to identify the widget (read-only, no mutation)
 *   capabilities:   declarative envelope of what the adapter can do
 *   limitations:    known hard limits
 */

const ADAPTER_CONTRACTS = [

  // ──────────────────────────────────────────────────────────────────
  // NATIVE widgets
  // ──────────────────────────────────────────────────────────────────
  {
    id: 'native-text',
    version: '1.0.0',
    behavior_kind: 'text_entry',
    interaction_mode: 'native',
    cardinality: 'none',
    affordances: ['focus', 'type_text', 'clear'],
    detection: {
      tags: ['input', 'textarea'],
      types: ['text', 'email', 'tel', 'number', 'search', 'url', 'password', 'textarea'],
      role: 'textbox',
    },
    capabilities: {
      value_set: true,
      keystroke_simulation: true,
      react_angular_compat: true,
      verify_by_value: true,
    },
    limitations: ['password inputs are write-only — verification via value_state masked'],
  },

  {
    id: 'native-select',
    version: '1.0.0',
    behavior_kind: 'selection',
    interaction_mode: 'native',
    cardinality: 'one',
    affordances: ['focus', 'select_one'],
    detection: { tags: ['select'], attributes: { multiple: false } },
    capabilities: {
      option_match_by_text: true,
      option_match_by_value: true,
      async_option_load_retry: true,
      cascade_parent: true,
    },
    limitations: ['options must be in DOM before selection'],
  },

  {
    id: 'native-select-multi',
    version: '1.0.0',
    behavior_kind: 'selection',
    interaction_mode: 'native',
    cardinality: 'many',
    affordances: ['focus', 'select_many'],
    detection: { tags: ['select'], attributes: { multiple: true } },
    capabilities: {
      option_match_by_text: true,
      option_match_by_value: true,
      multi_select: true,
    },
    limitations: [],
  },

  {
    id: 'native-toggle',
    version: '1.0.0',
    behavior_kind: 'toggle',
    interaction_mode: 'native',
    cardinality: 'one',
    affordances: ['focus', 'toggle'],
    detection: { tags: ['input'], types: ['checkbox', 'radio'] },
    capabilities: { desired_state_set: true, click_to_toggle: true },
    limitations: [],
  },

  {
    id: 'native-file',
    version: '1.0.0',
    behavior_kind: 'file_upload',
    interaction_mode: 'native',
    cardinality: 'none',
    affordances: ['focus', 'upload'],
    detection: { tags: ['input'], types: ['file'] },
    capabilities: {
      url_fetch_and_assign: true,
      base64_assign: true,
      dialog_trigger: true,
    },
    limitations: ['cannot automate OS file picker dialog — requires URL or base64'],
  },

  {
    id: 'native-date',
    version: '1.0.0',
    behavior_kind: 'date_time',
    interaction_mode: 'native',
    cardinality: 'one',
    affordances: ['focus', 'type_text', 'clear'],
    detection: { tags: ['input'], types: ['date'] },
    capabilities: {
      iso_format_required: true,
      value_setter: true,
      format_conversion: true,
    },
    limitations: ['requires ISO YYYY-MM-DD format — profile DD/MM/YYYY must be converted'],
  },

  {
    id: 'native-datetime-local',
    version: '1.0.0',
    behavior_kind: 'date_time',
    interaction_mode: 'native',
    cardinality: 'one',
    affordances: ['focus', 'type_text', 'clear'],
    detection: { tags: ['input'], types: ['datetime-local'] },
    capabilities: { iso_format_required: true, value_setter: true },
    limitations: ['requires ISO YYYY-MM-DDTHH:MM format'],
  },

  {
    id: 'native-month',
    version: '1.0.0',
    behavior_kind: 'date_time',
    interaction_mode: 'native',
    cardinality: 'one',
    affordances: ['focus', 'type_text', 'clear'],
    detection: { tags: ['input'], types: ['month'] },
    capabilities: { iso_format_required: true, value_setter: true },
    limitations: ['requires ISO YYYY-MM format'],
  },

  // ──────────────────────────────────────────────────────────────────
  // OVERLAY / CUSTOM SELECT widgets
  // ──────────────────────────────────────────────────────────────────
  {
    id: 'select2',
    version: '1.0.0',
    behavior_kind: 'selection',
    interaction_mode: 'overlay',
    cardinality: 'one',
    affordances: ['focus', 'expand', 'select_one'],
    detection: {
      class_fragments: ['select2-container', 'select2-selection', 'select2'],
      role: 'combobox',
      underlying: 'select',
    },
    capabilities: {
      searchable: true,
      trigger_click: true,
      option_match_by_text: true,
      close_on_select: true,
    },
    limitations: ['AJAX-loaded options require wait for dropdown population'],
  },

  {
    id: 'select2-multi',
    version: '1.0.0',
    behavior_kind: 'selection',
    interaction_mode: 'overlay',
    cardinality: 'many',
    affordances: ['focus', 'expand', 'select_many'],
    detection: {
      class_fragments: ['select2-container--default', 'select2-selection--multiple'],
    },
    capabilities: { searchable: true, multi_select: true, tag_removal: true },
    limitations: [],
  },

  {
    id: 'choices',
    version: '1.0.0',
    behavior_kind: 'selection',
    interaction_mode: 'overlay',
    cardinality: 'one',
    affordances: ['focus', 'expand', 'select_one'],
    detection: {
      class_fragments: ['choices__inner', 'choices__list', 'choices__item'],
    },
    capabilities: {
      searchable: true,
      trigger_click: true,
      option_match_by_text: true,
    },
    limitations: [],
  },

  {
    id: 'ng-select',
    version: '1.0.0',
    behavior_kind: 'selection',
    interaction_mode: 'overlay',
    cardinality: 'one',
    affordances: ['focus', 'expand', 'select_one'],
    detection: {
      tags: ['ng-select'],
      class_fragments: ['ng-select', 'ng-dropdown-panel'],
    },
    capabilities: {
      searchable: true,
      async_options: true,
      virtual_scroll: true,
      option_match_by_text: true,
    },
    limitations: [],
  },

  {
    id: 'ng-dropdown',
    version: '1.0.0',
    behavior_kind: 'selection',
    interaction_mode: 'overlay',
    cardinality: 'one',
    affordances: ['focus', 'expand', 'select_one'],
    detection: {
      class_fragments: ['ng-dropdown'],
      trigger_signals: ['.value-area', '.select-type', '.ng-value-container'],
    },
    capabilities: {
      adapter_taught: true,
      overlay_detection: true,
      option_match_by_text: true,
      mutation_observer_based: true,
    },
    limitations: ['requires trigger selector from adapter recipe or teach mode'],
  },

  {
    id: 'mat-select',
    version: '1.0.0',
    behavior_kind: 'selection',
    interaction_mode: 'overlay',
    cardinality: 'one',
    affordances: ['focus', 'expand', 'select_one'],
    detection: {
      tags: ['mat-select'],
      class_fragments: ['mat-select', 'mat-mdc-select'],
      role: 'combobox',
    },
    capabilities: {
      option_match_by_text: true,
      overlay_at_document_root: true,
    },
    limitations: ['options render in cdk-overlay-container at document root'],
  },

  {
    id: 'react-select',
    version: '1.0.0',
    behavior_kind: 'selection',
    interaction_mode: 'overlay',
    cardinality: 'one',
    affordances: ['focus', 'expand', 'select_one'],
    detection: {
      class_fragments: ['react-select', '__control', '__menu'],
      role: 'combobox',
    },
    capabilities: {
      searchable: true,
      creatable: false,
      option_match_by_text: true,
    },
    limitations: ['async-loaded menus require await for options'],
  },

  {
    id: 'vue-select',
    version: '1.0.0',
    behavior_kind: 'selection',
    interaction_mode: 'overlay',
    cardinality: 'one',
    affordances: ['focus', 'expand', 'select_one'],
    detection: {
      tags: ['v-select'],
      class_fragments: ['v-select', 'vs__'],
    },
    capabilities: { searchable: true, option_match_by_text: true },
    limitations: [],
  },

  {
    id: 'bootstrap-select',
    version: '1.0.0',
    behavior_kind: 'selection',
    interaction_mode: 'overlay',
    cardinality: 'one',
    affordances: ['focus', 'expand', 'select_one'],
    detection: {
      class_fragments: ['bootstrap-select', 'selectpicker'],
      role: 'combobox',
    },
    capabilities: { searchable: true, option_match_by_text: true },
    limitations: [],
  },

  {
    id: 'virtualized-list',
    version: '1.0.0',
    behavior_kind: 'selection',
    interaction_mode: 'overlay',
    cardinality: 'one',
    affordances: ['focus', 'scroll', 'select_one'],
    detection: {
      class_fragments: ['react-window', 'react-virtual', 'cdk-virtual-scroll', 'virtual-scroll'],
      role: 'listbox',
    },
    capabilities: {
      scroll_to_reveal: true,
      option_match_by_text: true,
    },
    limitations: [
      'only visible options can be clicked — must scroll to reveal target first',
      'total option count may not be knowable upfront',
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  // DATE / TIME widgets
  // ──────────────────────────────────────────────────────────────────
  {
    id: 'flatpickr',
    version: '1.0.0',
    behavior_kind: 'date_time',
    interaction_mode: 'overlay',
    cardinality: 'one',
    affordances: ['focus', 'activate', 'type_text'],
    detection: {
      class_fragments: ['flatpickr-input', 'flatpickr'],
      instance_property: '_flatpickr',
    },
    capabilities: {
      api_set_date: true,
      format_conversion: true,
      direct_value_fallback: true,
    },
    limitations: [],
  },

  {
    id: 'jquery-ui-datepicker',
    version: '1.0.0',
    behavior_kind: 'date_time',
    interaction_mode: 'overlay',
    cardinality: 'one',
    affordances: ['focus', 'activate', 'type_text'],
    detection: {
      class_fragments: ['hasDatepicker', 'ui-datepicker-input'],
      jquery_data: 'datepicker',
    },
    capabilities: {
      api_set_date: true,
      format_conversion: true,
    },
    limitations: ['requires jQuery to be present on the page'],
  },

  {
    id: 'mat-datepicker',
    version: '1.0.0',
    behavior_kind: 'date_time',
    interaction_mode: 'overlay',
    cardinality: 'one',
    affordances: ['focus', 'type_text'],
    detection: {
      class_fragments: ['mat-datepicker', 'matDatepicker', 'mat-date'],
      angular_attributes: ['matDatepicker', 'matInput'],
    },
    capabilities: {
      value_setter: true,
      custom_events: ['dateChange', 'dateInput'],
    },
    limitations: [],
  },

  {
    id: 'split-date',
    version: '1.0.0',
    behavior_kind: 'date_time',
    interaction_mode: 'composite',
    cardinality: 'many',
    affordances: ['focus', 'type_text'],
    detection: {
      id_patterns: [/\b(dd|mm|yyyy|day|month|year|date_day|date_month|date_year)\b/i],
      name_patterns: [/\b(dd|mm|yyyy|day|month|year)\b/i],
      class_fragments: ['split-date', 'date-part', 'date-field'],
    },
    capabilities: {
      part_identification: true,
      format_conversion: true,
    },
    limitations: ['must identify all three parts (day, month, year) independently'],
  },

  // ──────────────────────────────────────────────────────────────────
  // CHALLENGE widgets
  // ──────────────────────────────────────────────────────────────────
  {
    id: 'otp-group',
    version: '1.0.0',
    behavior_kind: 'challenge',
    interaction_mode: 'composite',
    cardinality: 'many',
    affordances: ['focus', 'type_text'],
    detection: {
      name_patterns: [/otp|one.time|verification.code|auth.code/i],
      autocomplete: 'one-time-code',
      maxlength: 1,
      class_fragments: ['otp', 'otpinput', 'otp-input'],
    },
    capabilities: {
      multi_input_distribution: true,
      single_character_per_field: true,
    },
    limitations: ['content is secret — never read back or verified by value'],
    privacy: 'secret',
  },

  {
    id: 'captcha',
    version: '1.0.0',
    behavior_kind: 'challenge',
    interaction_mode: 'delegated',
    cardinality: 'none',
    affordances: [],
    detection: {
      class_fragments: ['captcha', 'recaptcha', 'hcaptcha', 'turnstile'],
      role: 'captcha',
    },
    capabilities: {},
    limitations: ['requires human interaction — automation not supported'],
    privacy: 'secret',
  },
];

/**
 * Look up an adapter contract by its ID.
 * @param {string} adapterId
 * @returns {object|null}
 */
function getAdapterContract(adapterId) {
  return ADAPTER_CONTRACTS.find((c) => c.id === adapterId) || null;
}

/**
 * Get all contracts for a given behavior_kind.
 * @param {string} behaviorKind
 * @returns {object[]}
 */
function getContractsByBehavior(behaviorKind) {
  return ADAPTER_CONTRACTS.filter((c) => c.behavior_kind === behaviorKind);
}

/**
 * Check whether the given widget output has a known adapter contract.
 * @param {object|null} widget — Widget schema object from classifier
 * @returns {boolean}
 */
function hasKnownContract(widget) {
  if (!widget || !widget.adapter_id) return false;
  return !!getAdapterContract(widget.adapter_id);
}

/** All adapter IDs in the registry. */
function getAllAdapterIds() {
  return ADAPTER_CONTRACTS.map((c) => c.id);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ADAPTER_CONTRACTS, getAdapterContract, getContractsByBehavior, hasKnownContract, getAllAdapterIds };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcAdapterContracts = { ADAPTER_CONTRACTS, getAdapterContract, getContractsByBehavior, hasKnownContract, getAllAdapterIds };
}
