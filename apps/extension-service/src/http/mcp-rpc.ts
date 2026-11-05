/**
 * Stateless MCP JSON-RPC for the signed-in Chrome extension.
 * One POST is one message. Tool calls go through executeBrowserTask.
 */

const SUPPORTED = ['2025-03-26', '2024-11-05'];

const tools = [
  {
    name: 'open_url',
    description: 'Open an http(s) URL in the Chrome where this workspace’s CyberControl extension is signed in. Default is a new tab. Pass tabId or newTab false to load the URL in an already open tab so history back/forward works.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'http or https URL.' },
        tabId: { type: 'number', description: 'Navigate this open tab instead of opening a new one.' },
        newTab: { type: 'boolean', description: 'Default true. Set false to load the URL in the current tab.' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_form',
    description: 'Read input fields and pressable controls on the signed-in Chrome tab. Omit tabId to use the open IRCTC tab, or the active tab when IRCTC is not open. Includes hover figures (type hover), drag handles (type drag), and drop targets (type drop). Duplicate ids in hidden tab panes are omitted; the listed selector is scoped to the visible pane. Selectors expire when the page changes; read again before the next fill or click.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'number', description: 'Chrome tab id. Omit to use the IRCTC tab.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'fill_form',
    description: 'Type into fields from the latest read_form. Each field needs selector and value. For a dropdown whose options are already listed, set type to dropdown, select, ng-dropdown, or mat-select and set value to one option string. For a slider (type slider or range), set value to the number. One browser task at a time per workspace; a second fill or scroll waits for the first. Does not solve CAPTCHA or submit payment.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              selector: { type: 'string' },
              value: { type: 'string' },
              type: { type: 'string' },
              label: { type: 'string' },
              visualLabel: { type: 'string' },
              frameId: { type: 'number', description: 'Frame from read_form. Required for iframe fields.' },
            },
            required: ['selector', 'value'],
          },
        },
      },
      required: ['fields'],
      additionalProperties: false,
    },
  },
  {
    name: 'click',
    description: 'Press a button, visible link, hover figure, or drag handle in the signed-in Chrome by visible text or by a control from read_form. Links have type "link". A link that navigates still returns ok with moved true even if the old page unloads. Hover figures have type "hover" and open captions without a click.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        tabId: { type: 'number' },
        control: {
          type: 'object',
          properties: {
            selector: { type: 'string' },
            label: { type: 'string' },
            visualLabel: { type: 'string' },
            frameId: { type: 'number' },
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_profiles',
    description: 'List customer profiles in this workspace. Returns profile id, customer display name, and only the last four phone digits for disambiguation. Full phone numbers and other profile fields are never returned; use fill with an id to fill a page.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'fill',
    description: 'Run the extension Fill button on the open page for one profile. The extension plans from saved mappings and that profile, then types in Chrome. One browser task at a time per workspace; a second fill or scroll waits for the first. Does not solve CAPTCHA or submit payment.',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string' },
        tabId: { type: 'number' },
      },
      required: ['profileId'],
      additionalProperties: false,
    },
  },
  {
    name: 'snapshot',
    description: 'Screenshot transfer is disabled until trusted redaction and consent enforcement are implemented. This tool currently returns a privacy denial. Omit scope for the visible screen. scope "page" stitches the whole page, capped at six screens. Pass selector (from read_form) or rect {x, y, width, height} in visible-screen CSS pixels to photograph one area. The JPEG may be smaller than the screen: width/height are JPEG pixels, cssWidth/cssHeight are CSS pixels, scaleX/scaleY convert JPEG coordinates to mouse_click CSS pixels (cssX = imageX * scaleX). Does not type or click.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        scope: { type: 'string', enum: ['viewport', 'page'] },
        selector: { type: 'string' },
        rect: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          required: ['width', 'height'],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_tabs',
    description: 'List the open Chrome tabs for this extension: tabId, title, url without the query string, and active. Use a tabId with focus_tab, close_tab, read_form, snapshot, scroll, mouse_click, hover, drag, or keyboard.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'close_tab',
    description: 'Close one open Chrome tab by tabId from list_tabs. Does not close the last remaining tab in a window if Chrome refuses.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'number' } },
      required: ['tabId'],
      additionalProperties: false,
    },
  },
  {
    name: 'focus_tab',
    description: 'Switch to an open tab by tabId and bring its window forward. Call list_tabs first.',
    inputSchema: {
      type: 'object',
      properties: { tabId: { type: 'number' } },
      required: ['tabId'],
      additionalProperties: false,
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the overflowing root (the window or a nested overflow:auto pane). Pass dy for pixels down (negative scrolls up), to "top" or "bottom", or a selector from read_form to bring that control into view. to bottom retries while lazy content grows. Returns scroll position, scrollRoot, and moved.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        dy: { type: 'number' },
        dx: { type: 'number' },
        to: { type: 'string', enum: ['top', 'bottom'] },
        selector: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'history',
    description: 'Move in the tab history. action is back, forward, or reload. Then read_form or snapshot again.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['back', 'forward', 'reload'] },
        tabId: { type: 'number' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'mouse_click',
    description: 'Click, hover, or drag the GUI. Pass x and y in visible-screen CSS pixels (the same space as a snapshot rect), or a selector from read_form. action hover moves the mouse without clicking so hover menus and captions can open. action drag also needs x2,y2 or toSelector. button is left, right, or middle. count 2 is a double-click. If hover or drag is not in your tool list, use this tool with action hover or drag. After a snapshot, click the thing you see. Then read_form or snapshot again.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        x: { type: 'number', description: 'Visible-screen CSS pixel X.' },
        y: { type: 'number', description: 'Visible-screen CSS pixel Y.' },
        x2: { type: 'number', description: 'Drag end CSS pixel X.' },
        y2: { type: 'number', description: 'Drag end CSS pixel Y.' },
        selector: { type: 'string', description: 'Control from read_form. Clicks its center.' },
        toSelector: { type: 'string', description: 'Drag end control from read_form.' },
        frameId: { type: 'number', description: 'Frame from read_form for iframe fields.' },
        button: { type: 'string', enum: ['left', 'right', 'middle'] },
        count: { type: 'number', description: '1 for a single click, 2 for a double-click.' },
        action: { type: 'string', enum: ['click', 'hover', 'drag'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'hover',
    description: 'Move the mouse over a point or a control from read_form so hover menus can open. Then read_form or snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        x: { type: 'number', description: 'Visible-screen CSS pixel X.' },
        y: { type: 'number', description: 'Visible-screen CSS pixel Y.' },
        selector: { type: 'string', description: 'Control from read_form.' },
        frameId: { type: 'number', description: 'Frame from read_form for iframe fields.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'drag',
    description: 'Drag from one point or selector to another. Pass x,y and x2,y2 in visible-screen CSS pixels, or selector and toSelector. Fires HTML5 dragstart/drop with dataTransfer so native draggable columns swap. Use this for sliders, jQuery handles, and HTML5 drop targets. Then read_form or snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        x: { type: 'number', description: 'Start CSS pixel X.' },
        y: { type: 'number', description: 'Start CSS pixel Y.' },
        x2: { type: 'number', description: 'End CSS pixel X.' },
        y2: { type: 'number', description: 'End CSS pixel Y.' },
        selector: { type: 'string', description: 'Start control from read_form.' },
        toSelector: { type: 'string', description: 'End control from read_form.' },
        frameId: { type: 'number', description: 'Frame from read_form for iframe fields.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'keyboard',
    description: 'Type on the keyboard in the focused control, or press a key. Pass text to type, key for one named key (Enter, Tab, Escape, Backspace, Delete, Space, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, End, PageUp, PageDown), or keys for a short sequence. selector focuses that control first. Arrow keys on a slider (input type range) move its value. ctrl, alt, shift, meta are modifiers. Does not type into password, CAPTCHA, or OTP boxes.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        selector: { type: 'string' },
        frameId: { type: 'number', description: 'Frame from read_form for iframe fields.' },
        text: { type: 'string' },
        key: { type: 'string' },
        keys: { type: 'array', items: { type: 'string' } },
        ctrl: { type: 'boolean' },
        alt: { type: 'boolean' },
        shift: { type: 'boolean' },
        meta: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
];

function rpcResult(id: any, result: any) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: any, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function toolText(payload: any, isError: boolean) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

export async function respondToMcp(message: any, workspaceId: string, run: (workspaceId: string, body: any) => Promise<{ status: number, payload: any }>, profiles?: { listProfiles?: (workspaceId: string) => Promise<any> }) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { kind: 'json' as const, status: 200, body: rpcError(null, -32600, 'invalid request') };
  }
  const id = message.id;
  const method = message.method;
  const hasId = id !== undefined && id !== null;
  if (!method || typeof method !== 'string') {
    return { kind: 'json' as const, status: 200, body: rpcError(hasId ? id : null, -32600, 'invalid request') };
  }
  if (!hasId || method.indexOf('notifications/') === 0) {
    return { kind: 'accept' as const };
  }

  if (method === 'initialize') {
    const requested = message.params && message.params.protocolVersion;
    const protocolVersion = SUPPORTED.indexOf(requested) >= 0 ? requested : SUPPORTED[0];
    return {
      kind: 'json' as const,
      status: 200,
      body: rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'cybercontrol-browser', version: '1.0.0' },
        instructions: [
          'You control the operator Chrome where the CyberControl extension for this workspace is signed in. You do not have a separate cloud browser.',
          'Call one tool at a time: open_url, then read_form, then fill_form for typed fields or click for buttons. After every click or navigation, read_form again and use only selectors from that latest read.',
          'A click with reason no_effect still ran; the address did not change. Read the page again before repeating it. not_found and label_drift mean the selector is stale.',
          'If the tool returns no_extension_connected, ask the operator to open Chrome with the CyberControl extension signed in.',
          'Stop at CAPTCHA, OTP, and payment. Do not solve a CAPTCHA and do not invent card numbers, UPI ids, or OTPs. Tell the operator what is on screen.',
          'On an IRCTC train list, Book Now stays inactive until a class and an availability cell have been clicked. Read between those clicks.',
          'Dropdowns: if read_form includes options, fill_form with that type and value equal to one option. If options is null, click the dropdown, read_form, then click the choice. Read again before a dependent dropdown such as District after State.',
          'list_profiles returns profile id, customer display name, and only the last four phone digits for disambiguation. It never returns the full phone number or other profile fields. Direct profile-field reading is disabled. Use fill with a profileId to run the operator-approved local fill workflow.',
          'snapshot image transfer is currently disabled by the privacy boundary. Do not try alternate screenshot routes or request raw page images.',
          'list_tabs shows the open tabs. focus_tab switches to a tabId. close_tab closes a tabId. open_url with tabId or newTab false loads the URL in that tab so history back/forward works. scroll moves the overflowing root by dy pixels, to top or bottom, or onto a selector; it never uses a left nav, and to bottom stays on the window so infinite pages can grow. history goes back, forward, or reloads. mouse_click presses at visible-screen CSS x,y (imageX * scaleX after a snapshot) or at a selector. action hover or drag on mouse_click works even when hover and drag are missing from the tool list. hover moves the mouse over a point or selector. drag moves from x,y to x2,y2 or from selector to toSelector and fires HTML5 dragstart/drop. click also finds visible links by text; a link that navigates is success (moved true) even if the old frame is gone. keyboard types text or presses Enter, Tab, Escape, arrows, and the other named keys; pass selector to focus first; arrows move a range slider. read_form includes iframe fields with frameId, hover figures (type hover), drag handles (type drag), and drop targets (type drop); duplicate ids in hidden tab panes are omitted. One browser task at a time per workspace, including fill and scroll. copy frameId on fill_form, click, keyboard, mouse_click, hover, and drag. After any of those, read_form or snapshot before the next click or fill.',
        ].join(' '),
      }),
    };
  }
  if (method === 'ping') {
    return { kind: 'json' as const, status: 200, body: rpcResult(id, {}) };
  }
  if (method === 'tools/list') {
    return { kind: 'json' as const, status: 200, body: rpcResult(id, { tools }) };
  }
  if (method === 'tools/call') {
    const params = message.params || {};
    const name = params.name;
    const args = params.arguments || {};
    if (name === 'open_url') {
      if (!args.url) return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText({ error: 'url required' }, true)) };
      const tabId = Number(args.tabId) || 0;
      const out = await run(workspaceId, {
        task: 'open_url',
        url: args.url,
        tabId: tabId || null,
        newTab: args.newTab === false || tabId ? false : true,
      });
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText(out.payload, out.status >= 400)) };
    }
    if (name === 'read_form') {
      const out = await run(workspaceId, { task: 'read_form', tabId: args.tabId || null });
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText(out.payload, out.status >= 400)) };
    }
    if (name === 'fill_form') {
      const out = await run(workspaceId, { task: 'fill_form', tabId: args.tabId || null, fields: args.fields });
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText(out.payload, out.status >= 400)) };
    }
    if (name === 'click') {
      const out = await run(workspaceId, { task: 'click', text: args.text || '', control: args.control || null, tabId: args.tabId || null });
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText(out.payload, out.status >= 400)) };
    }
    if (name === 'list_profiles') {
      if (!profiles || !profiles.listProfiles) return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText({ error: 'profiles_unavailable' }, true)) };
      const rows = await profiles.listProfiles(workspaceId);
      const safeProfiles = (Array.isArray(rows) ? rows : []).map((row: any) => ({
        id: String(row?.id || ''),
        displayLabel: String(row?.displayLabel || row?.name || 'Customer'),
        phoneLast4: row?.phoneLast4 == null || !/^\\d{4}$/.test(String(row.phoneLast4))
          ? null
          : String(row.phoneLast4),
      })).filter((row: any) => row.id);
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText({ profiles: safeProfiles }, false)) };
    }
    if (name === 'fill') {
      if (!args.profileId) return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText({ error: 'profileId required' }, true)) };
      const out = await run(workspaceId, { task: 'fill', profileId: String(args.profileId), tabId: args.tabId || null });
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText(out.payload, out.status >= 400)) };
    }
    if (name === 'snapshot') {
      // Fail closed at the MCP egress boundary. No screenshot task is executed,
      // so raw image bytes cannot be returned to an MCP client.
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText({
        error: 'privacy_boundary_blocked',
        message: 'Screenshot transfer is disabled until trusted redaction and verifiable consent are enforced before egress.',
      }, true)) };
    }
    if (name === 'list_tabs') {
      const out = await run(workspaceId, { task: 'list_tabs' });
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText(out.payload, out.status >= 400)) };
    }
    if (name === 'close_tab') {
      const tabId = Number(args.tabId);
      if (!tabId) return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText({ error: 'tabId required' }, true)) };
      const out = await run(workspaceId, { task: 'close_tab', tabId });
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText(out.payload, out.status >= 400)) };
    }
    if (name === 'focus_tab') {
      const tabId = Number(args.tabId);
      if (!tabId) return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText({ error: 'tabId required' }, true)) };
      const out = await run(workspaceId, { task: 'focus_tab', tabId });
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText(out.payload, out.status >= 400)) };
    }
    if (name === 'scroll') {
      const out = await run(workspaceId, {
        task: 'scroll',
        tabId: args.tabId || null,
        dy: Number(args.dy) || 0,
        dx: Number(args.dx) || 0,
        to: args.to === 'top' || args.to === 'bottom' ? args.to : '',
        selector: args.selector || '',
      });
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText(out.payload, out.status >= 400)) };
    }
    if (name === 'history') {
      const action = args.action === 'back' || args.action === 'forward' || args.action === 'reload' ? args.action : '';
      if (!action) return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText({ error: 'action required' }, true)) };
      const out = await run(workspaceId, { task: 'history', action, tabId: args.tabId || null });
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText(out.payload, out.status >= 400)) };
    }
    if (name === 'mouse_click' || name === 'hover' || name === 'drag') {
      const selector = args.selector ? String(args.selector) : '';
      const hasPoint = Number.isFinite(Number(args.x)) && Number.isFinite(Number(args.y));
      if (!selector && !hasPoint) return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText({ error: 'x and y, or selector, required' }, true)) };
      const toSelector = args.toSelector ? String(args.toSelector) : '';
      const hasEnd = Number.isFinite(Number(args.x2)) && Number.isFinite(Number(args.y2));
      const action = name === 'hover' || (name === 'mouse_click' && args.action === 'hover')
        ? 'hover'
        : (name === 'drag' || (name === 'mouse_click' && args.action === 'drag') ? 'drag' : 'click');
      if (action === 'drag' && !toSelector && !hasEnd) {
        return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText({ error: 'x2 and y2, or toSelector, required' }, true)) };
      }
      const out = await run(workspaceId, {
        task: action === 'click' ? 'mouse_click' : action,
        tabId: args.tabId || null,
        x: hasPoint ? Number(args.x) : null,
        y: hasPoint ? Number(args.y) : null,
        x2: hasEnd ? Number(args.x2) : null,
        y2: hasEnd ? Number(args.y2) : null,
        selector,
        toSelector,
        frameId: Number(args.frameId) || null,
        button: args.button === 'right' || args.button === 'middle' ? args.button : 'left',
        count: Number(args.count) === 2 ? 2 : 1,
        action,
      });
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText(out.payload, out.status >= 400)) };
    }
    if (name === 'keyboard') {
      const text = args.text ? String(args.text) : '';
      const key = args.key ? String(args.key) : '';
      const keys = Array.isArray(args.keys) ? args.keys : [];
      if (!text && !key && !keys.length) return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText({ error: 'text, key, or keys required' }, true)) };
      const out = await run(workspaceId, {
        task: 'keyboard',
        tabId: args.tabId || null,
        selector: args.selector || '',
        frameId: Number(args.frameId) || null,
        text,
        key,
        keys,
        ctrl: !!args.ctrl,
        alt: !!args.alt,
        shift: !!args.shift,
        meta: !!args.meta,
      });
      return { kind: 'json' as const, status: 200, body: rpcResult(id, toolText(out.payload, out.status >= 400)) };
    }
    return { kind: 'json' as const, status: 200, body: rpcError(id, -32602, 'unknown tool') };
  }
  return { kind: 'json' as const, status: 200, body: rpcError(id, -32601, 'Method not found') };
}
