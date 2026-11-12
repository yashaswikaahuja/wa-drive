# Chrome Web Store listing — CyberControl AutoFill

Use this copy in the Developer Dashboard. Upload `release/cybercontrol-extension-<version>.zip` (not the CRX).

## Item

- **Name:** CyberControl AutoFill
- **Version:** see `manifest.json` (currently 5.92.42)
- **Homepage:** https://app.cybercontrol.fun/app
- **Privacy policy:** https://cybercontrol.fun/privacy
- **Category:** Productivity
- **Language:** English

## Short description

Fill government and portal forms from CyberControl customer profiles — for cafe operators.

## Long description

CyberControl AutoFill helps cyber-cafe operators fill government and portal forms from customer profiles stored in the CyberControl Hub.

How it works:

1. Sign in to CyberControl Hub in Chrome.
2. Open the form page.
3. Open the CyberControl side panel, pick the customer, and tap Fill this form.

The extension reads visible fields on the current form, matches them to the selected customer profile, and types the values. It does not submit the form. OTP, password, CAPTCHA, and payment fields are skipped.

Customer profiles stay in the cafe workspace. Fill runs only when the operator chooses a customer and taps Fill this form.

## Single purpose

Fill the current web form from a CyberControl customer profile after an explicit operator action.

## Permission justifications

### storage

Saves the Hub session token, API URL, theme, and the last selected customer so the side panel stays signed in.

### activeTab

Used when the operator opens the side panel or taps Fill this form, so the extension can work on the form tab they are looking at.

### scripting

Injects the bundled fill scripts into the current form tab after the operator taps Fill this form. Scripts are shipped in the package. No remote JavaScript is executed.

### tabs

Finds the Hub tab to open https://app.cybercontrol.fun/app, and identifies the active form tab for fill.

### alarms

Refreshes the signed-in Hub session before the token expires.

### sidePanel

The operator UI is a Chrome side panel (`popup.html`), not a toolbar popup.

### Host access (`https://api.cybercontrol.fun/*`, `wss://api.cybercontrol.fun/*`, `https://app.cybercontrol.fun/*`)

Talks to the CyberControl API, Hub, and fill WebSocket. Profiles are loaded over HTTPS; fill planning uses the authenticated WebSocket.

### Host access (`http://*/*`, `https://*/*`)

Cafe operators fill many government portals. After the operator taps Fill this form, bundled scripts run on that page only. The extension does not inject a content script on every website. File pages are not accessed.

The Hub bridge content script is limited to `https://app.cybercontrol.fun/*`. Store packages do not include localhost.

### externally_connectable

Only the CyberControl Hub origin (`https://app.cybercontrol.fun/*`) may message the extension.

## Privacy practices (dashboard)

- **Collects:** customer profile fields the operator already stored in Hub (name, ID numbers, address, dates) and technical fill results (field labels, success/skip).
- **Does not collect:** passwords, OTP, CAPTCHA, payment credentials, or browsing history.
- **Used for:** filling the current form and improving mapping quality in the cafe workspace.
- **Not sold.** Not used for credit or advertising.
- **Remote code:** none. All executable code is in the store package. The API returns profile values and field mappings (data), not scripts. The extension does not execute remote action lists.

## Screenshots

Show: signed-in side panel with customer search, Fill this form on a government form, fill summary.

## Notes for reviewers

- Manifest V3.
- No `eval`, `new Function`, or remote `<script>`.
- `content.js` is an origin-allowlisted Hub bridge, not a universal page injector.
- Fill injects via `chrome.scripting.executeScript` on the operator-selected tab.
- Sensitive-data policy: ADR-0014 and `architecture/perception-privacy.yml`.
