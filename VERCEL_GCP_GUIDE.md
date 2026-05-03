# Vercel & GCP Operations Guide

## Table of Contents
1. [Vercel Setup & Operations](#vercel)
2. [GCP Setup & Operations](#gcp)
3. [Common Issues & Fixes](#common-issues)

---

## Vercel Operations

### Prerequisites
- Node.js installed
- `npx` available (comes with Node.js)
- Vercel CLI: `npm install -g vercel` (optional, but recommended)
- Logged in to Vercel: `npx vercel login`

### Basic Commands

#### 1. **Login to Vercel**
```powershell
npx vercel login
```
Authenticates your account for deployment.

#### 2. **Link Project to Vercel**
```powershell
cd path\to\your\project
npx vercel link
```
Links your local project to a Vercel project.

#### 3. **Set Environment Variables**

**Add a new environment variable:**
```powershell
npx vercel env add KEY_NAME value
```

**Example:**
```powershell
npx vercel env add VITE_API_URL production https://trained-extremely-courts-mod.trycloudflare.com/api
npx vercel env add VITE_SOCKET_URL production https://trained-extremely-courts-mod.trycloudflare.com
```

**Remove an environment variable:**
```powershell
npx vercel env rm KEY_NAME production --yes
```

**List all environment variables:**
```powershell
npx vercel env ls
```

**For different environments (production, preview, development):**
```powershell
# Production
npx vercel env add MY_VAR value production

# Preview
npx vercel env add MY_VAR value preview

# Development
npx vercel env add MY_VAR value development
```

#### 4. **Deploy**

**Deploy to production:**
```powershell
npx vercel --prod --yes
```

**Deploy to preview (staging):**
```powershell
npx vercel --yes
```

**Specific directory:**
```powershell
cd E:\yashu\wa\frontend
npx vercel --prod --yes
```

#### 5. **Pull Environment Variables from Vercel**
```powershell
npx vercel env pull
```
Downloads `.env.local` file with production variables.

#### 6. **View Deployments**
```powershell
npx vercel ls
```

#### 7. **View Project Settings**
```powershell
npx vercel project ls
```

---

## Complete Deployment Workflow

### Step-by-Step Process

```powershell
# 1. Navigate to frontend directory
cd E:\yashu\wa\frontend

# 2. Remove old environment variables (if needed)
npx vercel env rm VITE_API_URL production --yes
npx vercel env rm VITE_SOCKET_URL production --yes

# 3. Add new environment variables
npx vercel env add VITE_API_URL production https://trained-extremely-courts-mod.trycloudflare.com/api
npx vercel env add VITE_SOCKET_URL production https://trained-extremely-courts-mod.trycloudflare.com

# 4. Verify environment variables
npx vercel env ls

# 5. Deploy to production
npx vercel --prod --yes
```

### Expected Output
```
✓ Linked to yashaswikaahuja/wa-drive (created .vercel)
✓ Environment variables created successfully
✓ Deployment created
✓ Vercel deployment complete
```

---

## GCP Operations

### Prerequisites
- Google Cloud account
- GCP CLI installed: `gcloud init`
- Authenticated: `gcloud auth login`
- Project set: `gcloud config set project PROJECT_ID`

### Basic Commands

#### 1. **Login to GCP**
```powershell
gcloud auth login
```

#### 2. **Set Active Project**
```powershell
gcloud config set project my-project-id
```

#### 3. **List Projects**
```powershell
gcloud projects list
```

#### 4. **Deploy to Cloud Run**

**Deploy from source code:**
```powershell
gcloud run deploy SERVICE_NAME `
  --source . `
  --platform managed `
  --region us-central1
```

**Example:**
```powershell
gcloud run deploy wa-drive-backend `
  --source . `
  --platform managed `
  --region us-central1 `
  --allow-unauthenticated
```

#### 5. **Set Environment Variables in Cloud Run**

**Deploy with environment variables:**
```powershell
gcloud run deploy SERVICE_NAME `
  --set-env-vars KEY1=value1,KEY2=value2 `
  --platform managed `
  --region us-central1
```

**Update existing service with new env vars:**
```powershell
gcloud run services update SERVICE_NAME `
  --set-env-vars WHATSAPP_API_URL=https://api.example.com `
  --region us-central1
```

**Remove an environment variable:**
```powershell
gcloud run services update SERVICE_NAME `
  --remove-env-vars KEY_NAME `
  --region us-central1
```

#### 6. **View Service Details**
```powershell
gcloud run services describe SERVICE_NAME --region us-central1
```

#### 7. **View Service Logs**
```powershell
gcloud run services logs read SERVICE_NAME --limit 50
```

#### 8. **Deploy to Cloud Functions**

**Deploy a function:**
```powershell
gcloud functions deploy FUNCTION_NAME `
  --runtime nodejs18 `
  --trigger-http `
  --allow-unauthenticated
```

#### 9. **Create Service Account**
```powershell
gcloud iam service-accounts create my-service-account
```

#### 10. **List Service Accounts**
```powershell
gcloud iam service-accounts list
```

---

## PowerShell-Specific Tips

### Important Syntax Notes

❌ **WRONG:**
```powershell
'https://example.com' | npx vercel env add MY_VAR
vercel deploy --prod
npx vercel env add MY_VAR | value
```

✅ **CORRECT:**
```powershell
npx vercel env add MY_VAR https://example.com
npx vercel --prod --yes
npx vercel env add MY_VAR value
```

### Multiline Commands in PowerShell

Use backtick (`) for line continuation:

```powershell
gcloud run deploy SERVICE_NAME `
  --set-env-vars KEY=value `
  --platform managed `
  --region us-central1
```

Or use semicolons to chain commands:

```powershell
cd project; npx vercel env add KEY value; npx vercel --prod --yes
```

---

## Common Issues & Fixes

### Vercel Issues

#### Issue: "vercel: The term 'vercel' is not recognized"
**Solution:** Use `npx vercel` instead of just `vercel`

#### Issue: "Environment Variable was not found"
**Solution:** Check the environment name (production/preview/development)
```powershell
npx vercel env rm KEY_NAME production --yes
```

#### Issue: "Authentication failed"
**Solution:** Re-login to Vercel
```powershell
npx vercel logout
npx vercel login
```

#### Issue: Wrong branch being deployed
**Solution:** Check which git branch is active
```powershell
git branch
git checkout main  # or master
npx vercel --prod --yes
```

### GCP Issues

#### Issue: "Project not set"
**Solution:** Set your GCP project
```powershell
gcloud config set project YOUR_PROJECT_ID
```

#### Issue: "Permission denied"
**Solution:** Authenticate with Google
```powershell
gcloud auth login
```

#### Issue: "Service not found"
**Solution:** Check region and list services
```powershell
gcloud run services list --region us-central1
```

---

## Quick Reference

### Vercel Commands Summary
| Command | Purpose |
|---------|---------|
| `npx vercel login` | Authenticate with Vercel |
| `npx vercel link` | Link project to Vercel |
| `npx vercel env add KEY value` | Add environment variable |
| `npx vercel env rm KEY --yes` | Remove environment variable |
| `npx vercel env ls` | List all variables |
| `npx vercel --prod --yes` | Deploy to production |
| `npx vercel env pull` | Pull env vars locally |

### GCP Commands Summary
| Command | Purpose |
|---------|---------|
| `gcloud auth login` | Authenticate with GCP |
| `gcloud config set project ID` | Set active project |
| `gcloud run deploy SERVICE` | Deploy to Cloud Run |
| `gcloud run services describe SERVICE` | View service details |
| `gcloud run services logs read SERVICE` | View service logs |
| `gcloud run services update SERVICE` | Update service config |

---

## Best Practices

1. **Always use `--yes` flag** for CI/CD automation
2. **Use environment variables** for sensitive data (API keys, URLs)
3. **Test in preview first** before deploying to production
4. **Keep `.env` files out of git** (use `.env.local` or `.env.example`)
5. **Document all environment variables** needed by the application
6. **Use separate service accounts** for different services in GCP
7. **Enable logging** for debugging issues
8. **Use appropriate regions** for latency optimization

---

## Additional Resources

- Vercel Docs: https://vercel.com/docs
- GCP Docs: https://cloud.google.com/docs
- Cloud Run Guide: https://cloud.google.com/run/docs
- gcloud CLI Reference: https://cloud.google.com/sdk/gcloud
