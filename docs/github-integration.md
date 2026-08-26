# GitHub App Integration — Setup Guide

This guide walks you through the complete GitHub integration for PM2 View: creating the GitHub App, configuring the environment variables, running the database migration, and using the feature to import repositories.

> **TL;DR** — You need a GitHub App (not a PAT, not an OAuth App), 6 environment variables, and one migration. The flow is: user clicks Connect → GitHub OAuth → install the app → GitHub redirects with installation_id → the app saves the installation → list repositories → import.

## What this integration does

| Capability | How it works |
| ---------- | ------------ |
| **Connection** | Each user installs your GitHub App into their account/org after authorizing via OAuth |
| **Repository access** | The app lists only repos the installation grants access to |
| **Import** | Clones a repo (`--depth 1`) into a **persistent** target path using an installation access token, installs deps, builds, and detects ecosystem files |
| **Multi-app import** | Detects apps declared in an ecosystem file and lets the user pick which to register as a group |
| **Env on import** | Writes a `.env` (optionally into a subdirectory) before starting the process |
| **Sync** | Webhooks keep the installation record in sync when it's created/removed |
| **Account management** | Search/sort the repo list and fully disconnect the account |

## Flow diagram

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant A as PM2 View
    participant G as GitHub

    U->>A: Clicks "Connect GitHub" on /github
    A-->>U: Redirect to /github/setup
    U->>G: GitHub OAuth authorization
    G->>U: OAuth consent screen
    U->>G: Authorizes the app
    G-->>A: Redirect to {base}/github/setup?code=XXX&state=YYY
    A->>G: Exchanges code for access token
    A->>G: GET /user/installations
    G-->>A: List of installations
    alt Installation exists in list
        A->>A: Save installation + add user to junction table
        A-->>U: "GitHub connected successfully" → /github
    else No installation found
        A-->>U: "Please install the GitHub App" + install link
        U->>G: Clicks install → selects account + repo access
        U->>G: Clicks "Install"
        G-->>A: Redirect to {base}/github/setup?installation_id=123&setup_action=install
        A->>G: GET /app/installations/{id} (validate installation)
        A->>A: Save installation in github_installations table
        A-->>U: "GitHub connected successfully" → /github
    end
    U->>A: Loads /github → lists accessible repositories
    U->>A: Clicks "Import" on a repository
    A->>G: POST /app/installations/{id}/access_tokens (contents: read)
    G-->>A: Installation access token (1h)
    A->>A: git clone --depth 1 <repo> into target path
    A->>A: install → build → detect ecosystem files/apps
    A-->>U: Streams NDJSON progress (clone/install/build/ecosystem)
    U->>A: Selects ecosystem apps / writes .env (optional)
    A->>A: pm2 start <ecosystem file> + save project (pm2Names)
    Note over A,G: Webhooks (async):<br/>installation.deleted → deletes record<br/>installation_repositories.added/removed → logs change
```

### Key insight: OAuth ≠ Installation

**Authorizing via OAuth and installing the GitHub App are two separate steps.**

- OAuth tells GitHub "this user authorized our app to know their identity"
- Installation tells GitHub "this user installed our app to access their repositories"

A user can authorize OAuth without installing the app. In that case, PM2 View shows an "install the GitHub App" message after OAuth completes. The user must then complete the installation (selecting repos) for repository access to work.

### Key insight: Org installations are shared, but access is per-user

When the app is installed into an organization, the installation belongs to the org — not to the individual who installed it. However, PM2 View tracks which users have access via a junction table. Each org member must complete the OAuth flow at least once to be added to this table. After that, they see the same repositories without re-installing.

## Prerequisites

- PM2 View installed and running (see [README](../README.md#getting-started))
- A GitHub account with access to create GitHub Apps
- Access to a public URL for the webhook (see [Webhook URL](#step-4-configure-the-webhook)) — `http://localhost` won't work for webhooks unless you use a tunnel like `cloudflared` or `ngrok`

---

## Step 1 — Create the GitHub App (detailed walkthrough)

> Go to **GitHub → Settings → Developer Settings → GitHub Apps → New GitHub App**.
> Direct link: <https://github.com/settings/apps/new>

### 1.1 — Basic information

| Field | Value | Notes |
| ----- | ----- | ----- |
| **GitHub App name** | `gcm-big-data-platform` (or your chosen name) | Defines the **slug** used in URLs like `https://github.com/apps/{slug}/installations/new`. Only the account `@bigdata-gcm` can install it if you choose "Only on this account" below. |
| **Description** | Optional — shown to users during installation | Markdown supported. |
| **Homepage URL** | `https://gcmbigdata.online/pm2/` (prod) or `http://localhost:5179` (dev) | ⚠️ **Just the origin + base path, no trailing slash.** Do NOT put `/github/callback` here — it's a regular link, not a handler. |

