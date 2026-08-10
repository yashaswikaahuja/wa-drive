# Extension & Browser Boundary Security Regression Suite

`run.mjs` is the permanent `CHECK-011` security gate for the extension runtime and browser boundary. It is a long-lived CI pillar, not an issue-specific smoke test.

Run locally:

```bash
node extension-dev/tests/security/run.mjs
```

The suite protects:

- **SEC-001:** hostile `postMessage` origins, sources, markers, reply loops, and unknown message types fail closed.
- **SEC-002:** credentials, fill records, undo values, and other sensitive state never use page-readable DOM attributes or page storage.
- **SEC-003:** the real `background.js` listeners reject auth/backend overwrite attempts through `onMessage`, long-lived ports, and `onMessageExternal`; responses do not echo credentials.
- **SEC-004:** host permissions stay on the documented grant set (`http://*/*`, `https://*/*`, `file://*/*`) so fixtures and any portal can be tested. Domain allowlisting will move to owner-panel later; do not silently reintroduce `<all_urls>` without review.
- **Browser-private boundary:** public Page IR, ActionPlan, and ExecutionObservation schemas cannot define selectors, DOM handles, live node references, or private binding fields; the DOM gateway remains inaccessible to the page.
- **Pillar integrity:** GitHub Actions and the verification registry must retain the dedicated hard-failing `CHECK-011` job.

## Security bug closure rule

Every extension or browser-boundary security bug is a regression-test candidate. Before closing its fix issue:

1. Add an exploit-shaped test that fails against the vulnerable behavior.
2. Apply the smallest runtime/policy fix.
3. Verify the new test passes and remains part of `run.mjs` (directly or through a child suite).
4. Run `CHECK-011`, relevant governance/boundary checks, and the full suite.
5. Record the regression evidence in the issue closure comment.

A reviewer may document why a test is impractical, but silent omission is not acceptable. Changes that weaken this suite, its CI job, or its hard-failure status require explicit security review.
