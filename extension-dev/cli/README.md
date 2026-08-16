# cc-debug — product-path debug CLI

**DEBUG ONLY.** Lives on branch `debug/cc-cli`.

| Rule | |
|---|---|
| **Do not merge to `master`** | Ever. This is not product/release code. |
| **Do not ship in extension zip** | Operators use the side panel, not this CLI. |
| **Sync direction** | Pull/rebase product tip *into* `debug/cc-cli` when product moves. Never merge debug → master. |
| **Product bugfixes** | If CLI finds a product bug, fix on a product branch as a normal PR; leave the CLI here. |

## Why

GUI status text can lie (“filled” while DOM is empty). This CLI drives the **in-page product inject path** (same scripts as `fill-orchestrator` `PRODUCT_PATH_SCRIPTS`) and applies a **DOM truth gate**.

Not a full Chrome-extension side-panel load (see optional future `--extension-load`).

## Setup

```bash
# once
cd extension-dev/tests/browser && npm install && cd ../../..

# Chrome installed, or:
# set CHROME_PATH=C:\Path\To\chrome.exe
```

## Commands

```bash
node extension-dev/cli/cc-debug.mjs status
node extension-dev/cli/cc-debug.mjs perceive --fixture perception-native.html
node extension-dev/cli/cc-debug.mjs plan --fixture perception-native.html
node extension-dev/cli/cc-debug.mjs fill-e2e --fixture perception-native.html
node extension-dev/cli/cc-debug.mjs fill-e2e --fixture perception-native.html --headed

# prove truth gate detects lies
node extension-dev/cli/cc-debug.mjs fill-e2e --fixture perception-native.html --force-lie
```

### Live mode (Phase 2)

```bash
set CC_BACKEND_URL=https://your-service/api
set CC_ACCESS_TOKEN=...
node extension-dev/cli/cc-debug.mjs fill-e2e --mode live --fixture perception-native.html --profile path\to\profile.json
```

## Artifacts

Each run writes under `extension-dev/cli/out/<run-id>/` (gitignored):

- `meta.json`, `snapshot.json`, `plan.json`, `execution.json`
- `dom-before.json`, `dom-after.json`, `truth.json`, `summary.txt`

## Future

Add more debug commands on **this branch** (HIM, adaptive modes, WSS). Still never merge to master.
