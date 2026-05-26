# Service Template — Bihar Residence Certificate

**Status:** Draft v0.1. First service template. Used to validate the task-workflow product design.
**Hindi name:** आवासीय प्रमाण-पत्र (Aawasiya Praman Patra) / निवास प्रमाण-पत्र (Niwas Praman Patra)
**Authority:** Govt of Bihar, RTPS (Right to Public Services).
**Portal:** https://serviceonline.bihar.gov.in
**Disclaimer:** Government portal details change. Anything marked **(verify)** below should be confirmed against the live portal before locking into the product.

---

## 1. What this is and why customers want it

A **Residence Certificate** is an official document proving the applicant resides at a stated address in Bihar. Required for:

- College admissions (especially state-quota seats)
- Government job applications (state-domicile reservation)
- Government scheme applications (PMAY, scholarships, BSCC)
- Bank account opening (sometimes accepted as address proof)
- Tracking benefits under reservation categories

Customer typically asks: *"Niwas chahiye"* or *"Residence banwana hai"*. About 60% of asks are tied to college admissions or scholarship deadlines, so urgency is common.

**Issuance timeline:** Officially 7-14 days. Realistically 5-30 days depending on block office workload.

**Validity:** No formal expiry, but most institutions accept residence certs ≤ 6 months old.

## 2. Portal & authority

**Portal:** serviceonline.bihar.gov.in (RTPS)

**Authority levels** — choose ONE based on customer's purpose:

| Level | Authority | Use when |
|---|---|---|
| Block level | Anchal Adhikari (Block-level officer) | General purpose — scholarship, college admission, scheme application |
| Sub-divisional | SDM (Sub-Divisional Magistrate) | Higher-stakes — central govt jobs, certain reservations |
| District level | DM (District Magistrate) | Specific institutional requirements (rare) |

**Default for operators:** Block level. Fast and accepted everywhere unless customer says otherwise.

**Fees:**
- Government fee: ₹10–₹20 (varies; sometimes free)
- Operator service fee: ₹50–₹150 typical
- **Total to customer:** ₹70–₹170

## 3. Required documents

| Doc | Mandatory? | Specs | Notes |
|---|---|---|---|
| Aadhaar (front + back) | Yes | JPG/PDF, ≤ 200 KB per file | Both sides. Auto-extract data from this. |
| Identity proof (any 1 of: Voter ID / Driving License / Ration Card / PAN) | Yes (1 of these) | JPG/PDF, ≤ 200 KB | Voter ID is most common. |
| Address proof (any 1 of: latest electricity bill / water bill / property tax receipt / rent agreement) | Yes (1 of these) | JPG/PDF, ≤ 200 KB | Must be ≤ 6 months old, and in customer's name OR with stated relationship. |
| Photo | Yes | JPG, ≤ 50 KB, ~35 × 45 mm, light/white background, recent (within 6 months) | This is the form-photo. Different from Aadhaar photo. |
| Self-declaration (Swaghosna) | Yes | PDF/JPG, ≤ 200 KB | Standard format downloadable from portal. Customer signs. Operator scans. **(verify exact format on portal)** |
| Caste certificate | No (unless claiming reservation in usage) | If applicable | Not required for residence cert itself. |
| Affidavit | Sometimes | If no other address proof, a notarized affidavit on ₹10 stamp paper may be accepted | Fallback option only. **(verify which districts accept this)** |

### Tricky cases operators face

