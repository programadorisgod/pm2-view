# GitHub App Integration — Setup Guide

This guide walks you through the complete GitHub integration for PM2 View: creating the GitHub App, configuring the environment variables, running the database migration, and using the feature to import repositories.

> **TL;DR** — You need a GitHub App (not a PAT, not an OAuth App), 6 environment variables, and one migration. The flow is: install the app → GitHub redirects to your callback → the app saves the installation → list repositories → import.

## What this integration does

| Capability | How it works |
| ---------- | ------------ |
| **Connection** | Each user installs your GitHub App into their account/org |
| **Repository access** | The app lists only repos the installation grants access to |
| **Import** | Clones a repo (`--depth 1`) into a temporary workspace using an installation access token, then cleans up |
| **Sync** | Webhooks keep the installation record in sync when it's created/removed |

## Flow diagram

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant A as PM2 View
    participant G as GitHub

    U->>U: Clicks "Connect GitHub" on /github
    U->>G: Opens {BETTER_AUTH_URL}{base}/github (Install URL)
    G->>U: OAuth authorization + installation screen
    U->>G: Picks account + repo access, clicks "Install"
    G-->>A: Redirect to {base}/github/setup?installation_id=123&setup_action=install
    A->>G: GET /app/installations/{id} (validate installation)
    A->>A: Save installation in github_installations table
    A-->>U: "GitHub connected successfully" → /github
    U->>A: Loads /github → lists accessible repositories
    U->>A: Clicks "Import" on a repository
    A->>G: POST /app/installations/{id}/access_tokens (contents: read)
    G-->>A: Installation access token (1h)
    A->>A: git clone --depth 1 <repo> into tmp workspace
    A-->>U: "Repository imported successfully"
    Note over A,G: Webhooks (async):<br/>installation.deleted → deletes record<br/>installation_repositories.added/removed → logs change
```

## Prerequisites

- PM2 View installed and running (see [README](../README.md#getting-started))
- A GitHub account with access to create GitHub Apps
- Access to a public URL for the webhook (see [Webhook URL](#step-4-configure-the-webhook)) — `http://localhost` won't work for webhooks unless you use a tunnel like `cloudflared` or `ngrok`

---

## Step 1 — Create the GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**.
   - Direct link: <https://github.com/settings/apps/new>
2. Fill in the **GitHub App name**. This defines the app's **slug** (the URL-friendly name used in `https://github.com/apps/{slug}/installations/new`).
   - Example: app name `Big Data View` → slug `big-data-view`
3. **Homepage URL** — the app's public origin (no path, no trailing slash):
   - Dev: `http://localhost:5179`
   - Prod: `https://your-domain.com`
   - > ⚠️ **Do NOT** put `/github/callback` or any path here — it's a regular link, not a handler.
4. Click **Create GitHub App**.

## Step 2 — Configure the callbacks (Setup URL + Redirect URI)

Under **Identifying and authorizing users**:

| Field | Value |
| ----- | ----- |
| **Setup URL (optional)** | `{BETTER_AUTH_URL}{base}/github/setup` |
| **Redirect URI** | `{BETTER_AUTH_URL}{base}/github/setup` |

Where:
- `BETTER_AUTH_URL` is the origin from your `.env`
- `base` is the app's base path (empty by default, `/pm2` in some deployments)

Examples:
- Dev (no base path): `http://localhost:5179/github/setup`
- Prod (base `/pm2`): `https://your-domain.com/pm2/github/setup`

> ✅ **Must check: "Request user authorization (OAuth) during installation"** — this makes GitHub append `code` + `setup_action=install` to the redirect, which the callback uses to validate the request.

## Step 3 — Configure the webhook

Under **Webhook**:

| Field | Value |
| ----- | ----- |
| **Webhook URL** | `{BETTER_AUTH_URL}{base}/api/webhooks/github` |
| **Webhook secret** | Run this and paste the output: `openssl rand -hex 32` |

Examples:
- Dev: `http://localhost:5179/api/webhooks/github`
- Prod: `https://your-domain.com/pm2/api/webhooks/github`

> ⚠️ The path **must** end in `/api/webhooks/github` — that's the SvelteKit route. A webhook URL like `/github-webhook` will not match and GitHub will keep sending "failed delivery" events.
>
> 💡 Webhooks do **not** reach `http://localhost`. Use a tunnel:
> ```bash
> cloudflared tunnel --url http://localhost:5179
> # then use the https://*.trycloudflare.com URL in the Webhook URL field
> ```
> You'll need to update the Webhook URL (and the setup URL) every time you restart the tunnel, or use a fixed tunnel.

## Step 4 — Set permissions

1. Under **Permissions**, grant read access to:
   - **Contents: Read** — required so the app can generate a token that clones repositories (`createInstallationAccessToken` with `contents: read`).
   - **Metadata: Read** (usually enabled automatically).
2. Under **Subscribe to events**, enable:
   - **Installation**: keeps the `github_installations` record in sync when an installation is created/deleted.
   - **Installation repositories**: notified when repos are added/removed.
3. Under **Repository access**, choose:
   - **All repositories**, or
   - **Only select repositories** and pick the ones you want accessible. ("Only select repositories" also includes public repos read-only.)

## Step 5 — Generate the private key + capture App ID

