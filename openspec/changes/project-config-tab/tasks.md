# Tasks: project-config-tab

## Dependency Graph

```
Phase 1 ──────┐
  T1 Schema   │
  T2 Types    │
  T3 Repo     │
              ├── Phase 2 ─────────────────────────────────┐
              │   T4 Service (needs T1,T2,T3)              │
              │   T5 API endpoints (needs T4)              │
              │   T6 DeployService refactor (needs T2)     │
              │   T7 Wire factory (needs T4,T6)            │
              │   T8 Page server load (needs T4)           │
              │                                            │
              ├── Phase 3 (Frontend) ──────────────────────┤
              │   T9 Tab extraction (independent)          │
              │   T10 DeployConfigForm (needs T5)          │
              │   T11 CommandSelector (needs T5)           │
              │   T12 DeployModal selection (needs T6,T11) │
              │                                            │
              └── Phase 4 (Tests) ─────────────────────────┘
                  T13 Unit tests (needs T3,T4,T6)
                  T14 Integration tests (needs T5)
```

---

## Phase 1: Data Layer

### T1 — Create `deploy_commands` schema + migration

**Description**: Define the `deploy_commands` Drizzle ORM table schema and generate the migration.

**Files**:
- `src/lib/db/schema/deploy-commands.ts` — **Create**
- `src/lib/db/schema/index.ts` — **Modify** (add import + export)
- `drizzle/` — **Modify** (generated migration)

**Schema** (from design):
```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { projects } from './projects';

export const deployCommands = sqliteTable('deploy_commands', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  commandType: text('command_type', { enum: ['install', 'build', 'restart'] }).notNull(),
  label: text('label').notNull(),
  command: text('command').notNull(),
  sortOrder: integer('sort_order').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});
```

**Unique constraint**: `(project_id, command_type, sort_order)` — use `drizzle-orm` `uniqueIndex` or `unique` compositor.

**Implementation notes**:
- Use `crypto.randomUUID()` for ID generation (project convention), NOT nanoid (the proposal was aspirational; all existing repos use `crypto.randomUUID()`)
- Add FK with `onDelete: 'cascade'` so deleting a project removes its deploy commands
- Export from `schema/index.ts`
- Generate migration with `npx drizzle-kit generate`

**Verification**:
- [x] Table exports correctly from `schema/index.ts`
- [x] Migration file created in `drizzle/`
- [x] Columns match spec (id, project_id, command_type, label, command, sort_order, created_at)
- [x] Unique constraint on (project_id, command_type, sort_order) present

**Lines**: ~30 new

---

### T2 — Define domain types

**Description**: Create the domain types and repository interface for deploy configuration.

**Files**:
- `src/lib/deploy-config/deploy-config.types.ts` — **Create**

**Types**:
```ts
export type CommandType = 'install' | 'build' | 'restart';

export interface DeployCommand {
  id: string;
  projectId: string;
  commandType: CommandType;
  label: string;
  command: string;
  sortOrder: number;
  createdAt: Date;
}

export interface DeployConfig {
  install: DeployCommand[];
  build: DeployCommand[];
  restart: DeployCommand[];
}

export interface IDeployConfigRepository {
  getByProjectId(projectId: string): Promise<DeployCommand[]>;
  getByType(projectId: string, commandType: CommandType): Promise<DeployCommand[]>;
  create(cmd: Omit<DeployCommand, 'id' | 'createdAt'>): Promise<DeployCommand>;
  update(id: string, data: Partial<Omit<DeployCommand, 'id' | 'createdAt'>>): Promise<DeployCommand>;
  delete(id: string): Promise<void>;
  deleteAllForProject(projectId: string): Promise<void>;
}
```

**Verification**:
- [x] Types compile cleanly with `tsc --noEmit`
- [x] `CommandType` is union of exactly `'install' | 'build' | 'restart'`
- [x] `DeployConfig` groups commands by type
- [x] Repository interface covers all CRUD operations from spec

