# Form Corpus

Test corpus for the autofill extension. Each entry captures a real govt/exam form page so the extractor can be validated against it without re-loading the live site every time.

## Layout

```
corpus/
├── sites/
│   ├── ssc.gov.in/
│   │   ├── scribe-otr.html          ← saved DOM snapshot
│   │   ├── scribe-otr.expected.json ← ground truth: list of fields the extractor MUST find
│   │   └── README.md                ← notes, framework hint, gotchas
│   ├── serviceonline.bihar.gov.in/
│   │   └── ...
│   └── ...
├── snapshot.js                      ← script that pulls DOM via CDP
└── validate.js                      ← runs current extractor on each snapshot, diffs vs expected
```

## How to add a site

1. Open the form in a Chrome with the extension loaded + `--remote-debugging-port=9222`
2. Run `node corpus/snapshot.js <slug>` — saves the DOM
3. Manually edit `corpus/sites/<slug>/<form>.expected.json` with what the extractor should return
4. Run `node corpus/validate.js` — ensures all corpus entries still extract correctly

## Tech-stack coverage we want

| Tech | Site |
|---|---|
| Angular (Material + custom ng-dropdown) | ssc.gov.in |
| jQuery + classic HTML | serviceonline.bihar.gov.in (RTPS) |
| React | nta.ac.in (JEE/NEET) |
| React + OAuth | digilocker.gov.in |
| Vue | parivahan.gov.in |
| classic JSP/HTML | upsconline.nic.in, cetbed.ucanapply.com |
| Custom Web Components | (TBD) |

## Why this exists

Without a corpus, every extractor change is tested by clicking through one live site at a time. With a corpus, a CI run validates extractor changes across 10+ form types in seconds. It also serves as documentation — you can see exactly what each form type looks like.
