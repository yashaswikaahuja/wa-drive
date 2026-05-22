c = open('/opt/cybercontrol-hub/extension/autofill/extractor.js').read()

# Safe ID selector helper - inline replacement
safe = "el.id ? (el.id.match(/^\\d/) ? `[id=\"${el.id}\"]` : `#${el.id}`)"

fixes = [
    # pattern 1: standard input selector
    (
        "el.id ? `#${el.id}` : el.name ? `[name=\"${el.name}\"]` : `form-field-${idx}`",
        safe + " : el.name ? `[name=\"${el.name}\"]` : `form-field-${idx}`"
    ),
    # pattern 2: mat-select/mat-radio etc
    (
        "el.id ? `#${el.id}` : `[data-cc-id=\"${id}\"]`",
        safe + " : `[data-cc-id=\"${id}\"]`"
    ),
    # pattern 3: ng-dropdown selector
    (
        "const selector = el.id ? `#${el.id}` : `[name=\"${el.name}\"]`",
        "const selector = " + safe + " : `[name=\"${el.name}\"]`"
    ),
]

for old, new in fixes:
    if old in c:
        c = c.replace(old, new)
        print(f'fixed: {old[:50]}')
    else:
        print(f'NOT FOUND: {old[:50]}')

open('/opt/cybercontrol-hub/extension/autofill/extractor.js', 'w').write(c)
print('done')
