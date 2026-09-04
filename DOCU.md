# PM2 View — Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Layer](#database-layer)
4. [Authentication](#authentication)
5. [Real-time Communication (SSE)](#real-time-communication-sse)
6. [Service Layer & DI](#service-layer--di)
7. [PM2 Integration](#pm2-integration)
8. [Process Error Alerts](#process-error-alerts)
9. [Rate Limiting](#rate-limiting)
10. [Pagination](#pagination)
11. [Logging](#logging)
12. [Security](#security)
13. [Teams](#teams)
14. [Favorites](#favorites)
15. [Roles & Permissions](#roles--permissions)
16. [Audit Module](#audit-module)
17. [Project Sharing](#project-sharing)
18. [Multi-process Groups](#multi-process-groups)
19. [Auto-deploy](#auto-deploy)
20. [Port Manager](#port-manager)
21. [Development](#development)
22. [Deployment](#deployment)

---

## Overview

PM2 View is a SvelteKit-based dashboard for monitoring and managing PM2 processes. It provides real-time visibility into CPU, memory, uptime, and logs, with a modern UI and pluggable architecture.

### Key Design Principles

- **Open/Closed**: Extend via registries, never modify existing code
- **Interface-first**: Contracts before implementations
- **Client/Server Split**: Clean separation of browser and Node.js code
- **Dependency Injection**: Centralized factory, no module-level singletons

---

## Architecture

### Layered Design

```
┌──────────────────────────────────────────────────────┐
│              Routes (SvelteKit)                       │
│  (app)/, (auth)/, api/                                │
├──────────────────────────────────────────────────────┤
│              Service Layer (DI)                       │
│  createServices() → PM2Service, MetricsService, etc.  │
├──────────────┬──────────────────┬─────────────────────┤
│  DB Factory  │  Auth Factory    │  SSE Manager        │
├──────────────┼──────────────────┼─────────────────────┤
│  libSQL      │  BetterAuth      │  Metrics Emitter    │
│  PostgreSQL  │  Lucia (future)  │  Status Watcher     │
└──────────────┴──────────────────┴─────────────────────┘
```

### Directory Structure

| Directory                  | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `src/lib/auth/`            | Authentication domain with pluggable providers                |
| `src/lib/db/`              | Database abstraction with dialect-agnostic drivers            |
| `src/lib/db/schema/`       | Drizzle schema definitions (projects, teams, favorites, etc.) |
| `src/lib/db/repositories/` | Data access implementations                                   |
| `src/lib/sse/`             | Server-Sent Events for real-time communication                |
| `src/lib/services/`        | Dependency injection factory                                  |
| `src/lib/logger/`          | Structured logging abstraction                                |
| `src/lib/rate-limiter/`    | In-memory rate limiting                                       |
| `src/lib/pagination/`      | Pagination types and helpers                                  |
| `src/lib/utils/`           | Shared utilities (status, format, validation, shell)          |

---

## Database Layer

### Architecture

The database layer uses a **driver pattern** with automatic dialect detection:

```
getDatabaseConfig() → detectDialect(url) → createDatabaseDriver() → db proxy
```

### Supported Dialects

| Dialect      | URL Pattern                            | Driver           |
| ------------ | -------------------------------------- | ---------------- |
| libSQL/Turso | `libsql://...`                         | `LibsqlDriver`   |
| PostgreSQL   | `postgres://...` or `postgresql://...` | `PostgresDriver` |
| Local SQLite | `file:...` or `:memory:`               | `LibsqlDriver`   |

### Adding a New Driver

1. Implement `DatabaseDriver` interface in `src/lib/db/drivers/`
2. Register a dialect rule in `src/lib/db/dialect-registry.ts`:
   ```typescript
   registerDialectRule({
     match: (url) => url.startsWith("mysql://"),
     dialect: "mysql",
   });
   ```
3. Add the driver to `DRIVER_MAP` in `src/lib/db/factory.ts`:
   ```typescript
   const DRIVER_MAP: Record<DatabaseDialect, (config) => DatabaseDriver> = {
     mysql: (config) => new MysqlDriver(config.url),
   };
   ```

### Schema Files

Schema files use Drizzle's dialect-agnostic column types (`text`, `integer`, etc.). Drizzle handles the translation at the driver level — no dialect-specific schema files needed.

---

## Authentication

### Architecture

```
AuthProvider interface → BetterAuthProvider (default) → auth.service.ts → routes
```

### Adding a New Provider

1. Implement `AuthProvider` interface:
   ```typescript
   export class MyAuthProvider implements AuthProvider {
     readonly name = 'my-auth';
     async login(email: string, password: string): Promise<AuthSession> { ... }
     async signup(email: string, password: string, name?: string): Promise<AuthSession> { ... }
     async logout(headers: Headers): Promise<void> { ... }
     async getSession(headers: Headers): Promise<AuthSession | null> { ... }
   }
   ```
2. Register in `src/lib/auth/factory.ts`:
   ```typescript
   registerAuthProvider("my-auth", () => new MyAuthProvider());
   ```

### Auth Types

The `AuthUser` and `AuthSession` types are **independent of Drizzle schema** — they're normalized interfaces that any provider must conform to.

---

## Real-time Communication (SSE)

### Why SSE over WebSockets?

| Feature               | SSE                     | WebSockets               |
| --------------------- | ----------------------- | ------------------------ |
| Direction             | Server → Client         | Bidirectional            |
| Browser API           | Native `EventSource`    | Native `WebSocket`       |
| Auto-reconnect        | Built-in                | Manual                   |
| Proxy/CDN support     | Works through any proxy | Requires upgrade support |
| Memory per connection | Low                     | Higher                   |
| Complexity            | Simple                  | More complex             |

### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  Svelte     │────▶│  /api/sse    │────▶│  SSE Manager  │
│  Component  │◀────│  endpoint    │◀────│  (in-memory)  │
└─────────────┘     └──────────────┘     └───────────────┘
                          │                      │
                     EventSource           Metrics Emitter
                     (auto-reconnect)      Status Watcher
```

### Event Types

| Event            | Data                                                     | Frequency                      |
| ---------------- | -------------------------------------------------------- | ------------------------------ |
| `metrics`        | `MetricsEvent` (processId, cpu, memoryMB, status)        | Every 10s (live, no DB)        |
| `process-status` | `ProcessStatusEvent` (processId, status, previousStatus) | On state change (5s watcher)   |
| `ping`           | `:ping\n\n`                                              | Every 15s (heartbeat)          |

> The `log` and `deploy-log` event types exist in `SSEEventType` but are not emitted server-side. Project logs are read via `tail -n` polling (see [Log Reading](#log-reading)), and deploy logs stream over NDJSON (`/api/deploy`, `/api/deploy/all`), not SSE.

### Client Usage

```typescript
import { createSSEClient } from "$lib/sse";

const client = createSSEClient("/api/sse");

client.onLog((event) => {
  console.log(`[${event.processName}] ${event.line}`);
});

client.onMetrics((event) => {
  console.log(`${event.processName}: ${event.cpu}% CPU`);
});

// Cleanup on unmount
return () => client.close();
```

### Logs Polling (Project Detail)

The project detail logs page refreshes via polling while the Logs tab is active:

- Endpoint: `GET /projects/[id]/logs?lines=<count>`
- Interval: 3s
- Behavior: replaces the log list with the latest N lines

### Client/Server Split

- **`$lib/sse/index.ts`** — Client-safe exports (for Svelte components)
- **`$lib/sse/server.ts`** — Server-only exports (for hooks.server.ts, endpoints)

This prevents Vite from bundling Node.js modules (`child_process`, `fs`) into client code.

---

## Service Layer & DI

### Factory Pattern

```typescript
import { createServices } from "$lib/services/factory";

// In route files:
export const load = async () => {
  const { pm2Service, metricsService } = createServices();
  const processes = await pm2Service.getAllProcesses();
  return { processes };
};
```

### ServiceContainer

| Service          | Dependencies                      | Purpose                            |
| ---------------- | --------------------------------- | ---------------------------------- |
| `PM2Service`     | `PM2Repository`                   | Process management, status mapping, restart fallback |
| `MetricsService` | `PM2Service`                      | Live aggregation (CPU/RAM/uptime) — no DB persistence |
| `EnvVarService`  | `PM2Repository`, `PM2Service`     | Environment variable management    |
| `AuditService`   | `IAuditLogRepository`             | List/filter audit logs, CSV export |
| `ProjectSharingService` | `IProjectMemberRepository`, `IAuditLogRepository`, `IProjectRepository`, `ITeamRepository` | Project members, roles, team assignment |
| `TeamService`    | `ITeamRepository`, `IAuditLogRepository` | Team CRUD and member management |
| `UserService`    | `IAuthRepository`, `IAuditLogRepository` | User CRUD, roles, ban/unban |
| `PortScannerService` | —                            | System port scanning (`ss`/`lsof`) + dedup |
| `PortManagerService` | `PortScannerService`, `AuditLogRepository` | Port/PID kill + audit logging |
| `PortOtpService` | notification providers              | OTP generation, email, verification |

### Why Not Module-Level Singletons?

Module-level singletons (`const pm2Service = new PM2Service()`) are problematic because:

- **Testing**: Hard to mock dependencies
- **Hot reload**: State persists across HMR cycles
- **Flexibility**: Can't swap implementations

The factory pattern solves all three issues.

---

## PM2 Integration

### How It Works

PM2 View communicates with PM2 via CLI commands:

| Operation        | Command                                                          |
| ---------------- | ---------------------------------------------------------------- |
| List processes   | `pm2 jlist`                                                      |
| Describe process | `pm2 jlist` (parsed by name/id)                                  |
| Restart          | `pm2 restart '<name>'`                                           |
| Stop             | `pm2 stop '<name>'`                                              |
| Delete           | `pm2 delete '<name>'`                                            |
| Read logs        | `tail -n <lines> <logfile>` (efficient, reads only last N lines) |
| Clear logs       | truncates the log file (`fs.truncate`)                           |

### Restart Fallback (recreate)

When `pm2 restart` fails — PM2 cannot restart processes stuck in `errored`/`waiting-restart` state — `PM2Service.restartProcess()` falls back to **delete + start**: it resolves the original script (`pm_exec_path`), deletes the PM2 entry, and starts it again from the correct project directory (`resolveProjectDir()`), so the daemon re-snapshots `pm_cwd` and the app reloads its own `.env`.

### Resolving the project directory

`resolveProjectDir()` trusts `pm_cwd` **only** when it actually contains the executed script; otherwise it falls back to the script's directory. This fixes processes that were originally started from the wrong folder.

### Deleting processes (and files)

`deleteProcess(id, deleteFiles)`:

- Removes the PM2 entry (tolerates an already-missing process).
- Cleans up the DB record — including removing a single member from a group's `pm2Names` array (deleting the whole project only when the last member is removed).
- Optionally deletes the project directory from disk (`deleteFiles` flag).

### Security

All process names passed to shell commands are sanitized with `escapeShellArg()`:

```typescript
// Before: pm2 restart user-input (vulnerable to injection)
// After:  pm2 restart 'user-input' (safe)
await execAsync(`pm2 restart ${escapeShellArg(name)}`);
```

### Log Reading

Logs are read efficiently using `tail -n <path>` — only the last N lines are fetched, never the entire file. This prevents loading megabytes of logs into memory. The UI includes a "Load more" button that fetches additional lines per click.

Each log line is post-processed:

- **Timestamp parsing** — extracts a `YYYY-MM-DD HH:MM:SS` prefix when present (PM2 only adds timestamps when started with `--time`); lines without one render as a dash instead of epoch.
- **Level classification** — `classifyLogLevel()` infers `info`/`warn`/`error` from content (explicit tags, error patterns like `EADDRINUSE`/`stack trace`, framework false-positives on stderr) rather than trusting the stream alone.
- **Log path caching** — the `out`/`err` file paths are cached per process (`logPathCache`) and invalidated on restart/stop/delete.
- **Clearing** — `DELETE /projects/[id]/logs?stream=out|err` truncates the log file.
- **Filtering** — the `LogViewer` component supports a datetime-range filter on top of the fetched lines.
- **Toolbar** — two aligned rows (level filter, date range, sort order toggle newest↔oldest, clear/load-more), with new-error highlighting and dismissed items.

---

## Process Error Alerts

PM2 View automatically sends email alerts when monitored processes crash or enter an error state. This helps teams respond quickly to production issues without manual monitoring.

### How It Works

A background watcher polls PM2 status every 10 seconds. When a process transitions from `online` or `stopped` to `error`, the system sends an email notification to configured recipients.

```
Status Watcher → Detects error transition → Resolves recipients → Sends email
```

### Recipients

Alerts are sent to:

- The project owner's email
- The project's `notifyEmail` (if configured)
- All team members (if the project belongs to a team)

### Cooldown

To prevent email spam, each process has a **5-minute cooldown** between alerts. If a process crashes repeatedly, only one email is sent per 5-minute window.

### Configuration

No configuration is required — the feature is enabled automatically for all registered projects. The SMTP settings are configured via environment variables:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

### Email Content

Alert emails include:

- Process name and project name
- Previous status (`online` or `stopped`)
- Current status (`error`)
- Timestamp of the event

### Development Notes

- The watcher interval is 10 seconds
- Cooldown period is 5 minutes per process
- The feature uses Dependency Injection (`createProcessAlertNotifier`)
- Tests: `src/tests/notifications/process-alert-notifier.test.ts`

---

## Rate Limiting

### Configuration

- **Limit**: 100 requests per minute per IP
- **Window**: Sliding 60-second window
- **Storage**: In-memory `Map<string, RateLimitEntry>`
- **Response**: 429 with `Retry-After` header

### Protected Endpoints

| Endpoint        | Rate Limited               |
| --------------- | -------------------------- |
| `/projects/api` | ✅                         |
| `/api/logout`   | ✅                         |
| `/api/ports*`   | ✅                         |
| `/api/sse`      | ❌ (long-lived connection) |

### Metrics Recording

Metrics are **live-only** for the dashboard (SSE, no DB reads on the charts), but the `MetricsRecorder` + metrics schema/repository persist periodic snapshots for historical queries. The recorder samples process metrics on a fixed interval and writes them through the repository — keep the write interval well above the SSE interval so the dashboard doesn't overload the DB.

### Adding Rate Limiting to New Endpoints

```typescript
import { rateLimiter } from "$lib/rate-limiter";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const result = rateLimiter.check(getClientAddress());
  if (!result.allowed) {
    return json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfter ?? 60) },
      },
    );
  }
  // ... handle request
};
```

---

## Pagination

### API

```typescript
import { normalizePagination, paginate } from "$lib/pagination";

// Normalize params (clamps limit to 1-500, offset to 0+)
const { limit, offset } = normalizePagination({ limit: 20, offset: 0 });

// Wrap results
const result = paginate(items, total, limit, offset);
// Returns: { data, total, limit, offset, hasMore }
```

### Paginated Repositories

| Method                           | Supports Pagination            |
| -------------------------------- | ------------------------------ |
| `PM2Repository.list()`           | ✅ Optional `PaginationParams` |
| `AuditLogRepository.findAll()`   | ✅ `limit` / `offset`          |

When no params are passed, returns the full array (backward compatible).

---

## Logging

### Logger Interface

```typescript
interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}
```

### Usage

```typescript
import { logger } from "$lib/logger";

logger.info("Process started", { name: "api-server" });
logger.error("Failed to connect", { error: String(error) });
logger.debug("Detailed info", { query: "SELECT * FROM users" });
```

### Debug Mode

Set `DEBUG=true` in environment to enable debug-level logging.

---

## Security

### Threat Model

| Threat            | Mitigation                                  |
| ----------------- | ------------------------------------------- |
| Command injection | `escapeShellArg()` on all PM2 process names |
| SQL injection     | Drizzle ORM parameterized queries           |
| Brute force       | Rate limiting (100 req/min per IP)          |
| XSS               | Svelte auto-escapes output, CSP headers     |
| CSRF              | Better Auth built-in protection             |
| Credential theft  | HTTP-only session cookies, bcrypt hashing   |

### Environment Variables Masking

Sensitive env var keys (containing PASSWORD, SECRET, TOKEN, KEY, API, AUTH) are masked in the UI as `••••••••••••` with a show/hide toggle.

---

## Teams

### Architecture

Teams provide role-based access control for projects. A user can belong to multiple teams, and each team membership has a role.

```
users ──< team_members >── teams ──< projects
```

### Roles

| Role          | Permissions                                             |
| ------------- | ------------------------------------------------------- |
| `team_owner`  | Full control: manage members, change roles, delete team |
| `team_admin`  | Manage members, invite/remove users                     |
| `team_member` | View team projects, no management                       |

### Team → Project role mapping

When a project is assigned to a team, every team member gains access to it. The team role is mapped to a project role (`src/lib/server/project-access.ts`):

| Team role      | Project role |
| -------------- | ------------ |
| `team_owner`   | `owner`      |
| `team_admin`   | `editor`     |
| `team_member`  | `viewer`     |

### Team-Based Project Filtering

The `ProjectListingService` filters PM2 processes based on the user's team memberships. Users only see projects that belong to their teams or are personally owned.

### Admin Team Management

Admin users can create, edit, and delete teams, and manage team members from the admin panel. The member management modal shows existing members first (with role change and remove controls), followed by an "Add Member" form.

---

## Favorites

### Architecture

Users can bookmark (favorite) projects for quick access. Favorites are stored per-user and per-process-name.

```
users ──< project_favorites (user_id, pm2_name)
```

### Schema

| Column       | Type              | Description           |
| ------------ | ----------------- | --------------------- |
| `id`         | text (PK)         | UUID                  |
| `user_id`    | text (FK → users) | Owner of the favorite |
| `pm2_name`   | text              | PM2 process name      |
| `created_at` | integer           | Unix timestamp        |

Unique index on `(user_id, pm2_name)` prevents duplicates.

### UI

- **Star button (★/☆)** on each project card in the list view
- **Filter button** to show only favorited projects
- **Star button** in the project detail page header
- Toggle via `POST /projects/favorites` — returns `{ isFavorite: boolean }`

---

## Roles & Permissions

Three independent role tiers coexist:

| Tier     | Stored in                 | Values                                   |
| -------- | ------------------------- | ---------------------------------------- |
| Global   | `users.role`              | `admin`, `user`, `viewer`                |
| Team     | `team_members.role`       | `team_owner`, `team_admin`, `team_member` |
| Project  | `project_members.role`    | `owner`, `editor`, `viewer`              |

The full guide is in [docs/sharing-permissions.md](docs/sharing-permissions.md). Key points:

### Global permission matrix

Defined in `src/lib/auth/permissions.ts` via better-auth's access plugin:

| Resource       | `admin` | `user` | `viewer` |
| -------------- | ------- | ------- | -------- |
| `user`         | create, read, list, get, update, delete, set-role, ban, set-password, impersonate, impersonate-admins | create, read, list, get | read, list, get |
| `project`      | create, read, update, delete | create, read, update | read |
| `project_member` | create, read, update, delete | create, read | read |
| `team`         | create, read, update, delete | create, read | read |
| `team_member`  | create, read, update, delete | create, read | read |
| `audit_log`    | create, read, delete | — | — |

### Project access resolution

`getProjectRole()` (`src/lib/server/project-access.ts`) resolves a user's effective role on a project in this order:

1. **Admin bypass** → `owner`-level access to everything.
2. **`project_members`** entry (highest priority).
3. **Project creator** (`projects.userId`) → `owner`.
4. **Team membership** → mapped role (`team_owner`→`owner`, `team_admin`→`editor`, `team_member`→`viewer`).

Route guards: `requireAdmin()`, `requireRole()`, `requireProjectAccess()`, and the `adminHandler()` wrapper (`src/lib/server/route-guards.ts`, `src/lib/server/admin-handler.ts`).

### Safety guards (HTTP 409/403)

- An admin cannot change their own role.
- The **last admin** cannot be demoted, banned, or deleted.
- The **last owner** of a project or the **last `team_owner`** cannot be removed or demoted.

---

## Audit Module

An **append-only** trail of administrative actions.

### Schema

`src/lib/db/schema/audit-logs.ts` → table `audit_logs`:

| Column         | Description                              |
| -------------- | ---------------------------------------- |
| `action`       | e.g. `user_role_change`, `team_create`   |
| `actor_id`     | FK → `users` (who performed the action)  |
| `target_id`    | Optional user/resource affected          |
| `resource_type`| `user`, `project`, `team`                |
| `resource_id`  | ID of the specific resource              |
| `details`      | JSON string with extra context           |
| `timestamp`    | Unix epoch (defaults to `unixepoch()`)   |

### Writing entries

`logAudit()` (`src/lib/server/audit.ts`) inserts an entry. `AuditLogRepository.create()` does the same through the repository layer. Logs are never updated or deleted.

### Reading & exporting

- `AuditService.listLogs()` — paginated (20/page, up to 100).
- `AuditService.exportCSV()` — fetches up to 10,000 rows and builds a CSV.
- Filters: `action`, `actorId`, `actorQuery` (partial name/email/id), `targetId`, `resourceType`, `startDate`, `endDate`.

### Actions logged

| Action | Emitted by |
| ------ | ---------- |
| `user_create`, `user_role_change`, `user_ban`, `user_unban`, `user_delete` | `UserService` |
| `team_create`, `team_update`, `team_delete`, `team_member_add`, `team_member_remove`, `team_member_role_change` | `TeamService` |
| `project_member_add`, `project_member_remove`, `project_member_role_change`, `project_team_assign` | `ProjectSharingService` |
| `project_register` | `POST /api/projects/register` |

Full guide with a step-by-step walkthrough: [docs/audit-module.md](docs/audit-module.md).

---

## Project Sharing

Projects can be shared with individual users or with a whole team.

### Data model

`project_members` (`src/lib/db/schema/project-members.ts`): `project_id`, `user_id`, `role` (`owner` / `editor` / `viewer`).

### Service

`ProjectSharingService` (`src/lib/services/admin/project-sharing.service.ts`):

- `listMembers()`, `addMember()`, `removeMember()`, `updateRole()`.
- `assignToTeam(projectId, teamId)` — assigns (or unassigns) the project to a team.
- Enforces: `409` on duplicate member, `404` on missing member, `409` when removing/demoting the last `owner`.

### UI

- Project detail → **Sharing** tab → "Manage Collaborators" → `/projects/[id]/sharing`.
- Members list with a role dropdown (`viewer`/`editor`/`owner`) and remove.
- "Invite User" modal (elevated roles prompt a confirmation).
- "Team Assignment" card (admin only) — assigns the project to a team, mapping team roles to project roles.

Full guide: [docs/sharing-permissions.md](docs/sharing-permissions.md).

---

## Multi-process Groups

Monorepo/workspace projects (e.g. Atlas with `atlas-backend` + `atlas-frontend`) are grouped into a **single project** via the `projects.pm2_names` JSON column (array of PM2 process names), with the primary name in `projects.pm2_name`.

Grouping happens through:

- **Workspace detection** — `WORKSPACE_INDICATORS` (`pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`, `rush.json`, `.yarnrc.yml`) plus `package.json` `"workspaces"`, searched up to 4 levels from each process `pm_cwd`.
- **Ecosystem file detection** — `findEcosystemFiles()` / `parseEcosystemAppNames()` (`src/lib/utils/ecosystem.ts`) look for `ecosystem.config.js` / `pm2.config.js` / `ecosystem.json` and extract app names.
- **Listing** — `ProjectListingService.getVisibleProjects()` groups processes by project and auto-upgrades individual DB records to groups when the workspace has >1 process.
- **Registration** — `POST /api/projects/register` accepts a `pm2Names` array + team/members; `GET /api/pm2/unregistered` returns groups detected by cwd/workspace.
- **Import** — the GitHub import wizard detects ecosystem apps and lets the user pick which ones to register as a group.

Full guide: [docs/multi-process-groups.md](docs/multi-process-groups.md).

---

## Auto-deploy

Pushes to a configured GitHub repository + branch trigger a full background deployment:

1. GitHub `push` webhook → `/api/webhooks/github`.
2. HMAC-SHA256 signature verified → repository/branch matched against projects with `auto_deploy_enabled`.
3. A `deployments` row is queued (idempotent on `delivery_id`).
4. `DeploymentWorker` (in-process, DB-backed queue) claims jobs one at a time.
5. `DeploymentRunner` executes: `git` (fetch/checkout/pull `--ff-only`) → `install` → `build` → `pm2 restart --update-env` → verify online.
6. **Multi-process**: the runner restarts **every** name in `pm2Names` sequentially and verifies each is online; the webhook resolves a group member to its parent project so one config covers the whole monorepo.
7. Result is emailed to the owner + `notify_email` via SMTP (`DeploymentNotifier`).

A **Deploy All** button (`/api/deploy/all`) sequentially deploys every online process, streaming NDJSON.

Full guide: [docs/auto-deploy.md](docs/auto-deploy.md).

---

## Port Manager

Admin-only module to inspect and free ports in use on the server. See the full guide: [docs/port-manager.md](docs/port-manager.md).

### Scanning

`PortScannerService` (`src/lib/ports/port-scanner.service.ts`) runs `ss -tlnp`/`ss -ulnp` (with `lsof` fallback) and deduplicates by `port-protocol-address-pid-processName-state`. `ss` duplicates the same socket for IPv4/IPv6 loopback pairs, so the key includes address + pid to collapse real duplicates without merging distinct bound addresses.

### Kill flow (OTP-verified)

```
POST /api/ports/kill → 6-digit OTP (5 min TTL, in-memory, per user)
  → emailed via the shared notification module → POST /api/ports/confirm
  → verify (single-use) → kill -9 <pid> | fuser -k <port>/tcp → audit_logs
```

- `from` resolves to `SMTP_FROM_EMAIL || SMTP_USER`; if neither is set the request fails fast rather than silently succeeding.
- The "Free" button spins while the OTP request endpoint runs, and the confirm modal **only opens after the email was actually sent**.
- Every kill is audited (`port_kill` action).

### Endpoints

| Endpoint                | Method | Purpose               |
| ----------------------- | ------ | --------------------- |
| `/api/ports`            | GET    | List ports (admin)    |
| `/api/ports/kill`       | POST   | Request OTP           |
| `/api/ports/confirm`    | POST   | Verify + execute kill |

All are wrapped in `adminHandler()` and rate-limited.

---

## Development

### Setup

```bash
git clone <repo-url>
cd pm2-view
pnpm install
cp .env.example .env
pnpm dev
```

### Code Style

- **TypeScript strict mode** — no `any`, no `as any` (except API boundaries)
- **No if/else chains** — use registry maps (`Record<K, V>`)
- **Dependency injection** — use `createServices()`, never module-level singletons
- **Logging** — use `logger`, never `console.error`/`console.log`
- **Shell safety** — always use `escapeShellArg()`
- **Svelte 5 runes** — `$state`, `$derived`, `$effect`, `$props`
- **Components** — `{#snippet}` and `{@render}` (not slots)

### Testing

```bash
pnpm vitest run          # Run all tests
pnpm vitest run --watch  # Watch mode
```

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation
- `refactor:` — code refactoring
- `test:` — test changes
- `chore:` — maintenance

---

## Deployment

### Production Build

```bash
pnpm build
pnpm preview  # Test production build locally
```

### Environment Variables (Production)

```env
DATABASE_URL=postgres://user:pass@host:5432/pm2view
BETTER_AUTH_URL=https://your-domain.com
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
NODE_ENV=production
```

### PM2 Ecosystem

For production, configure PM2 with an ecosystem file:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "pm2-view",
      script: "build/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "...",
        BETTER_AUTH_URL: "https://your-domain.com",
        BETTER_AUTH_SECRET: "...",
      },
    },
  ],
};
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # SSE support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```
