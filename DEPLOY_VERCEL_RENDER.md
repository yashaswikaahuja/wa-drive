# Deploy Frontend On Vercel And Backend On Render

## 1. Deploy the backend on Render

- Create a new **Web Service**
- Connect this repository
- Set **Root Directory** to `backend`
- Build command:

```text
npm install && npm run build
```

- Start command:

```text
npm start
```

- Health check path:

```text
/api/health
```

- Add environment variable:

```text
CORS_ORIGINS=https://your-frontend-project.vercel.app
```

After deploy, Render will give you a URL like:

```text
https://your-render-backend.onrender.com
```

## 2. Keep the free Render backend awake

This repo includes `.github/workflows/keep-render-awake.yml`.

Add this GitHub repository secret:

```text
RENDER_BACKEND_URL=https://your-render-backend.onrender.com
```

That workflow pings:

```text
https://your-render-backend.onrender.com/api/health
```

every 14 minutes.

## 3. Deploy the frontend on Vercel

- Create a new Vercel project
- Set **Root Directory** to `frontend`
- Build command:

```text
npm run build
```

- Output directory:

```text
dist
```

- Add these Vercel environment variables:

```text
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
VITE_API_URL=https://your-render-backend.onrender.com/api
VITE_SOCKET_URL=https://your-render-backend.onrender.com
```

## 4. Update Google OAuth

In Google Cloud Console, add your Vercel frontend domain to:

- Authorized JavaScript origins

Example:

```text
https://your-frontend-project.vercel.app
```

## 5. Final URL mapping

- Frontend:

```text
https://your-frontend-project.vercel.app
```

- Backend:

```text
https://your-render-backend.onrender.com
```

- Frontend env:

```text
VITE_API_URL=https://your-render-backend.onrender.com/api
VITE_SOCKET_URL=https://your-render-backend.onrender.com
```