1. Scroll to the bottom of the app page and click **Generate a private key**. This downloads a `.pem` file — keep it safe (it's a secret).
2. Back on the app page, note the **App ID** — it's a **number** (e.g. `1234567`). ⚠️ This is NOT the app slug.
3. Open the app's **OAuth** page (left sidebar) and copy the **Client ID** and **Client secret**.

---

## Step 6 — Configure the environment variables

Add these to your `.env` (full reference in [`.env.example`](../.env.example)):

```env
# GitHub App integration
GITHUB_APP_ID=1234567
GITHUB_APP_SLUG=your-app-slug
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----
```

| Variable | Where to get it | Notes |
| -------- | --------------- | ----- |
| `GITHUB_APP_ID` | GitHub App page | **Must be the numeric ID** (e.g. `1234567`). The slug (`@bigdata-gcm`-style values) will break auth. |
| `GITHUB_APP_SLUG` | The app's URL-friendly name | Used to build the install URL `https://github.com/apps/{slug}/installations/new`. |
| `GITHUB_CLIENT_ID` | GitHub App → OAuth page | |
| `GITHUB_CLIENT_SECRET` | GitHub App → OAuth page → generate client secret | |
| `GITHUB_WEBHOOK_SECRET` | Step 3 (`openssl rand -hex 32`) | Must match the webhook secret configured on GitHub. |
| `GITHUB_PRIVATE_KEY` | The `.pem` file from Step 5 | Keep on a single line with `\n` for line breaks (see below). |

### Correct `GITHUB_PRIVATE_KEY` format

The private key **must be on a single line** in `.env`, with `\n` between segments. Both leading and trailing `-----BEGIN/END ... -----` markers and the quotes are optional, but the single-line `\n` form is the most reliable:

```env
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
```

> ⚠️ If you paste a multi-line PEM directly (wrapped in quotes), dotenv may not parse it and Octokit will throw `GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required` even though the variable looks set. Flatten it to one line with explicit `\n`.

## Step 7 — Run the database migration

The integration stores installations in the `github_installations` table.

```bash
# If this is a fresh checkout:
npx drizzle-kit push          # or: pnpm db:migrate
```

If you're on an existing deployment where the migration files are already committed, run:

```bash
pnpm db:migrate
```

Verify the table exists:

```bash
# Via drizzle-kit push or your SQL client:
# SELECT name FROM sqlite_master WHERE type='table' AND name='github_installations';
```

## Step 8 — Restart the app

The webhook route and callback load env vars at process start, so restart after editing `.env`:

```bash
pnpm dev                      # dev
pm2 restart pm2-view          # production (or whatever your app name is)
```

---

## Using the integration

1. Log in and open the **GitHub** page from the sidebar.
2. Click **Connect GitHub** → you're taken to `https://github.com/apps/{slug}/installations/new`.
3. Install the app on your account/org, choose repo access, click **Install**.
4. GitHub redirects to `{base}/github/setup?installation_id=...&setup_action=install` — the app validates the installation and saves it.
5. You're back on `/github`, now showing **Connected** plus the list of accessible repositories.
6. Click **Import** on any repository — it clones the repo (`--depth 1`) into a temp workspace with a fresh installation token, then cleans up.
7. If you uninstall the app, the `installation` webhook with `action=deleted` removes the DB record automatically.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| `GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required` | `GITHUB_APP_ID` is not numeric (e.g. `@bigdata-gcm`) | Use the numeric App ID from the GitHub App page. |
| Same error, but App ID is a number | `GITHUB_PRIVATE_KEY` is multiline in `.env` | Flatten the PEM to a single line with `\n`. |
| `GITHUB_APP_SLUG is required` | `GITHUB_APP_SLUG` empty | Set it to the app's URL-friendly name. |
| 404 on `/github/callback` | Homepage URL was set to a path | Set Homepage URL to just the origin (e.g. `http://localhost:5179`). |
| "Invalid setup parameters" on callback | Setup URL missing `setup_action=install`, or wrong `action` param | Check Setup URL points to `{base}/github/setup` and "Request user authorization (OAuth) during installation" is on. |
| App installed but still shows "Connect GitHub" | Setup URL never called, or callback failed | Check server logs for `[github-setup]`. Verify Setup URL + Redirect URI are `{base}/github/setup`. Uninstall and reinstall the app after fixing. |
| GitHub shows webhook delivery failures | Webhook URL path wrong | Must end in `/api/webhooks/github`. |
| `401 Invalid webhook signature` | `GITHUB_WEBHOOK_SECRET` ≠ webhook secret on GitHub | Set both to the same value (`openssl rand -hex 32`). |
| Webhooks never reach the app | Webhook URL is `http://localhost` | GitHub can't reach your machine. Use a tunnel and a reachable URL. |
| Import fails to clone private repo | App lacks **Contents: Read** permission | Grant `Contents: Read` in the app's Permissions, then reinstall/update the installation. |

## Reference — where the code lives

| File | Purpose |
| ---- | ------- |
| `src/lib/github/infrastructure/github-app-client.ts` | Octokit setup, install URL, installation/repo queries |
| `src/lib/github/github-setup.service.ts` | Validates + saves the installation after the callback |
| `src/lib/github/github-repositories.service.ts` | Lists repos for the connected user |
| `src/lib/github/github-import.service.ts` | Clones the repo with a scoped installation token |
| `src/lib/github/infrastructure/github-webhook-verifier.ts` | Verifies webhook signatures (`x-hub-signature-256`) |
| `src/routes/(app)/github/+page.server.ts` | Loads connection state + repos for `/github` |
| `src/routes/(app)/github/setup/+page.server.ts` | Handles the `installation_id` + `setup_action` callback |
| `src/routes/api/webhooks/github/+server.ts` | Receives `installation` / `installation_repositories` events |
| `src/lib/db/schema/github-installations.ts` | Drizzle schema for the `github_installations` table |