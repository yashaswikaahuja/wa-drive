/** Loose ambient types for Chrome page-inject / SW concat bundles. */
declare const chrome: any;
declare const CcPerception: any;
declare const CcDomGateway: any;
declare const CcContextDiscovery: any;
declare const CcNodeFactory: any;
declare const CcEdgeFactory: any;
declare const CcBindingRegistry: any;
declare const CcRevisionManager: any;
declare const CcPrivacyFilter: any;
declare const CcWidgetClassifier: any;
declare const CcCanonicalHash: any;
declare const CcSnapshotBuilder: any;
declare const CcValidator: any;
declare const CcLegacyFillGate: any;
declare const CcWssSession: any;
declare const CcFormContext: any;
declare const CcScanStandardFields: any;
declare const CcScanMatWidgets: any;
declare const CcScanNgDropdowns: any;
declare const CcSortFieldsVisual: any;
declare const CcFingerprintForm: any;
declare const ccEnsureWss: any;
declare const ccKnowledgeSync: any;
declare const ccStartAuthRefreshTimers: any;
declare const fuzzyMatch: any;
declare const forwardFillDebug: any;
declare const ccDeriveProfile: any;
declare const BG_SEMANTIC_ALIASES: any;
declare const _optQ: any;
declare const $: any;
declare const jQuery: any;
declare var module: any;
declare var root: any;
declare var exports: any;
declare const findPlugin: any;
declare const fillFormFieldsSequential: any;
declare const extractFormFieldsWithFingerprint: any;

interface Window {
  [key: string]: any;
}

interface Element {
  [key: string]: any;
  closest(selectors: string): Element | null;
  click(): void;
}

interface HTMLElement {
  [key: string]: any;
}

interface HTMLOptionElement {
  [key: string]: any;
}

interface HTMLSelectElement {
  [key: string]: any;
}

interface HTMLInputElement {
  [key: string]: any;
}

interface EventTarget {
  [key: string]: any;
  closest?(selectors: string): Element | null;
}

interface NodeListOf<TNode extends Node> {
  [Symbol.iterator](): Iterator<TNode>;
}
