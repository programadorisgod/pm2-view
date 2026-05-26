# Specifications: project-config-tab

## Capability: `project-deploy-config`

Per-project deploy command CRUD — storage, validation, service layer, and Configuration tab UI for managing install/build/restart command overrides.

### Requirement: `deploy_commands` table

The system SHALL provide a `deploy_commands` table for storing per-project deploy command overrides.

#### Scenarios

**GIVEN** the database schema is migrated
**WHEN** a new deploy command record is created
**THEN** the record has fields:
- `id` — text primary key, generated via nanoid
- `project_id` — text, foreign key referencing `projects.id`, NOT NULL
- `command_type` — text, one of `'install' | 'build' | 'restart'`
- `label` — text, human-readable name (e.g., "Restart API server")
- `command` — text, full shell command (e.g., `pm2 restart api --update-env`)
- `sort_order` — integer, display and execution order within the same command type
- `created_at` — integer, unixepoch timestamp, defaults to current time
- Unique constraint on `(project_id, command_type, sort_order)`

**GIVEN** a project with ID `"proj-abc"`
**WHEN** a deploy command is inserted with `command_type='restart'`, `sort_order=1`
**AND** another is inserted with `command_type='restart'`, `sort_order=2`
**THEN** both records coexist (multiple restart commands per project are allowed)

**GIVEN** a deploy command record exists
**WHEN** the referenced project is deleted
**THEN** the deploy command record is cascade-deleted (FK with ON DELETE CASCADE)

---

### Requirement: DeployConfigRepository

The system SHALL provide a Drizzle-based repository for CRUD operations on `deploy_commands`.

#### Scenarios

**GIVEN** a valid `project_id`
**WHEN** `DeployConfigRepository.getByProject(projectId)` is called
**THEN** it returns all deploy commands for that project, ordered by `(command_type ASC, sort_order ASC)`

**GIVEN** a valid `project_id` and `command_type`
**WHEN** `DeployConfigRepository.getByType(projectId, commandType)` is called
**THEN** it returns only commands matching that type, ordered by `sort_order ASC`

**GIVEN** a valid command object with `project_id`, `command_type`, `label`, `command`, `sort_order`
**WHEN** `DeployConfigRepository.insert(command)` is called
**THEN** the record is created and returned with generated `id` and `created_at`

**GIVEN** an existing command ID and updated fields
**WHEN** `DeployConfigRepository.update(id, updates)` is called
**THEN** the record is updated and returned with new values

**GIVEN** an existing command ID
**WHEN** `DeployConfigRepository.delete(id)` is called
**THEN** the record is deleted and returns `{ deleted: true }`

**GIVEN** a `project_id` that does not exist
**WHEN** `DeployConfigRepository.getByProject(projectId)` is called
**THEN** it returns an empty array (no error)

---

### Requirement: DeployConfigService

The system SHALL provide a service layer wrapping the repository with validation and business logic.

#### Scenarios

**GIVEN** a valid `project_id`
**WHEN** `DeployConfigService.getConfig(projectId)` is called
**THEN** it returns commands grouped by type:
```ts
{
  install: DeployCommand[];  // 0-1 entries
  build: DeployCommand[];    // 0-1 entries
  restart: DeployCommand[];  // 0-N entries
}
```

**GIVEN** a project with no deploy commands
**WHEN** `DeployConfigService.getConfig(projectId)` is called
**THEN** it returns `{ install: [], build: [], restart: [] }`

**GIVEN** a valid command payload `{ project_id, command_type, label, command }`
**WHEN** `DeployConfigService.saveCommand(payload)` is called
**THEN**:
- If `command_type` is `'install'` or `'build'` and a command of that type already exists, the existing command is **replaced** (deleted then inserted, or updated in place) — only one install/build command per project is allowed
- If `command_type` is `'restart'`, the command is appended with `sort_order = max_existing_sort_order + 1`
- The `label` is trimmed and must be 1-100 characters
- The `command` is trimmed and must be 1-2000 characters
- The `command` must not contain shell metacharacters that would enable injection: `|`, `&&`, `||`, `;`, `$()`, backticks, `>`, `<`
- If validation fails, a descriptive error is thrown