**Lines**: ~50 new

---

### T3 — Implement DeployConfigRepository

**Description**: Drizzle-based CRUD repository for `deploy_commands`, consistent with existing repo pattern (cf. `env-var-repository.impl.ts`).

**Files**:
- `src/lib/db/repositories/deploy-config-repository.impl.ts` — **Create**

**Implementation notes**:
- `getByProjectId`: `db.query.deployCommands.findMany({ where: eq(deployCommands.projectId, projectId), orderBy: [deployCommands.commandType, deployCommands.sortOrder] })`
- `getByType`: Same but filtered by both `projectId` and `commandType`
- `create`: Insert with `id: crypto.randomUUID()`, return created
- `update`: `db.update(deployCommands).set(data).where(eq(deployCommands.id, id)).returning()`
- `delete`: `db.delete(deployCommands).where(eq(deployCommands.id, id))` or `db.delete(deployCommands).where(eq(deployCommands.projectId, projectId))`
- Follow `EnvVarRepository` pattern (no separate interface file — interfaces live in domain types)
- Import from `$lib/db/db` for backward compatibility

**Verification**:
- [x] All methods from `IDeployConfigRepository` implemented
- [x] Ordering correct: `(command_type ASC, sort_order ASC)`
- [x] Empty project returns `[]` without error
- [x] Missing ID returns empty result, doesn't throw

**Lines**: ~80 new (plus ~10 for db.ts import stabilization)

---

## Phase 2: Service + API + Deploy Integration

### T4 — Implement DeployConfigService

**Description**: Business logic layer wrapping the repository with validation and grouping logic.

**Files**:
- `src/lib/deploy-config/deploy-config.service.ts` — **Create**

**Methods**:
| Method | Signature | Behavior |
|--------|-----------|----------|
| `getConfig` | `(projectId: string) => Promise<DeployConfig>` | Returns commands grouped by type — `{ install: [...], build: [...], restart: [...] }` |
| `saveCommand` | `(payload: { project_id, command_type, label, command }) => Promise<DeployCommand>` | Validate, enforce singleton for install/build, insert restart with auto-sort_order |
| `deleteCommand` | `(id: string) => Promise<void>` | Delete by ID |

**Validation rules** (saveCommand):
1. Load project from `PM2Repository.describe()` — if not found, throw "Project not found"
2. Trim `label` and `command`
3. `label`: 1-100 chars required
4. `command`: 1-2000 chars required
5. Disallowed characters regex test: `/[\|;&$()` + "`" + `<>]/.test(command)` — OR more precisely test for patterns: `;`, `|`, `&&`, `||`, `$()`, backtick, `>`, `<`, trailing `&`
6. If `command_type === 'install' || 'build'`: check existing → if found, REPLACE (update in place)
7. If `command_type === 'restart'`: auto-assign `sort_order = max + 1`

**Validation error messages** (from spec):
- "Label is required"
- "Command is required"
- "Command contains disallowed characters"
- "Project not found"
- "Label must be 100 characters or fewer"
- "Command must be 2000 characters or fewer"

**Constructor**: Takes `IDeployConfigRepository` and `IPM2Repository` (for project existence check).

**Verification**:
- [x] `getConfig` returns empty groups for projects with no config
- [x] `saveCommand` rejects empty label/command
- [x] `saveCommand` rejects shell metacharacters
- [x] `saveCommand` replaces install/build, appends restart
- [x] `saveCommand` throws "Project not found" for nonexistent project
- [x] `deleteCommand` silently succeeds for unknown ID
- [x] `getConfig` groups correctly by type ordered by sort_order

**Lines**: ~120 new

---

### T5 — Create API endpoints for deploy config

**Description**: REST API for deploy command CRUD.

**Files**:
- `src/routes/api/deploy-config/[pmId]/+server.ts` — **Create** (GET by project)
- `src/routes/api/deploy-config/+server.ts` — **Create** (POST create, DELETE)

