# match-profile-fields — Name / DOB / Longest-Alias

## Purpose
Second-stage handlers inside `fuzzyMatch`. Runs after special-field handlers decline.

## Public API (`globalThis.CcMatchProfileFields`)
- `tryMatch(field, ident, matchBy, profile, nameParts, helpers, mapping) => true`
  Always consumes the field (maps or leaves unmapped).

## Order
1. Skip Hindi / changed-name (when profile has no changed_name)
2. Granular first/middle/last name parts
3. DOB day/month/year and combined date fields
4. Longest-alias win against `fieldAliases`