**GIVEN** an existing command ID
**WHEN** `DeployConfigService.deleteCommand(id)` is called
**THEN** the command is deleted via the repository

**GIVEN** a `project_id` that does not exist
**WHEN** `DeployConfigService.saveCommand()` is called
**THEN** an error is thrown: "Project not found"

**GIVEN** a command with an empty or whitespace-only `label`
**WHEN** `DeployConfigService.saveCommand()` is called
**THEN** validation fails with error: "Label is required"

**GIVEN** a command with an empty or whitespace-only `command`
**WHEN** `DeployConfigService.saveCommand()` is called
**THEN** validation fails with error: "Command is required"

**GIVEN** a command containing `;` in the command string
**WHEN** `DeployConfigService.saveCommand()` is called
**THEN** validation fails with error: "Command contains disallowed characters"

---

### Requirement: Configuration Tab UI

The system SHALL provide a Configuration tab in the project detail page for managing deploy commands.

#### Scenarios

**GIVEN** the user is on a project detail page
**WHEN** the page renders
**THEN** a "Configuration" tab appears in the tab bar alongside Overview, Logs, Environment, and Sharing

**GIVEN** the tab system uses a config-driven array
**WHEN** the tab array is defined
**THEN** it follows this structure:
```ts
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'logs', label: 'Logs' },
  { id: 'env', label: 'Environment' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'config', label: 'Configuration' },
] as const;
```
- Tab rendering uses `{#each TABS as tab}` instead of a hardcoded array literal
- Tab labels use a lookup map (not inline ternary chains)
- Tab content uses `{#if activeTab === tab.id}` inside the `{#key activeTab}` block

**GIVEN** the user clicks the "Configuration" tab
**WHEN** the tab content renders
**THEN** it shows three sections:
1. **Install Command** — single command override (0 or 1)
2. **Build Command** — single command override (0 or 1)
3. **Restart Commands** — multiple commands (0 or more)

**GIVEN** the Configuration tab is active
**AND** the project has no deploy commands configured
**WHEN** the tab renders
**THEN** each section shows:
- A placeholder message: "No custom command configured"
- An "Add Command" button

**GIVEN** the Configuration tab is active
**AND** the project has an install command configured
**WHEN** the Install section renders
**THEN** it shows:
- The command label (bold)
- The command string (monospace, truncated if > 80 chars with tooltip for full text)
- An "Edit" button
- A "Delete" button (with confirmation)

**GIVEN** the user clicks "Add Command" in the Restart section
**WHEN** the add form appears
**THEN** it contains:
- Label input (text, required, max 100 chars)
- Command input (text, required, max 2000 chars)
- "Save" and "Cancel" buttons
- On save: validates input client-side (same rules as server), then POSTs to API
- On success: command appears in the list, form closes

**GIVEN** the user clicks "Edit" on an existing command
**WHEN** the edit form appears
**THEN** it pre-fills the label and command fields
- On save: PUTs to API with updated values
- On validation error: inline error message shown below the field

**GIVEN** the user clicks "Delete" on a command
**WHEN** a confirmation dialog appears
**THEN** it shows: "Delete this command? This cannot be undone."
- Confirm: DELETEs via API, command removed from list
- Cancel: dialog closes, no changes

**GIVEN** the user has multiple restart commands
**WHEN** the Restart section renders
**THEN** commands are displayed in `sort_order` order
- Each command has up/down reorder arrows (disabled at boundaries)
- Clicking up/down swaps `sort_order` with adjacent command via API
- Reorder is immediate (optimistic update, rollback on error)

**GIVEN** the user tries to save a command with invalid characters
**WHEN** client-side validation runs
**THEN** an inline error appears: "Command contains disallowed characters: ; | && ||"
- The save request is NOT sent to the server

**GIVEN** the API returns a validation error
**WHEN** the save fails
**THEN** the error message from the server is displayed inline
- The form remains open with user's input preserved

---

### Requirement: API endpoints for deploy config

The system SHALL provide REST-style API endpoints for deploy command CRUD.

#### Scenarios

