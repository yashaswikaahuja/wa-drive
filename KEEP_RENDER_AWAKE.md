# Keep Render Awake

This repo includes a GitHub Actions workflow at `.github/workflows/keep-render-awake.yml` that sends an external request to your backend every 14 minutes.

## Required setup

Add this GitHub repository secret:

- `RENDER_BACKEND_URL`
  - Example: `https://your-backend-name.onrender.com`

The workflow will ping:

```text
https://your-backend-name.onrender.com/api/health
```

## How it works

- Render Free spins down after 15 minutes without inbound traffic.
- The GitHub Actions scheduler runs every 14 minutes.
- Each run sends a GET request to `/api/health`.

## Important note

This is a best-effort keepalive, not a guaranteed uptime feature. Scheduled GitHub Actions can occasionally drift or run late.
