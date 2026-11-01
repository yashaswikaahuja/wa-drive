# CyberControl browser tools

Instructions for an LLM connected to the CyberControl MCP server.

The server does not drive a cloud browser. It sends each action to the Chrome on the operator’s computer where the CyberControl extension is signed in to the same workspace. The operator must keep that Chrome open and the extension connected.

## Connect

MCP URL:

`https://api.cybercontrol.fun/api/mcp`

Add that URL in the LLM app with no pasted token. The app opens a browser window. The operator signs in with the CyberControl email or phone and password. The app then holds the session and calls the tools below.

If a tool returns `no_extension_connected`, the extension is not on the workspace socket. Ask the operator to open Chrome, confirm the CyberControl extension is signed in, and try again. `extension_timeout` means the extension did not answer in time. Read the page again before repeating the same action.

## Profiles and Fill

`list_profiles` returns the customers in this workspace: `id`, `name`, `phone`, and `displayLabel`.

`read_profile` with that `profileId` returns `fields`, the values the extension can type. Read this before deciding which customer to fill.

`fill` runs the extension Fill button on the open form for one `profileId`. The extension plans from the saved mappings and that profile, then types in Chrome. This is the same Fill the operator uses. It is not `fill_form`.

```json
{ "profileId": "the id from list_profiles" }
```

Call `fill` once. Then `read_form` and use the `records` in the result. Each record has `result` (`filled`, `skipped`, `failed`), `label`, `plannedValue`, and `actualValue`. Do not send a second `fill` for the same page until you have read what the first one did.

`fill` does not solve a CAPTCHA, type a card number, or press the final pay button. If the extension is not signed in, the result is `extension_not_signed_in`. If this tool returns `unknown task`, the operator needs to reload the unpacked extension so it can receive Fill from the MCP server.

## Abilities

The other tools act on the page directly. Call one tool at a time. Wait for the result before the next call.

### `list_tabs`

Lists the tabs open in the operator’s Chrome. Each row has `tabId`, `title`, `url` (the query string is left off), and `active`.

```json
{}
```

### `focus_tab`

Brings one of those tabs to the front. Pass the `tabId` from `list_tabs`.

```json
{ "tabId": 269204060 }
```

Other tools accept the same `tabId` when more than one web page is open. With no `tabId`, they use the most recently used web page.

### `close_tab`

Closes one tab from `list_tabs`. Pass that `tabId`. Use this after `open_url` so the bench does not leave extra tabs open.

```json
{ "tabId": 269204060 }
```

### `scroll`

Moves the page. `dy` is pixels downward. A negative `dy` moves up. `dx` moves sideways.

```json
{ "dy": 600 }
```

Jump to the top or the bottom:

```json
{ "to": "bottom" }
```

Bring one control into view. `selector` comes from the latest `read_form`.

```json
{ "selector": "form-field-8" }
```

The result includes `scrollY`, `scrollHeight`, `clientHeight`, `scrollRoot` (`window` or `element`), and `moved`. Scroll acts on the overflowing root, including a nested `overflow:auto` pane. `to: "bottom"` retries while lazy content grows. `moved` false means that root was already at that edge.

### `history`

Goes back, forward, or reloads the web tab.

```json
{ "action": "back" }
```

`action` is `back`, `forward`, or `reload`. After it returns, call `read_form` or `snapshot`. The page may still be loading.

### `mouse_click`

Clicks the GUI with the mouse. `x` and `y` are visible-screen CSS pixels. A snapshot JPEG can be smaller than the screen; convert with `cssX = imageX * scaleX` and `cssY = imageY * scaleY` from that snapshot. `selector` from the latest `read_form` clicks the center of that control instead. Copy `frameId` from the read when the control is inside an iframe.

```json
{ "x": 640, "y": 24 }
```

```json
{ "selector": "button.ytSearchboxComponentSearchButton" }
```

`button` is `left`, `right`, or `middle`. `count` 2 is a double-click. After it returns, `read_form` or `snapshot` again.

### `keyboard`

Types on the keyboard in the focused control, or presses a named key. Pass `selector` to focus that control first.

```json
{ "selector": "[name=\"search_query\"]", "text": "govind bolo hari gopal bolo", "key": "Enter" }
```

```json
{ "key": "Escape" }
```

`key` is one of `Enter`, `Tab`, `Escape`, `Backspace`, `Delete`, `Space`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, or a single character. `keys` is a short sequence of those. `ctrl`, `alt`, `shift`, and `meta` are modifiers. It does not type into a password, CAPTCHA, or OTP box. Copy `frameId` from `read_form` when the control is inside an iframe.

### `open_url`

Opens an `http` or `https` URL. Default is a new tab. Pass `tabId` or `newTab: false` to load the URL in an already open tab so `history` back/forward has a stack.

```json
{ "url": "https://www.irctc.co.in/nget/train-search" }
```

```json
{ "url": "https://the-internet.herokuapp.com/iframe", "tabId": 269204060 }
```

```json
{ "url": "https://demoqa.com/text-box", "newTab": false }
```

### `snapshot`

Photographs the page the operator sees. Call it when the field list is not enough to tell what is on screen: a popup, a CAPTCHA, a train card, or a value that `read_form` did not describe. It does not type or click.

Visible screen, which is one capture:

```json
{}
```

Whole page. The extension scrolls, stitches up to six screens, then scrolls back. A tall page sets `clipped` to true. A sticky header can repeat in each band.

```json
{ "scope": "page" }
```

One area. `selector` is a field or button from the latest `read_form`. `rect` is CSS pixels on the visible screen: `x`, `y`, `width`, `height`.

```json
{ "selector": "form-field-1" }
```