**GIVEN** an authenticated request
**WHEN** `GET /api/deploy-config?project_id={id}` is called
**THEN** it returns:
```json
{
  "install": [{ "id": "...", "label": "...", "command": "...", "sort_order": 0 }],
  "build": [],
  "restart": [{ "id": "...", "label": "...", "command": "...", "sort_order": 1 }]
}
```

**GIVEN** an authenticated request with valid body
**WHEN** `POST /api/deploy-config` is called with:
```json
{ "project_id": "...", "command_type": "restart", "label": "...", "command": "..." }
```
**THEN** the command is created and returned:
```json
{ "success": true, "data": { "id": "...", ... } }
```

**GIVEN** an authenticated request with valid body
**WHEN** `PUT /api/deploy-config/{id}` is called with updated fields
**THEN** the command is updated and returned

**GIVEN** an authenticated request
**WHEN** `DELETE /api/deploy-config/{id}` is called
**THEN** the command is deleted and returns `{ success: true }`

**GIVEN** an unauthenticated request
**WHEN** any deploy-config endpoint is called
**THEN** it returns 401

**GIVEN** a request with invalid body (missing fields, bad command_type)
**WHEN** `POST /api/deploy-config` is called
**THEN** it returns 400 with validation error message

**GIVEN** a request with a `project_id` the user does not own
**WHEN** any deploy-config endpoint is called
**THEN** it returns 403

---

## Capability: `deploy-command-selection`

Deploy-time command selector — pre-flight UI in deploy modal and DeployService integration to run user-selected restart commands instead of hardcoded defaults.

### Requirement: DeployService accepts optional command overrides

The system SHALL allow `DeployService.deploy()` to accept optional command overrides while preserving backward compatibility.

#### Scenarios

**GIVEN** `DeployService.deploy(pmId, onLog)` is called with no third argument
**WHEN** the deploy executes
**THEN** it behaves identically to current behavior:
- Install: uses detected package manager (`pnpm install`, `bun install`, `npm install`)
- Build: uses detected package manager (`pnpm run build`, etc.) — only if build script exists
- Restart: runs `pm2 restart {processName} --update-env`
- This is the backward-compatibility guarantee

**GIVEN** `DeployService.deploy(pmId, onLog, options)` is called with:
```ts
{ installCommand: "pnpm install --frozen-lockfile" }
```
**WHEN** the install step executes
**THEN** it runs the provided `installCommand` instead of the auto-detected command
- The command is split into `[cmd, ...args]` and passed to `runCommand()` with `shell: false`
- Package manager detection is still performed (for logging and approval detection) but the actual install command is overridden

**GIVEN** `DeployService.deploy(pmId, onLog, options)` is called with:
```ts
{ buildCommand: "pnpm run build:prod" }
```
**WHEN** the build step executes
**THEN** it runs the provided `buildCommand` instead of the auto-detected command
- If `buildCommand` is provided, the "build script exists" check is bypassed — the command runs regardless

**GIVEN** `DeployService.deploy(pmId, onLog, options)` is called with:
```ts
{ restartCommands: ["pm2 restart api --update-env", "pm2 restart worker --update-env"] }
```
**WHEN** the restart step executes
**THEN** each command in `restartCommands` is executed sequentially:
- Each command is logged as a separate sub-step under the `restart` step
- If any restart command fails (non-zero exit), the deploy stops and reports failure at that sub-step
- If all restart commands succeed, the restart step succeeds

**GIVEN** `DeployService.deploy(pmId, onLog, options)` is called with:
```ts
{ restartCommands: [] }
```
**WHEN** the restart step executes
**THEN** the restart step is **skipped** with a log message: "Skipped: no restart commands selected"
- The step is marked as `success: true` (skipping restart is intentional)

**GIVEN** `DeployService.deploy(pmId, onLog, options)` is called with `options` that is `undefined`
**WHEN** the deploy executes
**THEN** all steps use defaults (backward compatible, same as no third argument)

---

### Requirement: DeployCommandSelection type

The system SHALL define types for deploy command selection.

#### Scenarios

