# extension-dev scripts

Bundle rebuilds live with the extension app:

```bash
pnpm --filter cybercontrol-extension build
# or
pnpm build:bundles
```

Sources: `apps/extension/scripts/build-*-bundle.mjs`.

Do not add duplicate concat/build wrappers here.
