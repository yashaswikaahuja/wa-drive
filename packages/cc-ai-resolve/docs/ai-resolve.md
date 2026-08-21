# ai-resolve — LLM Residual Field Resolver

## Purpose
Last-pass resolver for fields fuzzy-match and rule-engine could not fill. One batched LLM call reasons over the full profile and each unfilled field.

## Public API (`globalThis.CcAiResolve`)
- `resolveValues(pendingFields, profile, apiKey, baseUrl, model)` → `Promise<mapping>`

## mapping shape
`{ [selector]: { value, kind: 'value'|'option', source: 'ai-resolve' } }`

## Safety rules
- Never invents Aadhaar, PAN, roll numbers, marks, phone, email
- For OPTIONS fields: validates against listed options, snaps to closest match
- Soft-fail only — returns `{}` on any error
