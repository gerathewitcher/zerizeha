# Deployment (Docker + Caddy + GitHub Actions)

## Server prerequisites
- Ubuntu server with Docker Engine and Docker Compose v2.
- DNS A records:
  - `zzeha.ru` -> server IP
  - `api.zzeha.ru` -> server IP

## Prepare the server
```bash
sudo mkdir -p /srv/zerizeha
sudo chown -R $USER:$USER /srv/zerizeha
```

Clone the repo once:
```bash
git clone https://github.com/gerathewitcher/zerizeha /srv/zerizeha
```

Create the production env file:
```bash
cp /srv/zerizeha/deploy/.env.prod.example /srv/zerizeha/.env.prod
```

Fill in real values in `/srv/zerizeha/.env.prod`:
- OAuth client IDs/secrets
- `JWT_SECRET`
- `POSTGRES_PASSWORD`
- `ADMIN_EMAILS`
- `CADDY_EMAIL` (for Let's Encrypt)

Expected callbacks in OAuth providers:
- `https://api.zzeha.ru/api/auth/google/callback`
- `https://api.zzeha.ru/api/auth/github/callback`
- `https://api.zzeha.ru/api/auth/yandex/callback`

## Firewall notes for Janus + TURN
- Janus uses UDP media ports (default `10000-10200/udp`).
- TURN (coturn) uses `3478/udp` and a relay range (default `49160-49200/udp` in `docker-compose.prod.yml`).
Make sure the server firewall allows these ranges, or adjust them to your policy.

## One-time manual start (optional)
```bash
cd /srv/zerizeha
docker compose --env-file .env.prod -f docker-compose.prod.yml build
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d postgres redis janus
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm migrate
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

## GitHub Actions (CI/CD)
Create GitHub secrets:
- `SSH_HOST` (server IP or hostname)
- `SSH_USER`
- `SSH_KEY` (private key contents)
- `DEPLOY_PATH` (optional, default `/srv/zerizeha`)

On each push to `main`, the workflow runs:
- `git fetch` + `git reset --hard origin/main`
- `docker compose build`
- `docker compose up -d`
- `docker compose run --rm migrate`

## Notes
- The backend loads `.env` if present, but it is optional in production. All required env vars come from `.env.prod`.
- `CORS_ALLOWED_ORIGINS` is optional. If unset, it allows `FRONTEND_BASE` plus `http://localhost:3000`.
- The backend Docker image uses `golang:tip` to satisfy `go 1.25.1` in `backend/go.mod`. If you want a stable toolchain, set `go` in `backend/go.mod` to a stable version and switch the base image.
