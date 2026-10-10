/** Ambient types for the standalone fill harness script. */

declare function extractFormFieldsWithFingerprint(...args: any[]): any;
declare function applyRules(...args: any[]): any;
declare function fillFormFieldsSequential(...args: any[]): any;
declare function ccEvaluateField(...args: any[]): any;
declare function ccTypeGroup(...args: any[]): any;

declare var process: {
  exit(code?: number): never;
  [key: string]: any;
};

declare module "node:fs" {
  export function readFileSync(path: any, encoding?: any): any;
  export function readFileSync(path: any, options?: any): any;
}

interface Element {
  [key: string]: any;
  value?: any;
  checked?: any;
  options?: any;
  click(): void;
  dispatchEvent(event: any): boolean;
}

interface HTMLElement {
  [key: string]: any;
}

interface Document {
  querySelector(selectors: string): any;
  querySelectorAll(selectors: string): any;
}
