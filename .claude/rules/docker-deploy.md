---
paths:
  - 'Dockerfile'
  - '.github/workflows/deploy.yml'
---

# Docker & Deployment Rules

## Dockerfile

- Multi-stage build: builder (compile TS) + production (minimal image)
- Non-root user `corvid:1001` for security
- Node option `--max-old-space-size=768` required for TF.js NSFW model
- Health check: `wget` to `/health` every 30s

## Deployment

- Push to `master` triggers `deploy.yml`
- Builds multi-arch Docker image -> GitHub Container Registry
- Azure Container Apps pulls and deploys automatically
- Health probe: `GET /health`

## NEVER

- Remove the non-root user from Dockerfile
- Increase memory beyond 768MB without discussion
- Change the health check endpoint path
