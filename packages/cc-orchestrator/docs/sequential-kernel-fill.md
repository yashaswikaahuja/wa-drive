# sequential-kernel-fill — Sequential Kernel Fill Path

## Purpose
Default (legacy-best) fill path. Four stages:

1. **Inject** — SEQUENTIAL_KERNEL_SCRIPTS into tab
2. **Extract** — form fields + derive profile
3. **Plan** — WSS (30s timeout), HTTPS fallback if WSS down
4. **Execute** — apply WSS mapping + local fuzzyMatch residual in page
5. **Session** — save via WSS, HTTPS fallback

## Public API (`globalThis.CcSequentialKernelFill`)
- `run(ctx)` → `Promise<result>`

## ctx
`{ tabId, profile, backendUrl, accessToken, runtimeVersion, onProgress }`