**GIVEN** the deploy types module
**WHEN** new types are added
**THEN** they include:
```ts
export interface DeployOptions {
  installCommand?: string;
  buildCommand?: string;
  restartCommands?: string[];
}

export interface DeployCommandSelection {
  commandId: string;
  label: string;
  command: string;
}
```
- `DeployOptions` is added to `deploy.types.ts`
- `DeployCommandSelection` is used by the modal to track selected commands

---

### Requirement: Deploy modal command selection pre-flight

The system SHALL show a command selection step in the deploy modal when a project has multiple restart commands.

#### Scenarios

**GIVEN** the user clicks "Deploy" on a project
**WHEN** the DeployModal opens
**THEN** it first fetches the project's deploy config via `GET /api/deploy-config?project_id={projectId}`
- While fetching, a loading state is shown: "Loading deploy configuration..."

**GIVEN** the deploy config has been fetched
**AND** the project has 0 or 1 restart commands
**WHEN** the modal renders
**THEN** it proceeds directly to the deploy (current behavior — no selection step)

**GIVEN** the deploy config has been fetched
**AND** the project has 2 or more restart commands
**WHEN** the modal renders
**THEN** it shows a **command selection step** before deploying:
- Title: "Select restart commands"
- Subtitle: "Choose which processes to restart during this deploy"
- A list of checkboxes, one per restart command
- Each checkbox shows the command label and the command string (monospace, truncated)
- **All checkboxes are checked by default**
- A "Deploy" button (disabled if no commands selected)
- A "Cancel" button

**GIVEN** the command selection step is visible
**AND** the user unchecks all restart commands
**WHEN** the "Deploy" button state is evaluated
**THEN** it is disabled (at least one restart command must be selected)

**GIVEN** the command selection step is visible
**AND** the user has selected some restart commands
**WHEN** the user clicks "Deploy"
**THEN** the modal transitions to the deploy log view
- The selected command IDs are sent to the API: `{ pm_id: "...", restartCommandIds: ["id1", "id2"] }`
- The deploy begins with streaming logs

**GIVEN** the command selection step is visible
**AND** the user clicks "Cancel"
**WHEN** the cancel action executes
**THEN** the modal closes without starting a deploy

**GIVEN** the project has a custom install command configured
**WHEN** the deploy starts (after selection or immediately)
**THEN** the install command override is included in the API request body

**GIVEN** the project has a custom build command configured
**WHEN** the deploy starts (after selection or immediately)
**THEN** the build command override is included in the API request body

---

### Requirement: Deploy API accepts selected command IDs

The system SHALL accept restart command IDs in the deploy API request and resolve them to actual commands.

#### Scenarios

**GIVEN** a deploy API request with:
```json
{ "pm_id": "123", "restartCommandIds": ["dc-1", "dc-2"] }
```
**WHEN** the API handler processes the request
**THEN** it:
1. Validates `restartCommandIds` is an array of non-empty strings (optional field)
2. Fetches the corresponding `deploy_commands` records from the database
3. Verifies all commands belong to the same project as the PM2 process
4. Extracts the `command` field from each record, ordered by `sort_order`
5. Passes them as `restartCommands` to `DeployService.deploy()`

