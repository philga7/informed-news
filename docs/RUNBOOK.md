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
- A QA instance uses a different env file. See [QA instance](#qa-instance).

## Start, logs, stop

From `/opt/informed-news`:

```bash
docker compose up -d --build
docker compose logs
docker compose down
```

The image defaults to `informed-news:local`. CI uses `informed-news:ci`. The port is published on `127.0.0.1` only. The Compose service is named `app`.

## Update

The checkout may be a single-branch clone. Fetch `main` into the local `main` ref before checking it out.

```bash
git fetch origin main:main
git checkout main
git pull --ff-only origin main
docker compose up -d --build
```

## Health check

```bash
curl -fsS http://127.0.0.1:3001/healthz
```

## Tailscale

Tailscale Serve is on. It is tailnet only and proxies to the app on this machine. No Tailscale auth key goes in the app env file.

A laptop or phone opens the Brief only when Tailscale is installed on that device.

If Serve is off, check `tailscale serve status` first. If something else already handles https on 443, stop and leave it. The script may need root, or a user allowed by `tailscale set --operator=deploy`. Then run:

```bash
scripts/tailscale-serve.sh
```

Running it twice is safe.

## SSH tunnel

If Tailscale is not installed on the device, an SSH tunnel reaches the same loopback port. Placeholders only:

```bash
ssh -i <key> -N -L 3001:127.0.0.1:3001 <user>@<vps>
```

Then open `http://localhost:3001`.

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
- Laptop and phone checks need Tailscale installed on each device. They are Phil's to run.

## QA instance

A second Compose project of the same image, for QA walks. It is not a second password on the live instance. The live container, the live volume `informed-news-data`, and `127.0.0.1:3001` stay as they are. This section is the procedure. It does not mean the QA instance has been started.

The QA store starts empty. Do not copy the live volume or any file out of `informed-news-data`.

### Env file

- Path: `/opt/informed-news/qa.env`, owner `deploy:deploy`, mode `600`.
- Create it by copying `mvp/.env.example`. Do not copy `/opt/informed-news/.env`.
- Set owner and mode before editing:

```bash
touch /opt/informed-news/qa.env
chown deploy:deploy /opt/informed-news/qa.env
chmod 600 /opt/informed-news/qa.env
```

- Compose interpolates `$` in env values. A bcrypt `MVP_PASSWORD_HASH` must be single-quoted, or each `$` written as `$$`, or login breaks. Generate the hash the same way `mvp/.env.example` describes, on the VPS. Put only the hash in this file. The password itself does not go in the repo, a pull request, a ticket, or a log.
- Do not set `INFORMED_NEWS_DATA_VOLUME` to `informed-news-data`. That name is the live volume.

Placeholders only:

```bash
COMPOSE_PROJECT_NAME=informed-news-qa
INFORMED_NEWS_ENV_FILE=/opt/informed-news/qa.env
INFORMED_NEWS_DATA_VOLUME=informed-news-qa-data
INFORMED_NEWS_PORT=3002
INFORMED_NEWS_IMAGE=informed-news:qa
SESSION_COOKIE_NAME=mvp_qa_session
REFRESH_INTERVAL_HOURS=off
MVP_PASSWORD_HASH='<bcrypt hash>'
SESSION_SECRET=<long random string>
OLLAMA_API_KEY=
TYPESAFE_API_KEY=
```

`SESSION_COOKIE_NAME` must be `mvp_qa_session` (or another name that is not `mvp_session`). Browsers ignore the port on the same hostname, so a shared cookie name would replace the live login. Unset, the app still uses `mvp_session`.

`INFORMED_NEWS_ENV_FILE` must point at the QA file. If it is left unset, Compose loads `/opt/informed-news/.env` into the QA container.

### Project, volume, and port

From `/opt/informed-news`. The prefixes win over a shell export, so this command cannot pick up the live env file, volume, port, or image tag from the shell:

```bash
COMPOSE_PROJECT_NAME=informed-news-qa \
INFORMED_NEWS_ENV_FILE=/opt/informed-news/qa.env \
INFORMED_NEWS_DATA_VOLUME=informed-news-qa-data \
INFORMED_NEWS_PORT=3002 \
INFORMED_NEWS_IMAGE=informed-news:qa \
docker compose --env-file /opt/informed-news/qa.env -p informed-news-qa up -d --build
```

- Project name: `informed-news-qa`. A second project does not mount `informed-news-data`. With no volume override, project `informed-news-qa` uses volume `informed-news-qa-data`. The prefix sets that name anyway.
- That volume split needs Compose to set `COMPOSE_PROJECT_NAME` from `-p` (or the top-level `name`) before it interpolates the file. Checked with Docker Compose v2.40.3. Before the first QA start, run `docker compose -p informed-news-qa config` and confirm the volume name is `informed-news-qa-data`. If it is still `informed-news-data`, stop. That Compose build would mount the live volume.
- Host port: `127.0.0.1:3002`, forwarded to port 3001 inside the container. The live publish stays `127.0.0.1:3001`.
- Same `compose.yaml` and Dockerfile. There is no second compose file. The QA image tag is `informed-news:qa`. A QA build must not retag `informed-news:local`, which is what the live project uses. The running live container keeps its current image, and the next live `docker compose up` does not pick up a QA build.

Health check, on the VPS:

```bash
curl -fsS http://127.0.0.1:3002/healthz
```

A ready QA process returns 200. This document does not claim that curl has been run.

### Scheduler

`REFRESH_INTERVAL_HOURS=off` keeps the timer and the startup catch-up off. A signed-in Refresh on the QA URL still runs. Do that only during a capped window.

### Tailscale Serve

Phil runs this. Do not point the live script at the QA port. `scripts/tailscale-serve.sh` serves `127.0.0.1:3001` on HTTPS 443.

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:3002
tailscale serve status
```

8443 is the QA HTTPS port. It is tailnet only. It is not 443.

### Keys on and off

Provider keys are changed only in `/opt/informed-news/qa.env`. Leave `/opt/informed-news/.env` alone. Live checks stay keys-off.

- Off: `OLLAMA_API_KEY` and `TYPESAFE_API_KEY` empty, as in the placeholder block.
- On, for a capped window: set those two values in the QA file, then run the start command again so the container picks them up.
- Off again: clear the two values and run the start command again.

### Teardown

```bash
tailscale serve --https=8443 off
docker compose --env-file /opt/informed-news/qa.env -p informed-news-qa down
docker volume rm informed-news-qa-data
```

`docker volume rm` is optional and names only the QA volume. Never remove `informed-news-data`. Do not run `docker compose down` without `-p informed-news-qa`; that stops the live project.

## Out of scope

Off-box backups and key rotation. Standing up the QA instance on the VPS is a separate operator step. The repo change does not SSH to the host or create the instance.
