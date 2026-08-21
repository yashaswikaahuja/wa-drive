# ai-match — LLM-Based Fallback Field Mapper

## Purpose
Sends form fields and profile to an LLM (via `window.ccLLM`) when fuzzy matching fails. Applies same semantic guards as fuzzyMatch.

## Public API (`globalThis.CcAiMatch`)
- `aiMatch(formFields, profile, groqKey, llmBaseUrl, llmModel)` → `Promise<mapping>`

## Split keys
- `dob__day`, `dob__month`, `dob__year`
- `name__first`, `name__last`, `name__middle`