**GIVEN** a deploy API request with invalid `restartCommandIds` (IDs that don't exist)
**WHEN** the API handler processes the request
**THEN** it returns 400: "One or more restart command IDs are invalid"

**GIVEN** a deploy API request with `restartCommandIds` referencing commands from a different project
**WHEN** the API handler processes the request
**THEN** it returns 403: "Access denied to specified deploy commands"

**GIVEN** a deploy API request without `restartCommandIds`
**WHEN** the API handler processes the request
**THEN** it proceeds with default behavior (no restart command overrides)

**GIVEN** a deploy API request with `restartCommandIds: []`
**WHEN** the API handler processes the request
**THEN** it passes an empty `restartCommands` array to DeployService, which skips the restart step

**GIVEN** the updated deploy API schema
**WHEN** the request body is validated
**THEN** the schema accepts:
```ts
const deploySchema = z.object({
  pm_id: z.string().min(1, 'Process ID is required'),
  restartCommandIds: z.array(z.string()).optional(),
  installCommand: z.string().optional(),
  buildCommand: z.string().optional(),
});
```

---

### Requirement: DeployService.deploy() signature change

The system SHALL update the `deploy()` method signature to accept optional overrides.

#### Scenarios

**GIVEN** the current `deploy()` signature: `deploy(pmId: string, onLog: DeployLogCallback)`
**WHEN** the signature is updated
**THEN** the new signature is:
```ts
async deploy(
  pmId: string,
  onLog: DeployLogCallback,
  options?: DeployOptions,
): Promise<DeployResult>
```
- The third parameter is optional (`?`) to maintain backward compatibility
- All existing callers that pass only 2 arguments continue to work unchanged

**GIVEN** the `approveAndContinue()` method
**WHEN** it is updated for consistency
**THEN** it also accepts an optional `options?: DeployOptions` third parameter
- Same override behavior applies: install, build, restart commands can be overridden

---

### Requirement: Deploy log output for custom commands

The system SHALL clearly indicate when custom commands are being executed in the deploy log.

#### Scenarios

**GIVEN** a deploy is running with a custom install command
**WHEN** the install step starts
**THEN** the log shows:
```
─── Starting: install (custom) ───
─── Running: pnpm install --frozen-lockfile ───
```

**GIVEN** a deploy is running with custom restart commands
**WHEN** the restart step starts
**THEN** the log shows:
```
─── Starting: restart (3 commands selected) ───
─── Running: pm2 restart api --update-env ───
...
─── Running: pm2 restart worker --update-env ───
...
─── Completed: restart (exit 0) ───
```

**GIVEN** a deploy is running with the default (no overrides)
**WHEN** any step starts
**THEN** the log output is identical to current behavior (no "(custom)" suffix)

---

## Cross-Cutting Requirements

### Validation Rules

**Command character restrictions**
The following characters/patterns are disallowed in the `command` field:
- `;` (command separator)
- `|` (pipe)
- `&&` (AND chain)
- `||` (OR chain)
- `$()` (command substitution)
- `` ` `` (backtick command substitution)
- `>` (output redirect)
- `<` (input redirect)
- `&` at end of command (background execution)

Rationale: Commands are executed via `spawn()` with `shell: false`, which already prevents shell interpretation. These restrictions are a defense-in-depth measure against accidental shell injection if the execution method changes in the future.

**Allowed patterns** (these are common and SHOULD be allowed):
- `-` flags (e.g., `--update-env`, `--frozen-lockfile`)
- `.` in paths (e.g., `./node_modules/.bin/tsc`)
- `:` in paths (e.g., `pnpm run build:prod`)
- `=` in flags (e.g., `--env=production`)
- Spaces in arguments (the command is split by whitespace into args)
- `*` globs (passed literally to the command, not expanded by shell)

### Backward Compatibility

**Zero-regression guarantee**
Projects without any deploy commands configured SHALL deploy identically to the current behavior. The deploy flow, log output, and result are unchanged when:
- No `deploy_commands` records exist for the project
- The deploy modal is opened without `restartCommandIds`
- `DeployService.deploy()` is called without the `options` parameter

### Tab System Extraction

**Config-driven tabs**
The existing inline tab array `["overview", "logs", "env", "sharing"]` and the `{#if}/{@else if}` chain for tab labels SHALL be replaced with:
- A `TABS` constant array of `{ id, label }` objects
- A `{#each TABS as tab}` loop for rendering tab buttons
- A label lookup: `tab.label` directly (no ternary chains)
- Tab content still uses `{#if activeTab === tab.id}` inside `{#key activeTab}`
- The `{#key activeTab}` wrapper is preserved for DOM reset on tab switch

### Error Handling

**API error responses**
All deploy-config API endpoints return consistent error format:
```json
{ "error": "Human-readable error message" }
```
With appropriate HTTP status codes:
- 400: Validation error
- 401: Not authenticated
- 403: Not authorized (wrong project owner)
- 404: Resource not found
- 500: Internal server error

**Client-side error display**
- Inline validation errors appear below the relevant input field
- Server errors appear as a banner at the top of the Configuration tab
- Network errors (offline, timeout) show: "Connection failed. Please try again."
