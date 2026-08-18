# Create GitHub issues for Legacy → Product Fill Transformation
# Usage: pwsh extension-dev/scripts/create-transform-issues.ps1
# Requires: gh auth login

$ErrorActionPreference = "Stop"
$Repo = "yashaswikaahuja/wa-drive"

function Ensure-Label($name, $color, $desc) {
  # Create if missing; ignore 422 already_exists
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $out = gh api -X POST "repos/$Repo/labels" -f name="$name" -f color="$color" -f description="$desc" 2>&1
  if ($LASTEXITCODE -ne 0 -and "$out" -notmatch "already_exists|Validation Failed") {
    Write-Warning "Label $name : $out"
  }
  $ErrorActionPreference = $prev
}

Write-Host "Ensuring labels..."
Ensure-Label "transform-legacy" "0E8A16" "Legacy fill kernel to product transformation"
Ensure-Label "fill-kernel" "1D76DB" "Sequential fill settle label-primary"
Ensure-Label "wss" "5319E7" "WebSocket live session"
Ensure-Label "conditional-fill" "D93F0B" "Radio checkbox as decisions"
Ensure-Label "common-sense" "FBCA04" "Derive gender education marital"
Ensure-Label "learning" "B60205" "Operator corrections to mappings"
Ensure-Label "form-context" "006B75" "Visible DOM active hierarchy"
Ensure-Label "observability" "C5DEF5" "Sessions planned actual metrics"

