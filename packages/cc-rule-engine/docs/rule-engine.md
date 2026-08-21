# rule-engine — Saved Field-Mapping Rule Evaluator

## Purpose
Evaluates a saved mapping entry `{ fillMode, profileKey, constantValue, rules, fallback }` against a profile to produce a concrete fill action.

## Public API (`globalThis.CcRuleEngine`)
- `evaluateField(entry, field, profile, translations)` → `{ kind, value?, option?, check?, options? }`

## Fill modes
| Mode | Behaviour |
|------|-----------|
| `skip` | Always skip |
| `always` | Always check (agreement checkboxes) |
| `constant` | Use `entry.constantValue` |
| `match` | Match `profile[profileKey]` → option/value |
| `condition` | Evaluate `entry.rules[]` → first match wins, else fallback |
