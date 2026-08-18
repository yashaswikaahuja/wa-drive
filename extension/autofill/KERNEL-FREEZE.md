# Sequential Fill Kernel Freeze (T1)

**Status:** frozen as product actuator source  
**Version:** WAIT_ENGINE `1.2` · packaged from `extension-legacy-best` 5.91.5–5.91.8  
**GitHub:** [#215](https://github.com/yashaswikaahuja/wa-drive/issues/215)

## Contract

1. **DOM-order sequential act** — fill fields top-to-bottom, not bulk parallel.
2. **`settleAfterAct(kind)` after every act**
   - `text` — short local settle (~100ms)
   - `choice` — radio/checkbox (may unlock AJAX selects)
   - `select` — network quiet + options budget
   - `button` — longer settle for section reveal
3. **Wait budget** — total AJAX/options wait capped so dead secondary selects cannot hang minutes.
4. **Strategy verify** after act when strategy applies.
5. **Soft fails**
   - File without payload → `waiting_human` (never open OS file chooser)
   - AI residual timeout → soft fail (`console.debug` only)
6. **Records** — planned + actual + `fillMode: 'sequential'` + honest fail codes.

## Package files (product tree)

| File | Role |
|------|------|
| `autofill/executor.js` | Sequential loop + settle + verify |
| `autofill/mapper.js` | Label-primary DATA mapping |
| `autofill/derive.js` | Client-side common-sense derive |
| `autofill/ai-resolve.js` | Residual AI only (soft timeout) |
| `autofill/rule-engine.js` | Rule layer |
| `autofill/extractor.js` | Field extract |
| `shared/network-idle.js` | Network quiet for settle |

Source of truth for behavior: this tree after port from `extension-legacy-best/`.

## Done when

- Kernel present in product `extension/autofill/` with WAIT_ENGINE 1.2
- Bihar / SSC / Mazagon parity via sequential path (see T13 for product Fill wiring)
- No multi-minute hang on dead selects (budget enforced)
