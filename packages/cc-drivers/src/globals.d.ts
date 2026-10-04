/** Ambient globals for page-inject driver scripts (concat bundle). */
interface Window {
  cc: any;
  _ccTraces?: any[];
  ccDomUtils?: any;
  ccMatchOption?: any;
  ccWaitForNetworkIdle?: any;
  keystrokeFillSync?: any;
  findPlugin?: any;
}

interface Element {
  click(): void;
}
