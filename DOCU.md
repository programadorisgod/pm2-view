# PM2 View — Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Layer](#database-layer)
4. [Authentication](#authentication)
5. [Real-time Communication (SSE)](#real-time-communication-sse)
6. [Service Layer & DI](#service-layer--di)
7. [PM2 Integration](#pm2-integration)
8. [Rate Limiting](#rate-limiting)
9. [Pagination](#pagination)
10. [Logging](#logging)
11. [Teams](#teams)
12. [Favorites](#favorites)
13. [Security](#security)
14. [Development](#development)
15. [Deployment](#deployment)

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
| `log`            | `LogEvent` (processId, line, logType)                    | Not emitted (logs use polling) |
| `metrics`        | `MetricsEvent` (processId, cpu, memoryMB, status)        | Every 10s                      |
| `process-status` | `ProcessStatusEvent` (processId, status, previousStatus) | On state change                |
| `ping`           | `:ping\n\n`                                              | Every 15s (heartbeat)          |

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
| `PM2Service`     | `PM2Repository`                   | Process management, status mapping |
| `MetricsService` | `MetricsRepository`, `PM2Service` | Metrics recording, aggregation     |
| `EnvVarService`  | `PM2Repository`, `PM2Service`     | Environment variable management    |

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

### Security

All process names passed to shell commands are sanitized with `escapeShellArg()`:

```typescript
// Before: pm2 restart user-input (vulnerable to injection)
// After:  pm2 restart 'user-input' (safe)
await execAsync(`pm2 restart ${escapeShellArg(name)}`);
```

### Log Reading

Logs are read efficiently using `tail -n <path>` — only the last N lines are fetched, never the entire file. This prevents loading megabytes of logs into memory. The UI includes a "Load more" button that fetches 200 additional lines per click.

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
| `/api/sse`      | ❌ (long-lived connection) |

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
| `MetricsRepository.getHistory()` | ✅ Optional `PaginationParams` |

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

## Development

### Setup

```bash
git clone <repo-url>
cd pm2-view
npm install
cp .env.example .env
npm run dev
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
npm test              # Run all tests
npm test -- --watch   # Watch mode
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
npm run build
npm run preview  # Test production build locally
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