### 1.2 — Identifying and authorizing users (OAuth callbacks)

| Field | Value |
| ----- | ----- |
| **Redirect URI** | `https://gcmbigdata.online/pm2/github/setup` (prod) or `http://localhost:5179/github/setup` (dev) |
| **Allow wildcard matching** | ❌ Leave unchecked |
| **Expire user authorization tokens** | ✅ Recommended — provides a `refresh_token` for token rotation |
| **Request user authorization (OAuth) during installation** | ✅ **MUST be checked** — makes GitHub redirect to the Setup URL after OAuth authorization |
| **Enable Device Flow** | ❌ Leave unchecked (not needed) |

> ✅ **"Request user authorization (OAuth) during installation" is critical.** Without it, GitHub won't redirect through the Setup URL after the user installs the app, and the installation flow breaks.

### 1.3 — Post installation

| Field | Value | Notes |
| ----- | ----- | ----- |
| **Setup URL** | `https://gcmbigdata.online/pm2/github/setup` (prod) or `http://localhost:5179/github/setup` (dev) | ⚠️ **MUST be set** — this is where GitHub redirects after installation completes. Must match the Redirect URI. |
| **Redirect on update** | ✅ Check this | Redirects users to the Setup URL after installations are updated (e.g. repos added/removed). |

### 1.4 — Webhook

| Field | Value | Notes |
| ----- | ----- | ----- |
| **Active** | ✅ **Must be checked** | Deliver event details when the hook is triggered. |
| **Webhook URL** | `https://gcmbigdata.online/pm2/api/webhooks/github` (prod) or `http://localhost:5179/api/webhooks/github` (dev) | ⚠️ Must end in `/api/webhooks/github` — that's the SvelteKit route. |
| **Secret** | Generate one: `openssl rand -hex 32` | Save this — you'll need it for `GITHUB_WEBHOOK_SECRET` in `.env`. |

> 💡 **Local dev webhooks:** GitHub can't reach `http://localhost`. Use a tunnel:
> ```bash
> cloudflared tunnel --url http://localhost:5179
> # Use the https://*.trycloudflare.com URL in the Webhook URL field
> ```

### 1.5 — Where can this GitHub App be installed?

| Option | Selection | Notes |
| ------ | --------- | ----- |
| **Only on this account** | ✅ Select this | Restricts installation to `@bigdata-gcm` only. Best for internal apps. |
| Any account | ❌ Leave unchecked | Only choose this if you want anyone to install the app. |

> For multi-user support within your org, choose **"Only on this account"**. If you need the app installable by any GitHub user/org, choose "Any account" — but note GitHub may require marketplace verification for public apps.

---

After filling in all the above, click **Create GitHub App**. Then continue with permissions and events below.

## Step 2 — Set permissions (after creating the app)

> After clicking "Create GitHub App" in Step 1, you're taken to the app's settings page. Configure the following sections:

### 2.1 — Repository permissions

Go to **Repository permissions** and select:

| Permission | Access | Why |
| ---------- | ------ | --- |
| **Contents** | **Read & Write** (or at least Read) | **MOST IMPORTANT** — required to clone repositories, read files, and access repo contents. Without this, `git clone` with an installation token will fail. |
| **Actions** | Read | View workflows, workflow runs, and artifacts. |
| **Administration** | Read | Repository settings, collaborators, and team access. |
| **Artifact metadata** | Read | Create and retrieve artifact metadata for a repository. |

> ⚠️ **Contents permission is the most critical one.** It allows the app to read repository contents, commits, branches, releases, and merges. The import feature (`git clone --depth 1`) depends on this.

Leave all other repository permissions unchecked unless you have a specific need for them.

### 2.2 — Subscribe to events

Under **Subscribe to events**, enable these events. They are sent to your Webhook URL when triggered:

| Event | Why |
| ----- | --- |
| **Installation** | **Required** — keeps `github_installations` in sync when an installation is created, deleted, or a new repository is added. |
| **Installation target** | A GitHub App installation target is renamed. |
| **Meta** | When this App is deleted and the associated hook is removed. |
| **Security advisory** | Security advisory published, updated, or withdrawn. |
| **Branch protection configuration** | All branch protections disabled or enabled for a repository. |
| **Branch protection rule** | Branch protection rule created, deleted or edited. |
| **Commit comment** | Commit or diff commented on. |
| **Create** | Branch or tag created. |
| **Delete** | Branch or tag deleted. |
| **Fork** | Repository forked. |
| **Label** | Label created, edited or deleted. |
| **Member** | Collaborator added, removed, or permissions changed. |
| **Public** | Repository changes from private to public. |
| **Push** | Git push to a repository. |
| **Release** | Release created, edited, published, unpublished, or deleted. |
| **Repository** | Repository created, deleted, archived, unarchived, publicized, privatized, edited, renamed, or transferred. |
| **Repository dispatch** | When a message is dispatched from a repository. |
| **Security and analysis** | Code security features enabled or disabled for a repository. |
| **Star** | A star is created or deleted from a repository. |
| **Watch** | User stars a repository. |
| **Workflow dispatch** | A manual workflow run is requested. |
| **Workflow job** | Workflow job queued, waiting, in progress, or completed. |
| **Workflow run** | Workflow run requested or completed. |

