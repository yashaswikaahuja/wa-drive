# CyberControl — Changelog

## v2.0 — May 5, 2026

### New Features

#### AI Document Extraction (Form Ready)
- Added **Auto-fill from Document** button in Form Ready page
- Uses **Groq Vision AI** (Llama 4 Scout) to extract data from Aadhaar, PAN, Voter ID, Passport, Health ID, Admit Cards, PDFs
- Extracts: name, DOB, gender, address, father name, mother name, Aadhaar number, PAN number, EPIC number, ABHA address, mobile, roll numbers, category, and more
- PDF support: text-based PDFs use Drive text export; scanned PDFs use Drive thumbnail as image
- Multi-document merge: extracting from multiple documents merges data without overwriting existing values

#### Dynamic Form Fields
- Fields are created dynamically from AI response — no hardcoded field list
- Staff can add custom fields (type name + press Enter or click +)
- Staff can remove fields (hover → ✕ button)
- "Clear & Start New" button to reset for next student

#### Student Profiles
- **Save as Profile** button stores all extracted fields to backend
- Tag passport photo and signature per file before saving
- Profile stored with: all form fields + photo URL + signature URL
- Backend API: `GET /api/profiles`, `POST /api/profiles`, `DELETE /api/profiles/:phone`
- Data persisted in `backend/data/profiles.json`

#### Profiles Management Page (`/profiles`)
- View all saved student profiles
- Search by name or phone number
- Edit any field in a profile
- Delete profiles
- Shows passport photo and signature thumbnails
- Accessible from nav bar → Profiles tab

#### Chrome Extension — CyberControl AutoFill
- Auto-fills SSC, Railway, NEET, UPSC, IBPS, CRPF, BPSC, RTPS Bihar and other govt forms
- Fuzzy matching: matches field labels/IDs to profile data without hardcoding
- AI matching: uses Groq to map unknown fields (Hindi labels, unusual field names)
- Smart exclusions: skips education table rows, doesn't fill state/district into name fields
- First/Last name split: fills `firstName`/`lastName` fields correctly
- 100% accuracy on 12/14 tested forms (SSC CGL, Railway RRB, NEET, UPSC, IBPS PO, UP Police, CRPF, BPSC, RTPS Bihar, Bank KYC, Voter ID, NTA CUET)
- Auto-update system: extension checks server version on every open, shows purple banner when update available
- Extension files: `extension/` folder in repo
- Download endpoint: `GET /api/extension/download`
- Version endpoint: `GET /api/extension/version`
- Extension zip stored at `/opt/cybercontrol-hub/extension.zip`

#### Auto-update Infrastructure
- Backend serves extension zip at `/api/extension/download`
- Backend serves version info at `/api/extension/version`
- To release update: bump version in `manifest.json`, repackage zip, upload to GCP, update server version number

### Bug Fixes
- Fixed Vercel auto-deploy: GitHub Actions workflow builds frontend and deploys to Vercel
- Fixed tunnel URL auto-update: `update-tunnel-url.sh` detects new Cloudflare URL, updates `helpers.ts`, pushes to GitHub
- Fixed WORKER_SECRET not loaded by PM2 (added to `ecosystem.config.cjs`)
- Fixed PDF extraction syntax errors in `process.routes.js`
- Fixed field merge: second document extraction no longer overwrites values from first document
- Fixed state/district fields being filled with candidate name
- Fixed father/mother name fields being filled with candidate name

### Infrastructure Changes
- Added `tunnel-url-updater` PM2 process (cron every 30 min)
- GitHub Actions workflow: `.github/workflows/main.yml` deploys frontend on `frontend/**` push
- Vercel env vars: `VITE_API_URL`, `VITE_SOCKET_URL` set directly in Vercel project settings

---

## v1.0 — April 2026 (Initial)

- WhatsApp inbox via Baileys
- Google Drive file storage
- Real-time dashboard with Socket.IO
- Photo processing: face align, Aadhaar layout, passport sheet
- Background removal via remove.bg API
- Cloudflare tunnel for HTTPS
