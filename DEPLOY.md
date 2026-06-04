# Deploying Atib (Next.js) to Railway

You already have a Railway project named **ATIB** with a `Postgres` service and an `atib` service (the old prototype). This guide replaces the prototype deploy with the new Next.js app.

## Step 1 — Get your terminal ready

```bash
cd ~/Documents/MUKHATIB/atib
railway login    # if your session has expired
railway link     # pick: srbhyana's Projects → ATIB → production → atib
```

You should see `Linked service atib` after the last command.

## Step 2 — Generate secrets locally

These need to be cryptographically random — never reuse from elsewhere:

```bash
echo "NEXTAUTH_SECRET=$(openssl rand -hex 32)"
echo "ATIB_ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

Copy both lines. You'll paste them in the next step.

## Step 3 — Set env vars on Railway

Open the dashboard: <https://railway.com/project/2383a9fc-47db-4cd5-89b2-9b78a3cd9b9a>
Click the **atib** service → **Variables** tab → **+ New Variable**.

Required:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Already there (from Postgres service). Leave it. |
| `NEXTAUTH_URL` | `https://atib-production.up.railway.app` (your existing domain) |
| `NEXTAUTH_SECRET` | The hex string from Step 2 |
| `ATIB_ENCRYPTION_KEY` | The hex string from Step 2 |
| `NODE_ENV` | `production` |

Optional (each unlocks one capability):

| Variable | What it unlocks |
|---|---|
| `ANTHROPIC_API_KEY` | Full v3.0 SOAP analysis (otherwise heuristic fallback). Can also be set per-workspace via the UI later. |
| `OPENAI_API_KEY` | Signal dedup embeddings + KB retrieval. |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | Magic-link invite emails (otherwise the link is returned in the API response and you share it manually). |
| `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` | Scheduled jobs (signal decay, weekly positioning audit). Without these, Inngest runs in dev mode against a local server only. |

## Step 4 — Initialise the database

The `signals` and `kb_chunks` tables use `pgvector`. Enable it once:

```bash
# Pull DATABASE_URL into a local shell, run the init script
railway run npm run db:init
```

Then push the schema:

```bash
railway run npm run db:push
```

When Drizzle asks for confirmation on creating tables, type `y`.

## Step 5 — Deploy

```bash
railway up
```

You'll see nixpacks detect Node 20, run `npm ci`, then `npm run build`. The build will compile the Next.js app (~2 min the first time). When you see `Deploy complete` + `Healthcheck succeeded`, it's live.

## Step 6 — Smoke test

```bash
# Health
curl https://atib-production.up.railway.app/api/health
# Expect: {"ok":true,"status":"healthy"}

# Hit the login page
curl -I https://atib-production.up.railway.app/login
# Expect: HTTP/2 200
```

Open the URL in a browser. You should land on the login screen. Click "Create an account" (if there's a signup link) or use the signup API to create the first PMM admin:

```bash
curl -X POST https://atib-production.up.railway.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"a-long-strong-password","workspaceName":"Atib"}'
```

That creates the workspace + the PMM admin user. Log in, complete setup, you're in.

## Step 7 — Index the knowledge bases (when you have OPENAI_API_KEY)

```bash
railway run npm run db:reindex-kb
```

Chunks the four KB markdowns under `knowledge-base/`, embeds them with `text-embedding-3-small`, writes to `kb_chunks`. Takes ~2 min. Run once; rerun whenever a KB changes.

## What can go wrong

- **`pgvector` missing** → run `railway run npm run db:init` first.
- **Build OOM on Railway** → Next.js builds need ~1.5 GB. Railway's default plan is fine, but if you see OOM, upgrade or set `NODE_OPTIONS=--max-old-space-size=2048` as a service env var.
- **Cookie not set after login** → check `NEXTAUTH_URL` matches the actual deployed domain exactly (no trailing slash, https not http).
- **Old prototype still serving** → the `atib` service replaces the prior deploy on `railway up`. If a different service is still up, archive it from the dashboard.

## When you're done

Tell me the deploy URL (or paste the `railway up` tail), and I'll run live verification checks from my sandbox.
