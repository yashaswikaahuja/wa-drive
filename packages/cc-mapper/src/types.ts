/** Shared mapper types for @cc/mapper */

export type Profile = Record<string, string | number | boolean | null | undefined>;

export interface FormField {
  selector: string;
  label?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  type?: string;
  options?: string[];
  optionSelectors?: string[];
  value?: string;
}

export interface MappingEntry {
  value: string | number | boolean;
  type: string;
  matchBy?: string;
  profileKey?: string | null;
  label?: string | null;
  monthNum?: number;
  monthShort?: string;
}

export type Mapping = Record<string, MappingEntry>;

export interface LabelIdent {
  ident: string;
  matchBy: string;
  labelEn: string;
  labelRaw: string;
  labelStrong: boolean;
}

export interface ChoiceResolved {
  selector: string;
  entry: MappingEntry;
}

export interface MatchHelpers {
  fieldAliases: Record<string, string[]>;
  normalizeIdent: (s: string) => string;
  resolveChoiceToOption: (
    field: FormField,
    plannedValue: string | null | undefined,
    profileKey: string | null,
  ) => ChoiceResolved | null;
  decideConditionalChoice: (field: FormField, profile: Profile) => string | null;
}

export interface NameParts {
  firstName: string;
  middleName: string;
  lastName: string;
}

export type AliasMap = Record<string, string[]>;

export interface ServerFieldMapping {
  semantic_key?: string;
  match_patterns?: string[];
}

declare global {
  interface Window {
    _ccServerFieldMappings?: ServerFieldMapping[];
    ccResolveChoiceToOption?: typeof import('./mapper-api.ts').resolveChoiceToOption;
    ccDecideConditionalChoice?: typeof import('./mapper-api.ts').decideConditionalChoice;
    ccLLM?: {
      call: (opts: Record<string, unknown>) => Promise<{ error?: unknown; text?: string }>;
      parseJSON: (text: string | undefined) => Record<string, string> | null;
    };
  }
}

export {};
