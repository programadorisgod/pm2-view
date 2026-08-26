# Multi-process Groups (Monorepo / Ecosystem) — Guide

This document explains how PM2 View represents a monorepo project that runs as **several PM2 processes** (for example Atlas with `atlas-backend` + `atlas-frontend`) as a **single grouped project**, instead of one card per process.

> **TL;DR** — A project can carry a JSON array of PM2 process names in the `projects.pm2_names` column. When a workspace/ecosystem file declares multiple apps, PM2 View detects them and groups them under one project across the dashboard, project list, detail page, registration, import, delete, and auto-deploy flows.

## The core concept: `pm2_names`

`projects` (`src/lib/db/schema/projects.ts`) has two relevant columns:

| Column | Meaning |
| ------ | ------- |
| `pm2_name` | The **primary** PM2 process name (used for matching, favorites, and as the fallback) |
| `pm2_names` | JSON array of **all** PM2 process names in the group, e.g. `["atlas-backend","atlas-frontend"]` |

A project with a populated `pm2_names` is a **group**; a project with only `pm2_name` is **individual**.

## How groups are detected

### 1. Workspace detection

From each process's `pm_cwd`, the code walks up to **4 parent levels** looking for a workspace indicator (`src/lib/services/project-listing.service.ts`, `src/lib/utils/ecosystem.ts`):

- `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`, `rush.json`, `.yarnrc.yml`
- or a `package.json` containing a `"workspaces"` field

If a workspace root is found and more than one PM2 process runs from inside it, they are treated as a group.

### 2. Ecosystem file detection

`findEcosystemFiles()` / `parseEcosystemAppNames()` look for these files in the project directory and extract app names (via regex for JS/CJS, `JSON.parse` for `.json`):

- `ecosystem.cjs`, `ecosystem.config.js`, `ecosystem.config.cjs`, `ecosystem.config.ts`, `pm2.config.js`, `pm2.config.cjs`, `ecosystem.json`

This is used by the GitHub import wizard to propose a group registration.

## Where grouping applies

### Dashboard & project list

`ProjectListingService.getVisibleProjects()` (`src/lib/services/project-listing.service.ts`):

- Builds a **primary map** (`pm2_name → project`) and a **secondary map** (each `pm2_names` member → project).
- Matches running PM2 processes against groups first (secondary), then individuals (primary).
- **Auto-upgrades** an individual DB record to a group when its workspace contains >1 process (writes back `name`, `pm2_names`, `description`, `target_path`).
- **Detects workspace groups among unregistered processes** (for admins and users without project access), producing synthetic group entries.
- Aggregates CPU (average) and RAM (sum) across members; the group's status is the "worst" of its members (error > stopped > online > offline).
- Shows offline DB projects that still have an ecosystem file, with a **Start** action.

### Project detail page

`src/routes/(app)/projects/[id]/+page.server.ts` and `+page.svelte`:

- Resolves a process to its parent project (checking `pm2_names` membership).
- Shows a **process selector** chip bar when the group has >1 process, so you can inspect each member's logs/env individually.
- Auto-provisions a grouped project record if you open a member process that isn't registered yet.

### Registration (admin)

`src/routes/api/projects/register/+server.ts` accepts an optional `pm2Names` array (plus `teamId` and `members`). Collision checks run against every name in the group. `src/routes/api/pm2/unregistered/+server.ts` returns `groups` and `singles`, grouping unregistered processes by cwd and workspace root.

### GitHub import

The import wizard (`src/lib/ui/components/github-import-modal.svelte`) detects ecosystem files, parses app names, and — when more than one app is detected — lets the user **check which apps** to register. Selected apps are sent as `pm2Names`, so the project is created as a group.

### Delete

`PM2Service.deleteProcess()` handles group members: deleting a non-primary member removes only that name from `pm2_names`; deleting the last member deletes the whole project record.

### Auto-deploy

See [docs/auto-deploy.md](./auto-deploy.md): the deployment runner restarts **every** name in `pm2_names`, and the webhook resolves a group member to its parent project.

## Step-by-step: register a monorepo as a group

1. Ensure the workspace is running in PM2 (e.g. both `atlas-backend` and `atlas-frontend` are online).
2. As admin, open **Projects** and use the registration flow ("Add Project" / unregistered-processes picker).
3. The picker (`GET /api/pm2/unregistered`) groups the processes that share a workspace root.
4. Select the group and submit. The project is created with `pm2_names = ["atlas-backend","atlas-frontend"]` and a single card appears in the list.

## Step-by-step: import a monorepo from GitHub as a group

1. Open **GitHub** and import the repository.
2. After clone/install/build, the wizard runs ecosystem detection.
3. If multiple apps are detected, tick the apps to include.
4. Continue → optionally write `.env` (with an optional subdirectory) → **Start with PM2**.
5. The project is registered as a group (`pm2_names`), and all selected apps start under PM2.

## Where the code lives

| File | Role |
| ---- | ---- |
| `src/lib/db/schema/projects.ts` | `pm2_name` / `pm2_names` columns |
| `src/lib/utils/ecosystem.ts` | `findEcosystemFiles`, `parseEcosystemAppNames` |
| `src/lib/services/project-listing.service.ts` | Grouping, workspace detection, auto-upgrade, aggregation |
| `src/routes/(app)/projects/[id]/+page.server.ts` | Detail-page group resolution + auto-provision |
| `src/routes/(app)/projects/[id]/+page.svelte` | Process selector chip bar |
| `src/routes/(app)/projects/[id]/sharing/+page.server.ts` | Group lookup by `pm2_names` membership |
| `src/routes/api/projects/register/+server.ts` | Group registration + collision check |
| `src/routes/api/pm2/unregistered/+server.ts` | Unregistered grouping (cwd + workspace) |
| `src/lib/pm2/pm2.service.ts` | Group-aware delete |
| `src/lib/deploy/deployment-runner.ts` | `resolveProcessNames` (multi-process restart) |
| `src/routes/api/webhooks/github/+server.ts` | Resolves group members to parent project |
| `src/lib/ui/components/github-import-modal.svelte` | Multi-app selection on import |
| `src/lib/ui/components/register-process-modal.svelte` | Admin registration UI |

## Notes & limitations

- A process name can belong to **only one** project (collision check on `pm2_name` across the whole `pm2_names` set).
- Workspace detection relies on the PM2 `pm_cwd` being accurate; processes started from the wrong directory may not group correctly (see `resolveProjectDir()` in `src/lib/pm2/pm2.service.ts`).
- Auto-starting missing group members from a webhook deploy is **not** supported yet — every process must already be running in PM2 (or started once manually).
