# Deployment

## Render

Deploy the FastAPI backend from the repository root using `render.yaml`.

The included blueprint uses Render's `starter` plan because this app stores Chroma data on a persistent disk, and Render's free web services do not support persistent disks.

Set these environment variables in Render:

- `GOOGLE_API_KEY`
- `TAVILY_API_KEY`
- `CORS_ORIGINS` set to your Vercel frontend URL, for example `https://your-app.vercel.app`

The service stores Chroma data at `/var/data/chroma_db` using the attached persistent disk.

If you want the lowest-cost test deploy instead, you can switch to a free web service and remove the disk, but uploaded files and embeddings will be lost whenever the service restarts, redeploys, or spins down.

## Vercel

Deploy the frontend as a Vite app from the repository root using `vercel.json`.

Set this environment variable in Vercel:

- `VITE_API_BASE_URL` set to your Render backend URL, for example `https://your-api.onrender.com`

After Vercel gives you the frontend URL, add that URL to Render's `CORS_ORIGINS`.