**Route design** (following SvelteKit conventions, per design doc):

| Method | Route | Handler |
|--------|-------|---------|
| `GET` | `/api/deploy-config/[pmId]` | `DeployConfigService.getConfig(pmId)` |
| `POST` | `/api/deploy-config` | Create command via `DeployConfigService.saveCommand()` |
| `DELETE` | `/api/deploy-config/[id]` | Delete command via `DeployConfigService.deleteCommand(id)` |

Wait — the design says `DELETE /api/deploy-config/[id]` but that conflicts with the `[pmId]` param in the same level. Let me reconsider the routing:

Better SvelteKit routing:
- `GET /api/deploy-config/[pmId]/+server.ts` — get config for project
- `POST /api/deploy-config/+server.ts` — create command (body has `project_id`, so no route param needed)
- `DELETE /api/deploy-config/[id]/+server.ts` — delete by command ID

This avoids route param conflicts. The design's file list says:
- `src/routes/api/deploy-config/[pmId]/+server.ts`
- `src/routes/api/deploy-config/+server.ts`

But `DELETE /api/deploy-config/{id}` needs a different route. Let me use:

- `GET /api/deploy-config/[pmId]/+server.ts` — get config
- `POST /api/deploy-config/+server.ts` — create command
- `DELETE /api/deploy-config/[id]/+server.ts` — delete command

This matches the SvelteKit file-based routing for `DELETE /api/deploy-config/{id}`.

**Auth**: Every endpoint checks session auth — return 401 if unauthenticated, 403 if wrong project owner.

**Request/Response** (from spec):

**GET /api/deploy-config/[pmId]**
```json
// Response 200
{ "install": [...], "build": [...], "restart": [...] }
```

**POST /api/deploy-config**
```json
// Request
{ "project_id": "...", "command_type": "restart", "label": "Restart API", "command": "pm2 restart api --update-env" }
// Response 201
{ "success": true, "data": { "id": "...", ... } }
// Response 400
{ "error": "Label is required" }
```

**DELETE /api/deploy-config/[id]**
```json
// Response 200
{ "success": true }
// Response 404
{ "error": "Command not found" }
```

