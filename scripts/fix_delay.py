c = open('/opt/cybercontrol-hub/extension/autofill/executor.js').read()

old = "      delay += 3000; // wait for DWR/AJAX to load child options"
new = "      delay += 5000; // wait for DWR/AJAX to load child options (ServicePlus needs ~4s)"

if old in c:
    c = c.replace(old, new)
    open('/opt/cybercontrol-hub/extension/autofill/executor.js', 'w').write(c)
    print('ok')
else:
    print('NOT FOUND')
    for i, line in enumerate(c.split('\n')):
        if 'DWR' in line or 'cascade' in line.lower():
            print(i, repr(line))
