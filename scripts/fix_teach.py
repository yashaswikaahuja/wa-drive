c = open('/opt/cybercontrol-hub/extension/background.js').read()

# Fix: skip native <select> from teaching — executor handles them directly
old = """  const TEACHABLE_TYPES = ['ng-dropdown', 'mat-select', 'select', 'mat-radio'];
  const teachable = fields.filter(f => TEACHABLE_TYPES.includes(f.type));"""

new = """  // Native <select> and radio are handled by executor directly — only teach custom dropdowns
  const TEACHABLE_TYPES = ['ng-dropdown', 'mat-select', 'mat-radio'];
  const teachable = fields.filter(f => TEACHABLE_TYPES.includes(f.type));"""

if old in c:
    c = c.replace(old, new)
    print('fix ok')
else:
    print('NOT FOUND')
    for i, line in enumerate(c.split('\n')):
        if 'TEACHABLE_TYPES' in line:
            print(i, repr(line))

open('/opt/cybercontrol-hub/extension/background.js', 'w').write(c)