- **Customer is renting** — need rent agreement + landlord's NOC. If informal rent (most common rural Bihar), use customer's family member's electricity bill + a relationship-declaration affidavit.
- **Customer has no electricity bill in own name** — use parent's/spouse's bill + a relationship-declaration self-statement.
- **Customer recently moved (< 1 year ago)** — some authorities want previous address residence cert from old block. Most don't ask. **(verify which blocks are strict)**
- **Address spelling differs across documents** — Aadhaar says "Lalganj," voter ID says "Lal Ganj." Use Aadhaar spelling as canonical (it's the gold standard).

## 4. Photo & signature specs

For serviceonline.bihar.gov.in residence cert form:

| Asset | Size limit | Dimensions | Format | Background | Notes |
|---|---|---|---|---|---|
| Photo | ≤ 50 KB | ~35 × 45 mm | JPG | Light / white | Color. Face clearly visible. No filters. **(verify exact px on portal)** |
| Signature | Not separately required for this service | — | — | — | Self-declaration is signed and scanned as a doc, not separately. |

**Operator's typical pain:** Customer's WhatsApp-shared photo is usually 4MB+ from phone. Photo Tool template "Bihar RTPS — 35×45 ≤50KB" must:
1. Crop face + shoulders only (Photo Tool crop tool)
2. Auto-replace background with white if not already (background removal — out of scope for now; for v1, assume customer sends light-bg photo or operator instructs them to)
3. Resize to 35×45 mm
4. Compress JPG quality until ≤ 50 KB
5. Save with predictable filename like `customer_name_photo_50kb.jpg`

## 5. Profile fields the form requires

Mapped to our existing customer profile schema (from extraction):

| Form label | Profile key | Source for extraction | Required? | Notes |
|---|---|---|---|---|
| Applicant name (English) | `name` | Aadhaar (English line) | Yes | Match Aadhaar exactly. |
| Applicant name (Hindi / Devanagari) | `name_hindi` | Aadhaar (Devanagari line) | Yes (verify) | Bihar portal often has both English and Hindi name fields. |
| Father's name | `father_name` | Aadhaar / 10th marksheet | Yes | Aadhaar prints "S/O" or "C/O" — extract that. |
| Mother's name | `mother_name` | Aadhaar (rarely shown) / 10th marksheet | Sometimes | Often optional but Bihar portal asks. |
| Date of birth | `dob` | Aadhaar (DD/MM/YYYY) | Yes | Form expects DD-MM-YYYY format. Convert. |
| Gender | `gender` | Aadhaar (M / F / TG) | Yes | Radio button on form. |
| Mobile number | `phone` | Customer-provided | Yes | OTP verification. Must be operational. |
| Email | `email` | Customer-provided | Optional | For status updates. |
| Aadhaar number | `aadhaar_number` | Aadhaar card | Yes | 12 digits. |
| Voter ID number (EPIC) | `voter_id_number` | Voter ID card | Optional | If using Voter ID as identity proof, required. |
| Caste category | `caste_category` | Customer-provided | Yes | Dropdown: General / SC / ST / OBC-A / OBC-B / EBC / EWS. |
| Religion | `religion` | Customer-provided | Yes | Dropdown: Hindu / Muslim / Christian / Sikh / Buddhist / Jain / Other. |
| Permanent state | `state` | Customer-provided | Yes | Dropdown — always "Bihar" for this service. |
| Permanent district | `district` | Aadhaar address | Yes | Cascading dropdown. |
| Permanent block (Anchal) | `block` | Aadhaar address | Yes | Cascading after district. |
| Permanent panchayat | `panchayat` | Customer-provided | Yes | Cascading after block. |
| Permanent village | `village` | Aadhaar address | Yes | Cascading after panchayat. |
| Ward number | `ward_number` | Customer-provided | Yes for urban; rural may not have | If urban (Nagar Panchayat / Nagar Parishad / Nagar Nigam). |
| Pincode | `pincode` | Aadhaar address | Yes | 6 digits. |
| Current address (if different) | `current_address` | Customer-provided | Optional | Rare — most apply at permanent address. |
| Period of residence (since) | `residence_since` | Customer-provided | Yes | Year only typically. e.g., "Since 2010". |
| Purpose of certificate | `purpose` | Customer-provided | Yes | Free text or dropdown — "College admission", "Govt job", "Scholarship", etc. |

**Profile coverage from current extraction:**
- ✅ name, father_name, dob, gender, aadhaar_number, address fields, pincode are extracted from Aadhaar.
- ❌ mother_name often missing — needs operator confirmation.
- ❌ caste_category, religion, residence_since, purpose — never extracted; operator-input.
- ❌ name_hindi — currently not extracted; need to add this to Groq prompt.

## 6. Form structure on serviceonline.bihar.gov.in

Based on portal flow as of 2024-25 (verify — UI may have changed):

**Step 1: Login**
- Operator logs in with their account (or customer's mobile + OTP).
- Most operators have their own RTPS account for batch applications.

**Step 2: Choose service**
- Navigate: "Apply for Services" → "View All Available Services"
- Search: "आवासीय प्रमाण" or "Residence"
- Select correct authority level (Block / Sub-div / District).

**Step 3: Fill applicant details (Page 1)**
- Personal: name (E + H), father's name, mother's name, DOB, gender
- Identity: Aadhaar, Voter ID
- Contact: mobile (OTP), email
- Caste/religion

**Step 4: Address details (Page 2)**
- Permanent address: state, district, block, panchayat, village, ward, pincode
- Current address (if different) — checkbox
- Period of residence
- Purpose

**Step 5: Document upload (Page 3)**
- Photo (specified spec above)
- Aadhaar (front + back combined, OR separately)
- Identity proof (chosen 1 of)
- Address proof (chosen 1 of)
- Self-declaration (signed)

**Step 6: Preview & Submit (Page 4)**
- Review all fields
- Captcha
- Submit

**Step 7: Acknowledgment**
- Application Reference Number (ARN) generated
- Acknowledgment PDF downloadable
- Print for customer

**Step 8: (Later) Track status**
- Customer / operator tracks via ARN at "Track Application Status"

## 7. Field-mapping notes for the extension

The existing extension auto-fills based on `mappings` (form-field-label → profile-key). For this form, the mappings would look like:

```
formKey: bihar-residence-cert
mappings:
  "applicant name" → name
  "नाम" → name_hindi (if Hindi field separate)
  "father's name" / "पिता का नाम" → father_name
  "mother's name" / "माता का नाम" → mother_name
  "date of birth" / "जन्म तिथि" → dob
  "gender" / "लिंग" → gender (radio)
  "mobile" / "मोबाइल" → phone
  "aadhaar" / "आधार" → aadhaar_number
  "epic" / "voter id" → voter_id_number
  "caste" / "जाति" → caste_category (dropdown)
  "religion" / "धर्म" → religion (dropdown)
  "state" / "राज्य" → state (dropdown — fixed Bihar)
  "district" / "जिला" → district (dropdown — cascade)
  "block" / "अंचल" / "प्रखंड" → block (dropdown — cascade after district)
  "panchayat" / "पंचायत" → panchayat (dropdown — cascade after block)
  "village" / "गांव" → village (dropdown — cascade after panchayat)
  "ward" / "वार्ड" → ward_number
  "pincode" / "पिन कोड" → pincode
  "period of residence" / "निवास की अवधि" → residence_since
  "purpose" / "उद्देश्य" → purpose
```

**Cascading dropdown handling:**
- District → Block → Panchayat → Village requires AJAX wait between selections.
- Extension's `select.cascade` driver already handles this (network-monitor based).
- Critical: dropdowns are populated dynamically; mapper must wait for options to load.

**Captcha:**
- Manual input by operator (unavoidable). Pause autofill before captcha.

**OTP:**
- Mobile OTP required for first-time login on customer's mobile.
- Operator's account avoids per-form OTP but each operator has limit on how many forms per day from same account.

## 8. Edge cases & operator wisdom

**1. Customer doesn't have a phone-verified mobile**
   - OTP-based login fails.
   - Solution: customer provides any reachable family member's mobile, OR operator's account is used.

**2. Address spelling mismatch**
   - Aadhaar says "Patna" but voter ID says "PATNA" or "Pataliputra".
   - Always use Aadhaar's spelling. Most institutions cross-reference Aadhaar.

**3. Father's name on Aadhaar vs marksheet differs**
   - Aadhaar: "Ramesh Yadav"
   - 10th marksheet: "Ramesh Kumar Yadav"
   - Use Aadhaar's version. Note in customer profile that marksheet has different spelling.

**4. Caste category selection without caste cert**
   - Form usually allows dropdown selection without uploading caste cert.
   - But customer must upload caste cert later if claiming reservation in actual usage.

**5. Pincode mismatch with district/block/village dropdowns**
   - Aadhaar address is sometimes in old village name; district reorg has shifted boundaries.
   - Operator must use the dropdown values that match where customer ACTUALLY lives now.
   - Pincode field accepts customer's actual current pincode.

**6. Recently-moved customer**
   - Aadhaar still shows old address.
   - Recommend: customer first updates Aadhaar address via UIDAI, THEN apply for residence cert.
   - If urgent: apply with old address (less risky than mismatch).

**7. Married woman's address**
   - Aadhaar might still have father's address, post-marriage uses husband's.
   - Apply where she ACTUALLY lives (typically husband's address).
   - Marriage certificate as additional proof if asked.

**8. Government portal slowness / outage**
   - serviceonline.bihar.gov.in is slow at month-end and during exam-season peaks.
   - Save work frequently (the portal usually has a "Save Draft" feature).
   - If portal is down, tell customer "kal try karenge" and resume task tomorrow.

**9. Captcha-typing fatigue**
   - Multiple captchas during a single session (login + form submit + status check).
   - Operator should expect ~3 captchas per residence cert task.

**10. Customer's father is deceased**
   - Form may ask for father's name with "(Late Sh.)" prefix.
   - Standard form: "Late Sh. Ramesh Yadav".
   - Verify portal accepts this format.

## 9. Receipt / acknowledgment

After submission, portal generates:

**Acknowledgment PDF** containing:
- Application Reference Number (ARN) — looks like `RTPS/2026/RC/0001234567`
- Applicant name
- Service name
- Application date
- Authority level
- Expected delivery date
- Payment status
- Barcode / QR code
- "Application status track at: serviceonline.bihar.gov.in/citizen/track"

**Operator action:**
- Print 2 copies — one for customer, one for cybercafe records.
- Save PDF to customer's task in CyberControl, linked to this task.
- Note ARN in customer profile.
- WhatsApp the PDF to customer (optional but appreciated by customer — they remember "bhaiya ne bheja tha").

**Status tracking:**
- Customer returns asking "kya hua mera application?"
- Operator opens task → sees ARN → opens portal → enters ARN → status displayed.
- This should be a 30-second action.

## 10. Operator timing & revenue (typical)

| Stage | Time | Notes |
|---|---|---|
| Doc collection (WhatsApp) | 5-15 min | Depends on customer responsiveness |
| Profile extraction + confirm | 2-5 min | Mostly automated via Groq vision |
| Photo prep (50KB JPG) | 2-5 min | Photo Tool with right preset |
| Self-declaration print/sign/scan | 3-5 min | If not pre-done |
| Form fill (with extension) | 5-10 min | Cascading dropdowns slow it |
| Captcha + submit | 1-3 min | Might fail and retry |
| Print acknowledgment | 1 min | |
| Total | 20-45 min | Bihar portal speed dependent |

**Revenue per task:**
- Customer pays: ₹70-170 (govt fee + service fee)
- Operator net (after govt fee, paper, ink): ₹50-130

**Volume expectation:**
- Active block office cybercafe: 3-8 residence certs per day
- Peak (admission season July-Sept, scholarship deadlines): 10-20 per day

## 11. What the CyberControl task UI should make obvious

Distilled from this walkthrough — when an operator opens a "Bihar Residence Certificate" task in CyberControl, they should see at a glance:

1. **Customer name + phone** — top of screen, with WhatsApp link button.
2. **Stage tracker** — Documents → Profile → Photo → Form → Submitted, current step highlighted.
3. **Documents stage:** checklist of what to ask for. Tap each to mark received once tagged in WhatsApp. "Send checklist via WhatsApp" button.
4. **Profile stage:** auto-extracted fields with a "Confirm" action. Highlights any operator-input fields (caste, religion, purpose) needed.
5. **Photo stage:** "Prepare photo for Bihar RTPS (50KB)" button — opens Photo Tool with the right preset (35×45mm, ≤50KB, white bg).
6. **Form stage:** "Open serviceonline.bihar.gov.in" button — opens the portal in a new tab. Extension is already armed with this customer's profile.
7. **Submitted stage:** ARN input field, acknowledgment PDF upload area, "Mark complete" button.
8. **Cost line:** running cost displayed (govt fee ₹10 + service fee ₹100 = ₹110) — operator updates as they go.

## 12. Open questions for product design

1. **Service templates as JSON** — should each service template (this doc → JSON) live in our DB, in a YAML file in repo, or fetched from a CDN? My lean: one JSON file per service, in `services/` folder of the repo, distributed with the frontend. Updating a template = a new commit + deploy.

2. **Hindi name extraction** — current Groq extraction doesn't pull Devanagari Aadhaar text. Adding it = updating the extraction prompt. Worth doing for Bihar/UP services.

3. **Caste category selection UI** — operator-input field, dropdown. Should we ask only when needed? Or always capture it during initial profile?

4. **Cascading dropdown "village" data** — Bihar has thousands of villages. Form provides them via portal AJAX. Extension handles cascade. Do we need a mirror dataset in CyberControl, or always rely on portal dropdowns?

5. **Self-declaration template** — every service that needs a signed declaration. We could pre-generate a self-declaration PDF with the customer's data printed, for them to sign. Saves operator typing.

6. **Status tracking deep-link** — when customer comes back asking for status, does CyberControl auto-open the portal, paste ARN, retrieve status, and show it inline? That's high-value.

7. **WhatsApp doc checklist** — first-time operator clicks "Send checklist via WhatsApp" in the task. We send an automated message: *"Niwas certificate ke liye yeh documents bhejiye: 1. Aadhaar (front+back) 2. Voter ID..."* in Hindi. We track which docs received via tagging.

8. **Operator notes field** — every task should have a free-text "operator notes" field for things that don't fit the schema ("Customer's mother's name disputed; using Aadhaar version", etc.).

---

## Appendix A: Hindi document checklist (WhatsApp template)

Pre-built message to send to customer when starting a Residence Certificate task:

```
Namaste,

Niwas Praman Patra (Residence Certificate) ke liye yeh documents
mujhe WhatsApp pe bhej dijiye:

1. Aadhaar Card — front aur back, dono side
2. Voter ID / Driving License / Ration Card mein se koi ek
3. Latest Bijli bill (Electricity bill) — pichle 6 mahine ka
4. Aap ki recent passport size photo — light/white background
   (mobile se acche light mein lijiye, full face dikhe)
5. Aap ka mobile number — OTP verify karne ke liye

Sab document pe naam aur address saaf dikhe.
Photo dhundhli (blurry) na ho.

Kuch confusion ho to mujhe call kijiye.

— [Operator Name], [Cybercafe Name]
```

## Appendix B: Confidence levels in this doc

| Section | Confidence | Verification needed? |
|---|---|---|
| Service overview, fees, timing | High | Spot-check with current operator |
| Required documents | High | Verify on live portal (last verified: training data 2024) |
| Photo/signature specs | Medium | **Verify exact pixel/KB on live portal** |
| Form structure (steps) | Medium | Portal UI has changed before; **walk through portal once and confirm** |
| Hindi field labels | Medium | Verify exact wording on portal |
| Edge cases | High | From general knowledge of Bihar govt processes |
| Cascading dropdown behavior | High | Standard pattern across Bihar portal |
| Operator timing & revenue | Medium | Varies by region; sample size of public reports + reasoning |

**Strongly recommend:** before locking this template into the product, do ONE actual residence cert application on the live portal (with a real customer's consent) and update this doc with anything that doesn't match.

---

**Next services to template (in priority order):**

1. ✅ Bihar Residence Certificate (this doc)
2. Bihar Caste Certificate (very similar structure — likely 80% same)
3. Bihar Income Certificate (very similar structure)
4. SSC exam form (different portal, different photo specs, OTR pre-requirement)
5. RRB exam form
6. Bihar Student Credit Card (BSCC)
7. PAN application
8. Voter ID (Form 6)
9. Passport
10. Driving License