```json
{ "rect": { "x": 120, "y": 80, "width": 360, "height": 48 } }
```

The result is a JPEG plus `url`, `scope`, `width`, `height` (JPEG pixels), `cssWidth`, `cssHeight` (CSS pixels of the captured area), `scaleX`, `scaleY`, `clickSpace: "css"`, and `clipped`. `mouse_click` uses CSS pixels: `cssX = imageX * scaleX`. `not_found` means that selector is not on the page. `open_a_form_page` means the active tab is not a normal web page. `unknown task` means the operator needs to reload the unpacked extension.

### `read_form`

Reads the page the extension will act on. Returns input fields and pressable controls.

```json
{}
```

Pass `tabId` only after a previous result included one. With no `tabId`, the extension uses the open IRCTC tab when one exists, otherwise the active tab.

Each item has:

- `selector` — the handle for a later `fill_form` or `click`
- `label` and `visualLabel` — the text the operator sees
- `type` — `text`, `checkbox-group`, `button`, `contenteditable`, and similar
- `frameId` — Chrome frame id when the isolated world ran in that frame. Same-origin editors such as TinyMCE `about:blank` are read through the parent `contentDocument`; copy `frameId` when it is present, and `fill_form` / `keyboard` still find `#tinymce` from the parent tab.
- `role` — `button` on controls that are clicked, absent on typed fields

Selectors such as `form-field-1` and `cc-button-6` are positions in that read. They change when the page changes. After navigation, a new dialog, or a click that rebuilds the card, call `read_form` again and use the new selectors.

### `fill_form`

Types into fields from the latest read. It does not press buttons.

```json
{
  "fields": [
    {
      "selector": "form-field-1",
      "value": "SURAT",
      "type": "text",
      "label": "Enter From station. Input is Mandatory.",
      "visualLabel": "Enter From station. Input is Mandatory."
    }
  ]
}
```

Every field needs `selector` and a non-empty `value`. Empty values are dropped. Send at most 80 fields. Copy `label` and `visualLabel` from the read so the extension can refuse a field whose label changed.

For a station box, a short value such as `SURAT` is what you type. The page may then replace it with a longer station line. Read the page again and confirm the box before leaving that field.

### `click`

Presses one control from the latest read.

By visible text:

```json
{ "text": "Search Trains" }
```

Or by the control object, which is more precise when the same words appear twice:

```json
{
  "control": {
    "selector": "cc-button-6",
    "label": "Sleeper (SL)",
    "visualLabel": "Sleeper (SL)"
  }
}
```

`text` must be 80 characters or less. Prefer `control` from the latest `read_form` when several controls share a name.

## Dropdowns

A dropdown is not a text box. Do not type a choice into it unless `read_form` says that control’s `type` is `text`.

Use the field from the latest `read_form`.

**The choices are already listed.** `type` is `dropdown`, `select`, `ng-dropdown`, or `mat-select`, and `options` is a list of visible labels. Call `fill_form` with that field’s `selector`, the same `type`, and `value` set to one string from `options`. Copy `label` and `visualLabel` from the read.

```json
{
  "fields": [
    {
      "selector": "form-field-4",
      "value": "GENERAL",
      "type": "dropdown",
      "label": "Quota",
      "visualLabel": "Quota"
    }
  ]
}
```

Then `read_form` again. Continue when the field shows that choice. A record of `value_mismatch` means the control stored a different code than the words you sent. Read the page before sending the same value again.

**The choices are not listed yet.** The closed control is a button, or `options` is null. `click` the dropdown. `read_form`. `click` the row whose label is the choice you want. `read_form` again and confirm that row is no longer only an unselected option.

**A second dropdown depends on the first**, such as State then District. Finish the parent and `read_form` before choosing the child. The child’s options do not exist until the parent has a value.

## How to control a page

1. `list_tabs` when more than one page may be open. `focus_tab` with the `tabId` you want. `open_url` opens a new tab unless you pass `tabId` or `newTab: false`. `close_tab` closes extras.
2. `read_form`. Choose fields and controls from that list only. Do not invent selectors.
3. `snapshot` when you need to see the screen. `scroll` when the control is below the visible screen, then snapshot again.
4. `fill_form` for text. `click` for named buttons. `mouse_click` for a point on the snapshot or a selector. `keyboard` to type or press Enter, Tab, Escape, and arrows.
5. `read_form` again. `history` with `back` when the last page was the right one. Decide the next action from the new list.

A click result has `clicked`, `selector`, `url`, and sometimes `reason`.

- No `reason`, and `ok` is true: the address or the document title changed.
- `reason` is `no_effect`: the press ran, and the address and title stayed. The page can still have changed inside the same address. Read it again before assuming the press failed.
- `reason` is `not_found`: that selector or text is not on the current page. Read again.
- `reason` is `label_drift`: the selector now belongs to different text. Read again and use the new row.
- `reason` is `disabled`: the control is on the page and is not pressable yet. Read the card and do the step that enables it.

On the IRCTC train list, Book Now stays inactive until a class is chosen and an availability cell is chosen. Read the card, click the class, read again, click the availability row, read again, then click Book Now.

## Stop and hand back to the operator

Stop when the page asks for a CAPTCHA, an OTP, or a payment card. Tell the operator what is on screen. Do not solve the CAPTCHA. Do not invent card numbers, UPI ids, or OTPs.

Do not store button presses as form mappings. Mappings are for typed fields. `open_url`, `read_form`, `snapshot`, `fill_form`, `click`, `mouse_click`, and `keyboard` are the page controls.

The extension’s own Fill button uses saved field mappings for the page key. These tools do not. `fill_form` types only the `value` you pass in that call.