Write-Host "Creating / finding milestone..."
$msTitle = "Legacy→Product Fill Transformation"
$existing = gh api "repos/$Repo/milestones?state=open&per_page=100" | ConvertFrom-Json
$ms = $existing | Where-Object { $_.title -eq $msTitle } | Select-Object -First 1
if (-not $ms) {
  $ms = gh api -X POST "repos/$Repo/milestones" `
    -f title="$msTitle" `
    -f state="open" `
    -f description="Port legacy sequential fill into product extension; WSS session; conditional plan; common sense; learning; visible context." | ConvertFrom-Json
  Write-Host "Created milestone #$($ms.number)"
} else {
  Write-Host "Reusing milestone #$($ms.number)"
}
$msNum = $ms.number

function New-Issue($title, $body, $labels) {
  $labelArgs = @()
  foreach ($l in $labels) { $labelArgs += @("-f", "labels[]=$l") }
  $tmp = New-TemporaryFile
  Set-Content -Path $tmp -Value $body -Encoding utf8
  $r = gh api -X POST "repos/$Repo/issues" `
    -f title="$title" `
    -f milestone="$msNum" `
    -F "body=@$tmp" `
    @labelArgs | ConvertFrom-Json
  Remove-Item $tmp -Force
  Write-Host "  #$($r.number) $title"
  return $r.number
}

$issues = @()

$issues += New-Issue "Epic: Legacy fill kernel → product extension" @"
## Goal
Port the **legacy sequential fill kernel** into the product extension, then add form context, conditional filling, common sense, operator learning, and a **WSS-first** live session.

## North star
Legacy is the best *actuator*. Product should be that actuator + intelligence + WSS — not a weaker parallel engine.

## Success
- Fills as well as legacy-best on Bihar / SSC / Mazagon
- WSS for auth presence + fill/debug (no 20–30s HTTPS login dead air)
- Radio/checkbox as **conditional** decisions, not free-text data
- Operator corrections improve next fill
- Only **visible** fields planned (ServiceOnline DOM noise excluded)
- Planned + actual on sessions; no false VERIFIED_LIE on portal-masked Aadhaar

## Non-goals
- Dual engines forever
- Pure LLM primary fill
- Empty hostname as legacy bug (product path)
- Unmapped count = visual field count on ServiceOnline

## Child issues
See milestone **Legacy→Product Fill Transformation** and ``extension-dev/TRANSFORM-LEGACY-PATH.md``.

## Labels
transform-legacy
"@ @("transform-legacy", "enhancement")

$issues += New-Issue "[T1] Freeze sequential fill kernel from legacy-best" @"
## Phase A — Fill kernel

### Problem
Product path under-delivers on real portals; legacy sequential fill + settle is battle-tested.

### Deliverable
Portable kernel: DOM-order sequential act; settle after text/choice/select/button; strategy verify; wait budget for dead controls.
Source behavior: ``extension-legacy-best`` 5.91.5+.

### Done when
Parity on Bihar/SSC/Mazagon; no multi-minute hang on dead secondary selects.

### Refs
``extension-dev/TRANSFORM-LEGACY-PATH.md`` Phase A
"@ @("transform-legacy", "fill-kernel", "enhancement")

$issues += New-Issue "[T2] Label-primary planning for DATA fields" @"
## Phase A

### Problem
DOM id/name can steal semantic match (email←address, husband←father).

### Deliverable
Label is semantic authority; selector is only act target when label is strong.

### Done when
Id-only wrong mapping does not occur for bilingual ServicePlus-style labels.

Depends: T1
"@ @("transform-legacy", "fill-kernel", "enhancement")

$issues += New-Issue "[T3] Soft failure hygiene (file dialog, AI timeout)" @"
## Phase A

### Problem
Chrome blocks file chooser without user activation; AI residual timeout shows as extension Errors.

### Deliverable
Never ``el.click()`` file inputs in automation; AI soft-timeout with ``console.debug`` only.

### Done when
SSC file → waiting_human; AI timeout does not block fill or spam chrome://extensions Errors.

Depends: T1
"@ @("transform-legacy", "fill-kernel", "bug")

$issues += New-Issue "[T4] WSS auth/presence session (login UX)" @"
## Phase A2 — WSS

### Problem
HTTPS login/refresh failure often degrades UX with 20–30s silent retry.

### Deliverable
Authenticated WSS after token mint: fail-fast, heartbeat, reconnect with short backoff + UI state. HTTPS only for bootstrap/fallback.

### Done when
Auth failure surfaces in seconds; reconnect is visible; no primary long HTTPS poll loop.

Depends: Epic T0
"@ @("transform-legacy", "wss", "enhancement")

$issues += New-Issue "[T5] WSS fill/debug event stream" @"
## Phase A2

### Problem
Sessions appear only after end HTTPS post; dynamic DOM hard to debug.

### Deliverable
Stream field.start / wait / done / fail with planned+actual over WSS; replan hooks. Durable session post remains.

### Done when
Live debug without only polling final session.

Depends: T4, T1
"@ @("transform-legacy", "wss", "observability", "enhancement")

$issues += New-Issue "[T6] Conditional classifier for radio/checkbox" @"
## Phase B

### Problem
Legacy maps radios as free data (e.g. checkbox planned with Aadhaar; gender strategy=text-input, planned MALE actual true).

### Deliverable
Classify radio/checkbox as CONDITIONAL | CONSENT | HUMAN — never default free-text fuzzy/AI data map.

### Done when
SSC Aadhaar not planned onto checkbox-group; gender uses option/conditional path.

Depends: T2
"@ @("transform-legacy", "conditional-fill", "bug")

$issues += New-Issue "[T7] Conditional decision planner" @"
## Phase B

### Problem
Yes/No and multi-option decisions need rules, not profile string dumps.

### Deliverable
Plan conditionals via profile flags, derive, learned choice; else skip/human.

### Done when
Disability / General-Tatkal / I Agree / Accept-Reject use decisions.

Depends: T6
"@ @("transform-legacy", "conditional-fill", "common-sense", "enhancement")

$issues += New-Issue "[T8] Common-sense derive pack (deterministic v1)" @"
## Phase B

### Problem
No gender-from-name; DOB format causes false skip; changed-name filled with full name; husband from father.

### Deliverable
Deterministic derive: gender-from-name when missing; skip husband if unmarried; education from records; DOB normalize for act+verify; changed-name only if set.

### Done when
Mazagon DOB not skipped only for DD/MM vs ISO; salutation derive when gender known.

Depends: T2
"@ @("transform-legacy", "common-sense", "enhancement")

$issues += New-Issue "[T9] Visible/active field filter" @"
## Phase C — Form context

### Problem
ServiceOnline exposes many DOM nodes that are not on the visual form; unmapped counts look catastrophic.

### Deliverable
Only plan/act on operator-visible, enabled controls.

### Done when
Unmapped not dominated by non-visual DOM on Bihar.

Depends: T1
"@ @("transform-legacy", "form-context", "enhancement")

$issues += New-Issue "[T10] Active cascade / dual-hierarchy context" @"
## Phase C

### Problem
Hindi LGD cascade vs English office shell; radio can unlock selects (not only select→select).

### Deliverable
Prefer live hierarchy; sequential settle covers radio↔select AJAX; twins marked duplicate_hierarchy.

### Done when
Visual State→District→Block fills; dead office shells do not dominate wall time.

Depends: T9, T1
"@ @("transform-legacy", "form-context", "fill-kernel", "enhancement")

$issues += New-Issue "[T11] Correction promote: data vs conditional" @"
## Phase D — Learning

### Problem
Auto-promote matches operator value string to any profile field; Yes/No conditionals do not learn flags; needs profileId.

### Deliverable
Promote by class: data→profileKey; conditional→option/flag. Require profileId. Reduce ambiguous string equality.

### Done when
Operator No on disability and District correction improve next plan.

Depends: T6, T4
"@ @("transform-legacy", "learning", "enhancement")

$issues += New-Issue "[T12] Reliable correction capture + session link" @"
## Phase D

### Problem
Corrections often only on late submit/unload; no sessionId link; no WSS event.

### Deliverable
Reliable capture; optional WSS correction; link sessionId.

### Done when
Edits after fill appear and affect next fill on same form key.

Depends: T11
"@ @("transform-legacy", "learning", "wss", "enhancement")

$issues += New-Issue "[T13] Lift sequential kernel into product extension" @"
## Phase E — Product

### Problem
Product Fill under-delivers vs legacy on real portals.

### Deliverable
Product default café path = sequential kernel + plan layers; APE only where it earns keep or opt-in.

### Done when
Side-panel Fill matches legacy-best quality on golden portals.

Depends: T1–T3, T6–T10
"@ @("transform-legacy", "fill-kernel", "enhancement")

$issues += New-Issue "[T14] Product WSS client wired to fill loop" @"
## Phase E

### Deliverable
Wire ``ws-client`` / wss-protocol for plan/observe/debug; HTTPS fallback documented.

### Done when
Staging fill works WSS-primary.

Depends: T4, T5, T13
"@ @("transform-legacy", "wss", "enhancement")

$issues += New-Issue "[T15] Golden portal regression pack" @"
## Phase E

### Deliverable
Checklist/CI: Bihar ServiceOnline, SSC OTR, Mazagon registration.

### Done when
Gate green before release.

Depends: T13
"@ @("transform-legacy", "fill-kernel", "enhancement")

$issues += New-Issue "[T16] Session metrics honesty (product + posts)" @"
## Phase F — Observability

### Problem
Empty hostname on many **product/newer** posts; totals hide skip/unmapped; missing actualValue.

### Deliverable
Always hostname; split filled/skipped/unmapped/failed; always attempt actualValue.

### Done when
Admin sessions show planned/actual and honest counts.

Depends: T13
Note: empty hostname is **not** a legacy-only bug.
"@ @("transform-legacy", "observability", "bug")

$issues += New-Issue "[T17] CLI audit: portal mask + date format aware" @"
## Phase F

### Problem
CLI flagged Aadhaar ``********8335`` as VERIFIED_LIE though portal masks after fill; DOB format variants false mismatch.

### Deliverable
Mask/date-aware agree(); PORTAL_MASKED info flag.

### Done when
SSC Aadhaar session not lied; Mazagon DOB format variants OK in CLI.

Depends: —
Partial: cyb-cli valuesAgree already improved.
"@ @("transform-legacy", "observability", "bug")

Write-Host ""
Write-Host "Created $($issues.Count) issues on milestone #$msNum"
Write-Host "See extension-dev/TRANSFORM-LEGACY-PATH.md"
