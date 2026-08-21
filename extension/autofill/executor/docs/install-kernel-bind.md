# install-kernel-bind — Kernel Locals Binder

## Purpose
Provides `CcExecParts.bindKernelLocals(k)` — produces a flat alias object mapping kernel properties to the local variable names used by all fill handler files. Centralises the alias contract so each file doesn't need to destructure `k` directly.

## Exports
`root.CcExecParts.bindKernelLocals(k)` — returns ~35 named aliases

## Used by
All `install-fill-one-*.js`, `install-post-fill-*.js` wiring files.
