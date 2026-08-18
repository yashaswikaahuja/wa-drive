# Golden portal regression pack (T15)

**Issue:** [#229](https://github.com/yashaswikaahuja/wa-drive/issues/229)  
**Gate:** manual checklist before product release; automate later.

## Portals

| Portal | URL pattern | Critical paths |
|--------|-------------|----------------|
| **Bihar ServiceOnline** | `serviceonline.bihar.gov.in` | State→District→Block cascade (Hindi LGD), name/address, no multi-minute hang on office shell |
| **SSC OTR** | `ssc.gov.in` / OTR | Aadhaar (portal mask OK), gender radio, disability No, file → waiting_human, email |
| **Mazagon** | Mazagon dock registration | DOB format variants, salutation/gender, education |

## Checklist (per portal)

### Pre
- [ ] Extension build loaded (product sequential kernel WAIT_ENGINE 1.2 or legacy-best)
- [ ] Logged in; profile complete for test person
- [ ] `cyb sessions` / admin sessions available

### Fill
- [ ] Fill completes without Chrome Errors spam
- [ ] No OS file chooser opens from automation
- [ ] Cascades settle; no 2+ minute dead-select hang
- [ ] Radios/checkboxes are decisions (not Aadhaar-into-checkbox)
- [ ] Visible fields only dominate planned set

### Evidence
- [ ] Session has **hostname** non-empty
- [ ] Records have planned + actual where filled
- [ ] Portal-masked Aadhaar not VERIFIED_LIE in CLI (`cyb report <id>`)
- [ ] DOB format variants not flagged as mismatch when same date

### Learning (optional)
- [ ] Operator correction promotes data or conditional correctly
- [ ] Next fill on same form_key improved

## Sign-off

| Date | Build | Operator | Result |
|------|-------|----------|--------|
| 2026-08-18 | product **5.92.1** (sequential default) | owner | **Pass — fills like legacy** (confirmed live) |

## CI later

- Snapshot fixtures for Bihar/SSC/Mazagon Page IR
- Headless APE + sequential settle unit tests
- Map of golden selectors (non-secret)
