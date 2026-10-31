# Runbook: Informed News on the Hostinger VPS

Plain-language steps for running Informed News in Docker on the VPS and reaching it over Tailscale. The checks in "Public-access checks" are Phil's to run; this document does not claim they have passed.

## Repo

- Path: `/opt/informed-news`, branch `main`, owner `deploy`.
- One-time clone if the directory is missing:

```bash
git clone https://github.com/philga7/informed-news.git /opt/informed-news
```

## Env file

- Path: `/opt/informed-news/.env`, owner `deploy:deploy`, mode `600`.
- Create it by copying `mvp/.env.example` to `/opt/informed-news/.env`, set owner `deploy:deploy` and mode `600`, then edit the placeholders. Do not paste a real password into any doc.
- Compose interpolates `$` in env values. A bcrypt `MVP_PASSWORD_HASH` must be single-quoted, or each `$` written as `$$`, or login breaks.
- The key list lives in `mvp/.env.example`. Required: a password (`MVP_PASSWORD` or `MVP_PASSWORD_HASH`) and `SESSION_SECRET`. Everything else is optional.
- On the VPS set `SEARXNG_URL=http://searxng:8080`.
- Nanobot's env file and Compose project stay separate from this one. Informed News uses the Compose project `informed-news` and only joins the external network `nanobot-mem0`.

## Start, logs, stop

From `/opt/informed-news`:

```bash
docker compose up -d --build
docker compose logs
docker compose down
```

The image defaults to `informed-news:local`. CI uses `informed-news:ci`. The port is published on `127.0.0.1` only.

## Health check

```bash
curl -fsS http://127.0.0.1:3001/healthz
```

## Tailscale

Tailscale serves the app on one MagicDNS HTTPS URL. First run `tailscale serve status`. If something else already handles https on 443, stop and leave it. The script may need root, or a user allowed by `tailscale set --operator=deploy`. Then run:

```bash
scripts/tailscale-serve.sh
```

Running it twice is safe. No Tailscale auth key goes in the app env file.

## Laptop

Create the shared network once, then use the same compose command with an env file. There is no override file.

```bash
docker network create nanobot-mem0
INFORMED_NEWS_ENV_FILE=./mvp/.env docker compose up -d --build
```

## Healthy Brief

With `SEARXNG_URL` set, one topic refresh shows SearXNG results in the Brief. To start that refresh, sign in on Topics, then press Refresh on the Brief. If `REFRESH_INTERVAL_HOURS` is not `off`, startup catch-up also refreshes.

## Public-access checks (Phil)

- `ss -ltnp` shows port 3001 on `127.0.0.1` only.
- A request to the VPS public IP on port 3001 fails.
- Anyone on the private network can read the Brief at the tailnet URL; the public internet cannot. Refresh, Topics, Filtered out, and other changes still ask for the password.
- Laptop and phone checks are Phil's.

## Out of scope

Off-box backups and key rotation.