**Implementation notes**:
- Instantiate `DeployConfigService` in each handler (service factory not yet wired — that's T7)
- Use `zod` for request validation (consistent with existing deploy endpoint)
- Error format: `{ "error": "message" }` with appropriate status codes

**Verification**:
- [x] GET returns grouped config for valid project ID
- [x] POST creates command and returns it with 201
- [x] DELETE removes command and returns 200
- [x] Unauthenticated returns 401
- [x] Invalid body returns 400 with validation error
- [x] Nonexistent resource returns 404

**Lines**: ~130 new

---

### T6 — Add DeployOptions type + DeployService refactor

**Description**: Add `DeployOptions` interface to deploy types and update `DeployService.deploy()` (and `approveAndContinue()`) to accept optional command overrides.

**Files**:
- `src/lib/deploy/deploy.types.ts` — **Modify** (add types)
- `src/lib/deploy/deploy.service.ts` — **Modify** (add options parameter, override behavior)

**Type additions** (in `deploy.types.ts`):
```ts
export interface DeployOptions {
  installCommand?: string;
  buildCommand?: string;
  restartCommands?: string[];
}
```

**DeployService changes**:
1. `deploy(pmId, onLog, options?: DeployOptions)`: new optional third param
2. When `options.installCommand` is set: replace `runInstallCommand(...)` with custom command
   - Parse: first token = bin, rest = args (white-space split)
   - Pass to `runCommand(cwd, bin, args, onLine)`
3. When `options.buildCommand` is set: same approach for build step; bypass "has build script" check
4. When `options.restartCommands` is set:
   - Skip the single `pm2 restart` call
   - Instead iterate over `options.restartCommands` array, calling `runCommand` for each
   - Each command is wrapped in its own `runStep` call (sub-step within restart)
   - Log format: `─── Restart command: pm2 restart api --update-env ───`
   - If any fails with non-zero exit, set step.failed and break
5. When `restartCommands` is `[]`: skip restart step, log "Skipped: no restart commands selected", push success result
6. When `options` is `undefined` or omitted: current behavior preserved exactly

**Log output** for custom commands (from spec):
```
─── Starting: install (custom) ───
─── Running: pnpm install --frozen-lockfile ───
```

**Security**: No shell metacharacter check needed here — validation is done at the API boundary (T5). This is defense-in-depth: commands run through `runCommand()` with `shell: false` already.

**`approveAndContinue`**: Also add optional `DeployOptions` param. Apply same override logic.

**Verification**:
- [x] `deploy()` signature accepts third param without breaking existing callers
- [x] Custom install command runs instead of auto-detected
- [x] Custom build command runs even without build script in package.json
- [x] Multiple restart commands execute in sequence
- [x] Empty restartCommands skips restart step
- [x] No options = identical current behavior

**Lines**: ~90 modified

---

### T7 — Wire DeployConfigService into service factory

**Description**: Register `DeployConfigService` and its dependencies in the service container.

**Files**:
- `src/lib/services/factory.ts` — **Modify**

**Changes**:
- Import `DeployConfigService` from `$lib/deploy-config/deploy-config.service`
- Import `DeployConfigRepository` from `$lib/db/repositories/deploy-config-repository.impl`
- Add `deployConfigService: DeployConfigService` to `ServiceContainer` interface
- Instantiate in `createServices()`:
  ```ts
  const deployConfigRepo = new DeployConfigRepository();
  const deployConfigService = new DeployConfigService(deployConfigRepo, pm2Repo);
  ```

**Verification**:
- [x] `ServiceContainer` includes `deployConfigService`
- [x] `createServices()` returns container with `deployConfigService` initialized
- [x] No circular dependencies introduced

**Lines**: ~15 modified

---

### T8 — Update deploy API endpoint to accept command overrides

**Description**: Modify the POST `/api/deploy` handler to accept `installCommand`, `buildCommand`, and `restartCommandIds` in the request body. Resolve `restartCommandIds` to command strings.

**Files**:
- `src/routes/api/deploy/+server.ts` — **Modify**

**Changes**:
1. Extend `deploySchema`:
   ```ts
   const deploySchema = z.object({
     pm_id: z.string().min(1),
     restartCommandIds: z.array(z.string()).optional(),
     installCommand: z.string().optional(),
     buildCommand: z.string().optional(),
   });
   ```
2. Before deploy, if `restartCommandIds` is present:
   - Fetch commands from `DeployConfigService`... wait, the API handler currently creates `DeployService` directly without going through the factory. Let me re-examine.

Currently the deploy API creates its own `PM2Repository` and `DeployService`:
```ts
const pm2Repo = new PM2Repository();
const deployService = new DeployService(pm2Repo);
```

So I need to resolve `restartCommandIds` here. Options:
- Option A: Import `DeployConfigRepository` directly in the handler
- Option B: Import `DeployConfigService` (but it needs factory)
- Option C: Create a simple helper function

Given the API handler is already somewhat isolated and creates its own instances, I'll use Option A — import `DeployConfigRepository` and resolve IDs directly in the handler. This keeps the refactor minimal.

**Resolution logic**:
```ts
if (restartCommandIds && restartCommandIds.length > 0) {
  const deployConfigRepo = new DeployConfigRepository();
  const commands = await deployConfigRepo.getByProjectId(pm_id);
  const selectedCommands = commands.filter(c => restartCommandIds.includes(c.id));
  if (selectedCommands.length !== restartCommandIds.length) {
    return json({ error: "One or more restart command IDs are invalid" }, { status: 400 });
  }
  // Verify all belong to this project (already filtered by getByProjectId)
  restartCommands = selectedCommands.sort((a, b) => a.sortOrder - b.sortOrder).map(c => c.command);
}
```

Then pass to `DeployService.deploy(pm_id, ..., { installCommand, buildCommand, restartCommands })`.

**Verification**:
- [x] Updated schema validates `restartCommandIds`, `installCommand`, `buildCommand`
- [x] Invalid `restartCommandIds` returns 400
- [x] Valid IDs resolve to command strings in sort_order order
- [x] Missing field = backward compatible (no overrides)
- [x] DeployService receives the resolved overrides

**Lines**: ~60 modified

---

### T9 — Load deploy config in project page server load

**Description**: Fetch deploy config in the server load function and pass to the page component.

**Files**:
- `src/routes/(app)/projects/[id]/+page.server.ts` — **Modify**

**Changes**:
1. Import `DeployConfigService` and `DeployConfigRepository`
2. Create service instance, call `getConfig(id)` 
3. Return `deployConfig` in the load return object

```ts
const deployConfigRepo = new DeployConfigRepository();
const deployConfigService = new DeployConfigService(deployConfigRepo, pm2Service...); // needs PM2Repository
```

Wait — `DeployConfigService` needs `PM2Repository` (for project existence check). But the page load uses `PM2Service`, not `PM2Repository` directly. Let me check: `PM2Service` wraps `PM2Repository`. The service needs `IPM2Repository` (the describe method).

I'll import `PM2Repository` and pass it. Or better: just pass `pm2Service` since `DeployConfigService` only needs `describe()`. But `DeployConfigService`'s constructor takes `IDeployConfigRepository` and `IPM2Repository`. The `PM2Service` doesn't implement `IPM2Repository` directly. Let me check...

`PM2Service` has a `getProcessById(id)` method. It doesn't implement `IPM2Repository`. So I do need to pass either `PM2Repository` or just load the deploy config differently.

Actually, for the page load I just need to show the config. I could either:
1. Directly use `DeployConfigRepository` in the load function (no service needed for read-only)
2. Use `DeployConfigService.getConfig()` which internally validates nothing (just groups and returns)

Option 1 is simpler and avoids the circular dependency. Let me use:

```ts
import { DeployConfigRepository } from '$lib/db/repositories/deploy-config-repository.impl';
// In load:
const repo = new DeployConfigRepository();
const commands = await repo.getByProjectId(id);
// Group them client-side or return raw array
```

Actually, let me just return the raw array from the repo, and let the page component handle grouping. That avoids importing the service in the page load, keeping it simple.

**Verification**:
- [x] `deployConfig` available in `PageData`
- [x] Returns grouped or raw commands (client groups them)

**Lines**: ~15 modified

---

## Phase 3: Frontend — Tab System + Configuration UI

### T10 — Extract tab system to config-driven array

**Description**: Replace the inline `{#each ["overview", "logs", "env", "sharing"]}` with a `TABS` const array of `{ id, label }` objects.

**Files**:
- `src/routes/(app)/projects/[id]/+page.svelte` — **Modify**

**Before** (current):
```svelte
{#each ["overview", "logs", "env", "sharing"] as tab}
  <button ...>
    {tab === "env" ? "Environment" : tab === "sharing" ? "Sharing" : tab.charAt(0).toUpperCase() + tab.slice(1)}
  </button>
{/each}
```

**After**:
```svelte
<script>
  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'logs', label: 'Logs' },
    { id: 'env', label: 'Environment' },
    { id: 'sharing', label: 'Sharing' },
  ] as const;
</script>

{#each TABS as tab}
  <button
    class="px-md py-sm text-caption font-medium transition-colors border-b-2"
    style="border-color: {activeTab === tab.id ? '#38CDFF' : 'transparent'}; color: {activeTab === tab.id ? '#38CDFF' : 'var(--text-muted)'};"
    onclick={() => (activeTab = tab.id)}
  >
    {tab.label}
  </button>
{/each}
```

**Tab content** — replace `{#if activeTab === "overview"}` chain with `{#if activeTab === tab.id}` — but keep the `{#if}/{:else if}` chain structure since each tab has different content. The `{#key activeTab}` wrapper stays for DOM reset on switch.

**Implementation notes**:
- The `TABS` array is in `<script>` (module-level would cause SSR issues for non-serializable data)
- Tab content blocks remain as `{#if activeTab === 'overview'}...{:else if activeTab === 'logs'}...` etc.
- Add `'config'` tab entry to `TABS` — its content will be added in T10 (or should it be here?)
- Actually: add the `config` tab here with placeholder content or an empty `{#if}` block. Final content in T10.

**Verification**:
- [x] Tab buttons use `{#each TABS}` with `tab.id` and `tab.label`
- [x] No inline ternary chains for tab labels
- [x] `{#key activeTab}` preserved for DOM reset
- [x] Tab content uses `{#if activeTab === tab.id}` pattern
- [x] Adding a new tab = appending one object to TABS + adding one `{#if}` block
- [x] "Configuration" tab visible in the tab bar

**Lines**: ~40 modified

---

### T11 — Build DeployConfigForm component

**Description**: The Configuration tab content component with three sections (Install, Build, Restart commands).

**Files**:
- `src/lib/ui/components/deploy-config-form.svelte` — **Create**

**Component structure**:

```
DeployConfigForm
  ├─ Install Command section
  │   ├─ No command placeholder + "Add" button
  │   └─ OR: command display (label, command, Edit, Delete)
  ├─ Build Command section
  │   ├─ No command placeholder + "Add" button
  │   └─ OR: command display (label, command, Edit, Delete)
  └─ Restart Commands section
      ├─ No commands placeholder + "Add" button
      └─ OR: command list (sort_order, up/down arrows, label, command, Edit, Delete)
```

**Props**:
```ts
let {
  projectId,
  initialConfig,  // DeployConfig
}: {
  projectId: string;
  initialConfig: DeployConfig;
} = $props();
```

**Features per section**:

**Add/Edit form** (inline, not modal):
- Label input (required, max 100 chars)
- Command input (required, max 2000 chars, monospace font)
- Save button (POST/PUT to API)
- Cancel button (closes form)
- Inline validation errors below each field
- Server error banner at top

**Display mode** (when command exists):
- Command label (bold)
- Command string (monospace, truncate > 80 chars, tooltip for full text)
- Edit button (opens form pre-filled)
- Delete button (with confirmation dialog)

**Restart section extra**:
- Commands in `sort_order` order
- Up/down reorder arrows (disabled at boundaries)
- Reorder: optimistic update via PUT with `sort_order` swap, rollback on error

**Implementation notes**:
- All API calls to `/api/deploy-config/...`
- Client-side validation mirrors server rules (same disallowed chars)
- Use `FeedbackBanner` for server errors
- Use existing `ConfirmDeleteModal` pattern for delete confirmation
- Reorder: for simplicity, send PUT with new `sort_order` for both commands being swapped

**Verification**:
- [x] Three sections render with correct labels
- [x] Add form validates input client-side before sending
- [x] Save creates/updates command and refreshes list
- [x] Delete removes command after confirmation
- [x] Edit form pre-fills with existing values
- [x] Restart commands have reorder arrows
- [x] Reorder updates work and rollback on failure
- [x] Inline errors shown for invalid input
- [x] Server errors shown as banner

**Lines**: ~280 new

---

### T12 — Build CommandSelector component

**Description**: Checkbox list of restart commands shown in the deploy modal as a pre-flight selection step.

**Files**:
- `src/lib/ui/components/command-selector.svelte` — **Create**

**Props**:
```ts
let {
  commands,         // restart commands from DeployConfig
  onSelect,         // callback with selected command IDs
  onCancel,
}: {
  commands: DeployCommand[];
  onSelect: (selectedIds: string[]) => void;
  onCancel: () => void;
} = $props();
```

**UI**:
- Title: "Select restart commands"
- Subtitle: "Choose which processes to restart during this deploy"
- Checkbox list (one per command, all checked by default)
- Each row: checkbox + label (bold) + command string (monospace, truncated)
- "Deploy" button (disabled if no commands selected)
- "Cancel" button

**Implementation notes**:
- Pure presentational component — no API calls
- Manages local selection state with $state
- Calls `onSelect(selectedIds)` on deploy confirmation

**Verification**:
- [x] Lists all restart commands with labels
- [x] All checkboxes checked by default
- [x] Deploy button disabled when none selected
- [x] Cancel calls `onCancel`
- [x] Confirmed deploy calls `onSelect` with selected IDs

**Lines**: ~100 new

---

### T13 — Update DeployModal with command selection step

**Description**: Modify the deploy modal to fetch deploy config on open and conditionally show a command selection step before deploying.

**Files**:
- `src/lib/ui/components/deploy-modal.svelte` — **Modify**

**Changes**:
1. Add new state variables:
   ```ts
   let view: 'loading' | 'selecting' | 'deploying' = $state('deploying');
   let deployConfig: DeployConfig | null = $state(null);
   let selectedCommandIds = $state<string[]>([]);
   ```

2. On modal open:
   - Set `view = 'loading'`
   - Fetch `GET /api/deploy-config/[pmId]`
   - If `restart.length >= 2`: `view = 'selecting'` (wait for user)
   - Else: set `view = 'deploying'`, call `startDeploy()` immediately
   - Include `installCommand` and `buildCommand` in deploy API request if they exist

3. When in `'selecting'` view:
   - Render `<CommandSelector>` with restart commands
   - On `onSelect`: store `selectedCommandIds`, set `view = 'deploying'`, call deploy with selection
   - On `onCancel`: close modal normally

4. Deploy API request body becomes:
   ```ts
   body: JSON.stringify({
     pm_id: pmId,
     ...(installCommand && { installCommand }),
     ...(buildCommand && { buildCommand }),
     ...(selectedCommandIds.length > 0 && { restartCommandIds: selectedCommandIds }),
   })
   ```

5. Loading state: show "Loading deploy configuration..." in the modal body

**Deploy flow chart**:
```
Modal opens →
  Loading config...
  │
  ├─ 0-1 restart commands → Deploy immediately (current behavior)
  │
  └─ 2+ restart commands → Show CommandSelector
       ├─ User selects + clicks Deploy → Deploy with selection
       └─ User clicks Cancel → Close modal
```

**Implementation notes**:
- `startDeploy()` params need to be adjustable — refactor to pass overrides to the fetch call
- Keep existing deploy log view unchanged
- The modal lifecycle: open → (maybe selecting) → deploying → done

**Verification**:
- [x] Modal fetches deploy config on open
- [x] Loading state shows while fetching
- [x] 0-1 restart commands: immediate deploy (backward compatible)
- [x] 2+ restart commands: selection step shown
- [x] Selected commands passed to API on deploy
- [x] No config (404 or empty): uses defaults
- [x] Cancel on selection step closes modal

**Lines**: ~100 modified

---

## Phase 4: Testing

### T14 — Unit tests

**Description**: Vitest unit tests for the repository, service, and DeployService refactor.

**Files**:
- `src/tests/deploy-config/repository.test.ts` — **Create**
- `src/tests/deploy-config/service.test.ts` — **Create**
- Existing DeployService test file — **Create or extend**

**Repository tests**:
- CRUD operations
- Ordering by (command_type, sort_order)
- Empty project returns []
- Non-existent ID returns gracefully

**Service tests**:
- `getConfig` grouping
- `saveCommand` validation (empty label, empty command, disallowed chars, length limits)
- `saveCommand` replaces install/build, appends restart
- `saveCommand` throws on nonexistent project
- `deleteCommand` works

**DeployService tests (options)**:
- When options not provided: default behavior preserved
- Custom install command overrides auto-detect
- Custom build command bypasses build script check
- Multiple restart commands run in sequence
- Empty restartCommands skips step
- `undefined` options = same as no third argument

**Verification**:
- [x] All tests pass with `vitest run`
- [x] Coverage of all scenarios from specs

**Lines**: ~250 new

### T15 — Integration tests

**Description**: API endpoint integration tests using SvelteKit's test utilities.

**Files**:
- `src/tests/deploy-config/api.test.ts` — **Create**

**Test cases**:
- GET returns grouped config
- POST creates command
- DELETE removes command
- 401 for unauthenticated
- 400 for invalid body
- Auth checks (project ownership)

**Verification**:
- [x] All tests pass
- [x] Error responses match spec format

**Lines**: ~120 new

---

## Review Workload Forecast

### Total Changed Lines Estimate

| File | Action | Lines |
|------|--------|-------|
| `src/lib/db/schema/deploy-commands.ts` | Create | 30 |
| `src/lib/db/schema/index.ts` | Modify | 2 |
| `drizzle/*.sql` | Generate | 20 |
| `src/lib/deploy-config/deploy-config.types.ts` | Create | 50 |
| `src/lib/db/repositories/deploy-config-repository.impl.ts` | Create | 80 |
| `src/lib/deploy-config/deploy-config.service.ts` | Create | 120 |
| `src/routes/api/deploy-config/[pmId]/+server.ts` | Create | 40 |
| `src/routes/api/deploy-config/+server.ts` | Create | 50 |
| `src/routes/api/deploy-config/[id]/+server.ts` | Create | 40 |
| `src/lib/deploy/deploy.types.ts` | Modify | 10 |
| `src/lib/deploy/deploy.service.ts` | Modify | 90 |
| `src/lib/services/factory.ts` | Modify | 15 |
| `src/routes/api/deploy/+server.ts` | Modify | 60 |
| `src/routes/(app)/projects/[id]/+page.server.ts` | Modify | 15 |
| `src/routes/(app)/projects/[id]/+page.svelte` | Modify | 40 |
| `src/lib/ui/components/deploy-config-form.svelte` | Create | 280 |
| `src/lib/ui/components/command-selector.svelte` | Create | 100 |
| `src/lib/ui/components/deploy-modal.svelte` | Modify | 100 |
| Tests (3 files) | Create | 370 |
| **Total** | | **~1,512** |

### Chained PRs Recommended: Yes

The estimated total changed lines (~1,512) exceeds the review budget of 800 lines by nearly 2x.

**Recommended split into 3 chained PRs:**

| PR | Focus | Files | Est. Lines | Dependencies |
|----|-------|-------|------------|--------------|
| **PR 1 — Foundation** | Schema + types + repository + service + API + factory + migration | 8 files | ~440 | None |
| **PR 2 — Deploy Integration + Tab Extraction** | DeployService refactor + deploy API changes + page server load + tab extraction + DeployConfigForm | 6 files | ~500 | Depends on PR 1 |
| **PR 3 — Command Selection + Tests** | CommandSelector + DeployModal + all tests | 5 files | ~570 | Depends on PR 1, PR 2 |

Each PR stays under or near the 800-line budget and is independently verifiable:
- **PR 1**: Config CRUD works through API. Test via curl/HTTP.
- **PR 2**: Deploy with overrides + configuration tab renders. Test via UI.
- **PR 3**: Deploy command selection works end-to-end. Test via UI + automated tests.

### Key Risks

| Risk | Mitigation |
|------|------------|
| Tab extraction breaks existing tabs on same page | `{#key activeTab}` preserved; `{#if}` chain semantics unchanged; verify each tab renders identically after extraction |
| DeployService.options backward compatibility broken | Options param is `?` optional; compile-time check + existing callers pass no third arg |
| Command validation too restrictive (false positives) | Allowlist in specs is explicit; test that allowed patterns (`--flag`, `:`, `.`, `=`) pass validation |
| DeployModal complexity increase with selection step | CommandSelector is an isolated component; modal delegates to it; no existing deploy logic removed |
