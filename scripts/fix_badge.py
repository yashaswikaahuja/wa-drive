c = open('/opt/cybercontrol-hub/extension/background.js').read()

# Fix 1: click-to-identify banner - remove shadow DOM
old1 = """    const _host = document.createElement('div');
    _host.style.cssText = 'position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);pointer-events:none;';
    document.body.appendChild(_host);
    const _sh = _host.attachShadow({ mode: 'open' });
    const _b = document.createElement('div');
    _b.style.cssText = 'background:#7c3aed;color:white;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:bold;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.7);white-space:nowrap;border:2px solid #a855f7;';
    _b.textContent = `⚠ Click the dropdown for ${field.label} to identify it`;
    _sh.appendChild(_b);"""

new1 = """    const _host = document.createElement('div');
    _host.style.cssText = 'position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);pointer-events:none;background:#7c3aed;color:white;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:bold;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.7);white-space:nowrap;border:2px solid #a855f7;';
    _host.textContent = `⚠ Click the dropdown for ${field.label} to identify it`;
    document.body.appendChild(_host);"""

# Fix 2: teaching badge - remove shadow DOM
old2 = """  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;top:0;left:0;';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const badge = document.createElement('div');
  badge.style.cssText = 'background:#dc2626;color:white;padding:5px 10px;border-radius:4px;font-size:12px;font-family:sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
  badge.textContent = '⚠ Click this dropdown to open it';
  shadow.appendChild(badge);"""

new2 = """  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#dc2626;color:white;padding:5px 10px;border-radius:4px;font-size:12px;font-family:sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
  host.textContent = '⚠ Click this dropdown to open it';
  const badge = host;
  document.body.appendChild(host);"""

fixes = [(old1, new1, 'identify banner'), (old2, new2, 'teach badge')]
for old, new, name in fixes:
    if old in c:
        c = c.replace(old, new)
        print(f'{name}: ok')
    else:
        print(f'{name}: NOT FOUND')

# Fix 3: cleanup removes _host correctly (no shadow DOM now)
old3 = "      try { document.body.removeChild(_host); } catch {}\n      sessionStorage.removeItem('_cc_teach_active');"
new3 = "      try { document.body.removeChild(_host); } catch {}\n      sessionStorage.removeItem('_cc_teach_active');"
# already same

open('/opt/cybercontrol-hub/extension/background.js', 'w').write(c)