> ✅ **Installation is the only required event** for the core integration to work (syncing the DB record). The rest are optional but useful for future features like sync-on-push, release tracking, etc.

### 2.3 — Repository access (at the bottom of the permissions page)

| Option | Selection | Notes |
| ------ | --------- | ----- |
| **All repositories** | ✅ Recommended | The app gets access to all repos the installing user/org grants it. |
| Only select repositories | Alternative | Pick specific repos. Also includes public repos read-only. |

---

After configuring permissions, click **Save changes**.

## Step 3 — Generate the private key + capture App ID

1. Scroll to the bottom of the app page and click **Generate a private key**. This downloads a `.pem` file — keep it safe (it's a secret).
2. Back on the app page, note the **App ID** — it's a **number** (e.g. `1234567`). ⚠️ This is NOT the app slug.
3. Open the app's **OAuth** page (left sidebar) and copy the **Client ID** and **Client secret**.

---

## Step 4 — Configure the environment variables

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
| `GITHUB_WEBHOOK_SECRET` | Step 1.4 (`openssl rand -hex 32`) | Must match the webhook secret configured on GitHub. |
| `GITHUB_PRIVATE_KEY` | The `.pem` file from Step 3 | Keep on a single line with `\n` for line breaks (see below). |
| `REPOS_PATH` | Optional | Base directory where imports are cloned (default `/opt/repos`). |

### Correct `GITHUB_PRIVATE_KEY` format

The private key **must be on a single line** in `.env`, with `\n` between segments. Both leading and trailing `-----BEGIN/END ... -----` markers and the quotes are optional, but the single-line `\n` form is the most reliable:

```env
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
```

> ⚠️ If you paste a multi-line PEM directly (wrapped in quotes), dotenv may not parse it and Octokit will throw `GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required` even though the variable looks set. Flatten it to one line with explicit `\n`.

## Step 5 — Make the GitHub App public

> **This is the final step and it's critical for multi-user support.**

If the app is **Private**, only the creator (the account that created the app) can install it. Any other user who tries to connect will go through OAuth successfully, but `/user/installations` will return empty — because they can't install a private app they don't own.

### Steps to make it public:

1. Go to your GitHub App settings page:
   - **GitHub → Settings → Developer Settings → GitHub Apps → your app**
   - Or directly: `https://github.com/settings/apps/{your-app-slug}`

2. Scroll down to the section that says **"Make this application public"** (near the bottom of the General settings page).

3. Click the button/link to change from **Private** to **Public**.

4. GitHub may show a confirmation dialog. Confirm the change.

5. ✅ Done — the app is now public.

> ⚠️ GitHub may require verification for public apps listed on the GitHub Marketplace. However, for internal/development use, you can keep it as an **unpublished public app** — it's installable by anyone but not listed in the marketplace.

### Verify it works:

- Log in with a **different GitHub account** (not the one that created the app).
- Go to the PM2 View GitHub page and click **Connect GitHub**.
- OAuth should succeed AND the installation should be detected.
- If you still get "No installations found" with a different account, the app is still Private — double-check Step 5.

## Step 6 — Run the database migration

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

## Step 7 — Restart the app

The webhook route and callback load env vars at process start, so restart after editing `.env`:

```bash
pnpm dev                      # dev
pm2 restart pm2-view          # production (or whatever your app name is)
```

---

## Using the integration

1. Log in and open the **GitHub** page from the sidebar.
2. Click **Connect GitHub** → you're taken to `/github/setup` which starts GitHub OAuth.
3. After authorizing, PM2 View calls `GET /user/installations` to find installations the user has access to:
   - **If found**: saves the installation + adds user to the junction table → shows repository list
   - **If not found**: shows "Please install the GitHub App" with an install link
4. If installation is needed: click **Install GitHub App** → select account/org and repo access → click **Install**.
5. GitHub redirects to `{base}/github/setup?installation_id=...&setup_action=install` → the app validates and saves the installation.
6. You're back on `/github`, now showing **Connected** plus the list of accessible repositories.
7. Click **Import** on any repository — the import wizard opens (see [Import pipeline](#import-pipeline-detailed) below).
8. If you uninstall the app, the `installation` webhook with `action=deleted` removes the DB record automatically.

### Import pipeline (detailed)

The import is a multi-step wizard (`src/lib/ui/components/github-import-modal.svelte`), streamed over NDJSON:

1. **Configure** — target directory (absolute path, default `{REPOS_PATH}/{repo.name}`) and process name. Optional advanced custom install/build commands.
2. **Clone & install & build & detect** (`POST /api/github/repositories/[id]/import`) — `GitHubImportPipelineService.runPhase1()` clones `--depth 1` with a fresh installation token, installs dependencies (auto-detects pnpm/bun/npm), builds (if a build script exists), then detects ecosystem files and parses app names.
   - **pnpm native builds** that require approval surface a `needsApproval` state; clicking **Approve & Continue** runs `pnpm approve-builds --all` and resumes.
3. **Select apps** — if more than one app is declared in an ecosystem file, tick which apps to register (they become a `pm2Names` group). Otherwise pick the ecosystem file to start.
4. **Environment (optional)** — paste or upload `.env` variables, optionally targeting a subdirectory (e.g. `app/backend`) via the `.env Location` field. `POST .../write-env` writes the file. Can be skipped.
5. **Start** (`POST /api/github/repositories/[id]/start`) — runs `pm2 start <ecosystem file> --update-env` and saves/updates the project record (with `pm2Names` for groups) in the DB.

The repository list supports **search and sort**, and you can **disconnect** the GitHub account entirely (`POST /api/github/disconnect`).

### Multi-user org installations

When the GitHub App is installed into an organization (not a personal account), **each user who needs access must complete the OAuth flow individually**:

1. User clicks **Connect GitHub** on the GitHub page
2. OAuth authorizes → `GET /user/installations` returns the org's installation
3. The callback detects the installation exists but the user doesn't have access yet
4. The user is added to the junction table → now sees **Connected** + repos

This means the first user who installs the app creates the installation record, and subsequent org members are added to it through their own OAuth flow. No re-installation is needed.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | ----- |
| `GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required` | `GITHUB_APP_ID` is not numeric (e.g. `@bigdata-gcm`) | Use the numeric App ID from the GitHub App page. |
| Same error, but App ID is a number | `GITHUB_PRIVATE_KEY` is multiline in `.env` | Flatten the PEM to a single line with `\n`. |
| `GITHUB_APP_SLUG is required` | `GITHUB_APP_SLUG` empty | Set it to the app's URL-friendly name. |
| 404 on `/github/callback` | Homepage URL was set to a path | Set Homepage URL to just the origin (e.g. `http://localhost:5179`). |
| "Invalid OAuth state" | OAuth state mismatch — browser cookies not working | Ensure cookies are enabled and the session is valid. |
| OAuth succeeds but "No installations found" | User authorized OAuth but didn't install the GitHub App | Click "Install GitHub App" and complete the installation. |
| OAuth succeeds, user installs app, but "Invalid setup parameters" | The app is Private — only the creator can install it | Make the app Public (see Step 7). |
| App installed but still shows "Connect GitHub" | Setup URL never called, or callback failed | Check server logs for `[github-setup]`. Verify Setup URL + Redirect URI are both `{base}/github/setup`. Uninstall and reinstall the app after fixing. |
| Org member can't see installation after first user connected | User hasn't completed their own OAuth flow yet | Each org member must click "Connect GitHub" and go through OAuth individually — the installation is shared, but the junction table entry is per-user. |
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
| `src/lib/github/github-import-pipeline.service.ts` | Full import pipeline: clone → install → build → ecosystem detect → pm2 start |
| `src/lib/github/github-import.service.ts` | Repository clone helper |
| `src/lib/github/infrastructure/github-webhook-verifier.ts` | Verifies webhook signatures (`x-hub-signature-256`) |
| `src/lib/utils/ecosystem.ts` | `findEcosystemFiles` / `parseEcosystemAppNames` |
| `src/routes/(app)/github/+page.server.ts` | Loads connection state + repos for `/github` |
| `src/routes/(app)/github/setup/+page.server.ts` | Handles OAuth and installation callbacks |
| `src/routes/api/webhooks/github/+server.ts` | Receives `installation` / `installation_repositories` / `push` events |
| `src/routes/api/github/repositories/[repositoryId]/import/+server.ts` | Clone + install + build + detect (NDJSON) |
| `src/routes/api/github/repositories/[repositoryId]/approve-builds/+server.ts` | `pnpm approve-builds` then resume |
| `src/routes/api/github/repositories/[repositoryId]/write-env/+server.ts` | Writes `.env` (optional subdir) |
| `src/routes/api/github/repositories/[repositoryId]/start/+server.ts` | `pm2 start` + saves project record |
| `src/routes/api/github/disconnect/+server.ts` | Disconnects the GitHub account |
| `src/lib/db/schema/github-installations.ts` | Drizzle schema for the `github_installations` table |
