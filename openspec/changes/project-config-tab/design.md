# Design: Project Configuration Tab

## Technical Approach

Per-project deploy command overrides stored in a new `deploy_commands` table. The deploy modal gains a pre-flight selection step when multiple restart commands exist. The tab system on the project detail page is extracted from inline `{#if}` chain into a config-driven array. All changes are backward-compatible — existing projects without config use the current hardcoded pipeline.

## Architecture Decisions

### Decision: Store commands as full shell strings, not structured args

**Choice**: Each `deploy_commands` row stores the complete shell command string (e.g., `pm2 restart api --update-env`).

**Alternatives considered**: Store `{bin, args[]}` separately to enforce structure. Would make the UI form simpler but prevent users from using pipes, redirects, or compound commands.

**Rationale**: Users legitimately need compound commands (e.g., `pm2 restart api && pm2 restart worker`). Restricting to single-binary invocations would be a regression. Validation at save time (allowlist of safe chars) prevents injection while preserving flexibility.

### Decision: Config-driven tab array

**Choice**: Replace the inline `{#each ["overview", "logs", "env", "sharing"]}` array with a `TABS` const and a content snippet map.

**Rationale**: Adding the "Configuration" tab currently requires touching 4 places (array, each loop, each+class, each+onclick). Extracting to a config array means adding a tab = appending one object. The `{@key activeTab}` DOM reset is preserved.

### Decision: DeployConfigRepository lives in `lib/db/repositories/`

**Choice**: Repository implementation in `lib/db/repositories/`, consistent with `EnvVarRepository`, `MetricsRepository`, etc.

**Rationale**: All other repositories follow this path. The factory does not inject repositories (only services), so no factory change needed for read-only CRUD.

## Data Flow

```
DeployModal (client)
  ├─ GET /api/deploy-config/[pmId]  ──→ DeployConfigService.getConfig()
  │                                            └─→ DeployConfigRepository.getByProjectId()
  └─ POST /api/deploy               ──→ DeployService.deploy(pmId, options?)
                                              ├─ options.installCommand? → runInstall override
                                              ├─ options.buildCommand?  → runBuild override
                                              └─ options.restartCommands? → replace restart step
```

```
Configuration Tab (client)
  ├─ GET /api/deploy-config/[pmId]  ──→ DeployConfigService.getConfig()
  ├─ POST /api/deploy-config        ──→ DeployConfigService.saveCommand()
  └─ DELETE /api/deploy-config/[id] ──→ DeployConfigService.deleteCommand()
```

## Database Schema

```typescript
// src/lib/db/schema/deploy-commands.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { projects } from './projects';

export const deployCommands = sqliteTable('deploy_commands', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  commandType: text('command_type', { enum: ['install', 'build', 'restart'] }).notNull(),
  label: text('label').notNull(),          // human-readable e.g. "Restart API"
  command: text('command').notNull(),      // full shell string
  sortOrder: integer('sort_order').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Unique: (project_id, command_type, sort_order)
```

## Interfaces / Contracts

```typescript
// src/lib/deploy-config/deploy-config.types.ts
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
  create(cmd: Omit<DeployCommand, 'id' | 'createdAt'>): Promise<DeployCommand>;
  update(id: string, data: Partial<Omit<DeployCommand, 'id' | 'createdAt'>>): Promise<DeployCommand>;
  delete(id: string): Promise<void>;
  deleteAllForProject(projectId: string): Promise<void>;
}

// src/lib/deploy/deploy.types.ts (additions)
export interface DeployOptions {
  installCommand?: string;
  buildCommand?: string;
  restartCommands?: string[];  // array of command strings, executed in order
}
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/db/schema/deploy-commands.ts` | Create | New table schema |
| `src/lib/db/schema/index.ts` | Modify | Export deployCommands |
| `src/lib/db/repositories/deploy-config-repository.impl.ts` | Create | Drizzle CRUD |
| `src/lib/deploy-config/deploy-config.types.ts` | Create | Domain types + interface |
| `src/lib/deploy-config/deploy-config.service.ts` | Create | Business logic |
| `src/lib/deploy/deploy.types.ts` | Modify | Add DeployOptions |
| `src/lib/deploy/deploy.service.ts` | Modify | Accept DeployOptions, run custom commands |
| `src/routes/api/deploy-config/[pmId]/+server.ts` | Create | GET deploy config for project |
| `src/routes/api/deploy-config/+server.ts` | Create | POST save command, DELETE by id |
| `src/routes/api/deploy/+server.ts` | Modify | Accept `restartCommands[]` in body |
| `src/routes/(app)/projects/[id]/+page.svelte` | Modify | Extract TABS config, add config tab |
| `src/routes/(app)/projects/[id]/+page.server.ts` | Modify | Load deploy config |
| `src/lib/ui/components/deploy-config-form.svelte` | Create | Configuration tab content |
| `src/lib/ui/components/command-selector.svelte` | Create | Restart command checkboxes for DeployModal |
| `src/lib/ui/components/deploy-modal.svelte` | Modify | Pre-flight selection step |
| `src/lib/services/factory.ts` | Modify | Add DeployConfigService |
| `drizzle/` (migration output) | Modify | New migration for deploy_commands table |

## DeployService Changes

The `deploy()` method signature becomes:
```typescript
async deploy(
  pmId: string,
  onLog: DeployLogCallback,
  options?: DeployOptions
): Promise<DeployResult>
```

When `options.installCommand` is set, replace the auto-detected install command with the provided string. Same for `buildCommand`. When `options.restartCommands` is set, replace the single `pm2 restart` step with one step per command string (in order).

The install/build override runs through `runCommand()` with `shell: false` — it takes `bin` and `args[]`, not a full shell string. The current `runInstallCommand` and `runBuild` switch on package manager. For overrides, parse the first space-separated token as bin, remainder as args, or use `bash -c` if a shell construct is detected.

**Security**: All user-supplied commands are validated with a allowlist regex before execution. Commands containing `;`, `|`, `&&`, `>`, `<` etc. are rejected at the API boundary (except `&&` for restart command chaining — user's explicit intent).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | DeployConfigRepository CRUD, command validation regex | Vitest |
| Unit | DeployService options override logic | Vitest — mock PM2Repo, pass options, assert correct commands run |
| Integration | Deploy config API endpoints | SuperTest against running SvelteKit |
| E2E | Full flow: add config → deploy with selection | Playwright |

## Migration / Rollout

1. Generate Drizzle migration: `npx drizzle-kit generate`
2. Run migration to create `deploy_commands` table
3. Deploy new code (backward compatible — no config = current behavior)
4. No data migration needed (no existing deploy config data)

## Open Questions

- [ ] Should `install` and `build` command types allow multiple entries, or only one override each? Proposal says one each, but multi-build (staging + production) is a real use case. Recommendation: allow multiple for all types; UI shows one-editor + list for all three.
- [ ] Command validation — allow `&&` for chaining restart commands (e.g., `pm2 restart api && pm2 restart worker`)? Current proposal does not address this. Recommend allowing `&&` only in restart type, rejected in install/build.