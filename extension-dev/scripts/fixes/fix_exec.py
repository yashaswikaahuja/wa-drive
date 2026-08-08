c = open('/opt/cybercontrol-hub/extension/autofill/executor.js').read()

old = "          setTimeout(() => .trigger('keyup'), 100);"
new = "          setTimeout(() => $(el).trigger('keyup'), 100);"

if old in c:
    c = c.replace(old, new)
    open('/opt/cybercontrol-hub/extension/autofill/executor.js', 'w').write(c)
    print('ok')
else:
    print('NOT FOUND')
    # show context
    for i, line in enumerate(c.split('\n')):
        if 'trigger' in line:
            print(i, repr(line))
