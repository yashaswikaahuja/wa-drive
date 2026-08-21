# flatten-profile — Profile Data Flattener

## Purpose
Normalises the profile object before passing to the fill kernel. Handles two input shapes:
- `{ name: 'Rahul', dob: '01/01/1990' }` — already flat, passthrough
- `{ data: { name: { value: 'Rahul' } } }` — nested, unwrapped

## Public API (`globalThis.CcFlattenProfile`)
- `flattenProfile(profile)` → flat `{ key: value }` map
