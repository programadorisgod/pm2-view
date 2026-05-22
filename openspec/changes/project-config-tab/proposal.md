# Proposal: Project Configuration Tab

## Intent

Deploy commands are hardcoded in `DeployService` (`git pull → install → build → pm2 restart --update-env`). Users cannot customize install, build, or restart commands per project. Projects with multiple PM2 processes (e.g., API + worker + scheduler) need to select which restart commands to run per deploy. This change adds per-project deploy configuration with multi-command support and a deploy-time command selector.

## Scope

### In Scope
- **`deploy_commands` table** — stores per-project command overrides (install, build, restart) with support for multiple commands per type
- **Configuration tab UI** — new tab in project detail page for managing deploy commands
- **Deploy command selection** — deploy modal shows a pre-flight step letting users pick which restart commands to execute
- **DeployService refactor** — accept deploy config to override hardcoded defaults
- **Tab system extraction** — replace inline `{#if}/{@else if}` chain with config-driven tab array

### Out of Scope
- Environment variable management (existing `env_vars` table unused — separate change)
- Pre/post deploy hooks (future enhancement)
- Deploy history or audit log
- Fixing the missing `delete` action in the projects API handler (pre-existing bug, separate fix)
- DeployModal decomposition (548 lines — separate refactoring change)

## Capabilities

> Contract between proposal and specs phases.

### New Capabilities
- `project-deploy-config`: Per-project deploy command CRUD — storage, validation, service layer, and Configuration tab UI for managing install/build/restart command overrides
- `deploy-command-selection`: Deploy-time command selector — pre-flight UI in deploy modal and DeployService integration to run user-selected restart commands instead of hardcoded defaults

### Modified Capabilities
None (no existing specs in `openspec/specs/`)

## Approach

### Database

New `deploy_commands` table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | nanoid |
| `project_id` | text FK → projects.id | NOT NULL |
| `command_type` | text | `'install'` \| `'build'` \| `'restart'` |
| `label` | text | Human-readable name (e.g., "Restart API server") |
| `command` | text | Full shell command (e.g., `pm2 restart api --update-env`) |
| `sort_order` | integer | Display/execution order within type |
| `created_at` | integer | unixepoch default |

Unique constraint: `(project_id, command_type, sort_order)`.

### Service Layer

- **`DeployConfigRepository`** — Drizzle-based CRUD for `deploy_commands`, injected via service container
- **`DeployConfigService`** — `getConfig(projectId)` returns commands grouped by type; `saveCommand()`, `deleteCommand()` for mutations
- **`DeployService.deploy()`** — new optional parameter `options?: { installCommand?: string; buildCommand?: string; restartCommands?: string[] }`. When provided, overrides the corresponding hardcoded step. When absent, current behavior is preserved (backward compatible).

### Deploy Command Selection Flow

1. User clicks "Deploy" → DeployModal opens
2. DeployModal fetches project's deploy config via API
3. If project has multiple restart commands: show **selection step** with checkboxes per command (all selected by default)
4. User confirms selection → deploy starts with selected commands passed to API
5. If project has 0-1 restart commands: skip selection, deploy immediately (current behavior)

### UI

- **Configuration tab**: Form sections for each command type. Each section shows saved commands with add/edit/delete/reorder. Install and build allow one override each. Restart allows multiple entries.
- **Tab extraction**: Replace inline tab array + `{#if}` chain with a `TABS` config array and `{#snippet}` for content, keeping `{#key activeTab}` for DOM reset.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/db/schema/` | New | `deploy-commands.ts` table definition |
| `src/lib/deploy-config/` | New | Repository, service, types |
| `src/lib/deploy/deploy.service.ts` | Modified | Accept optional command overrides |
| `src/lib/deploy/deploy.types.ts` | Modified | Add `DeployOptions` type |
| `src/routes/api/deploy/+server.ts` | Modified | Accept selected command IDs in request body |
| `src/routes/(app)/projects/[id]/+page.svelte` | Modified | Add config tab, extract tab system |
| `src/routes/(app)/projects/[id]/+page.server.ts` | Modified | Load deploy config in server load |
| `src/lib/ui/components/deploy-modal.svelte` | Modified | Add command selection pre-flight step |
| `src/lib/ui/components/` | New | `deploy-config-form.svelte`, `command-selector.svelte` |
| `src/lib/services/factory.ts` | Modified | Register DeployConfigService |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Command injection via user-supplied shell commands | High | Commands run through existing `runCommand()` with `spawn()` (no shell interpolation). Validate command format on save. |
| Breaking existing deploys for projects without config | Low | DeployService falls back to current hardcoded behavior when no overrides provided |
| DeployModal complexity increase | Med | Keep selection step as isolated component; defer full modal decomposition |

## Rollback Plan

1. Drop `deploy_commands` table (no data dependencies)
2. Revert `DeployService.deploy()` signature to remove `options` parameter
3. Remove Configuration tab from tab array — existing tabs unaffected by extraction refactor
4. DeployModal reverts to immediate deploy (no selection step)

## Dependencies

- None external. Uses existing Drizzle ORM, existing `runCommand()` infrastructure.

## Success Criteria

- [ ] Users can configure custom install, build, and restart commands per project via Configuration tab
- [ ] Projects support multiple restart commands with labels and ordering
- [ ] Deploy modal shows command selection when project has multiple restart commands
- [ ] Selected restart commands execute in order during deploy
- [ ] Projects without custom config deploy identically to current behavior (zero regression)
- [ ] Tab system is config-driven — adding a future tab requires only appending to the config array
