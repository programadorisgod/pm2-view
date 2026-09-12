# PM2 View — Server & VPS Management Suite

A modern, high-performance visual dashboard and orchestration suite for servers and VPS. Seamlessly manage PM2 application processes, inspect and control Docker & Podman containers (workloads, images, volumes, networks), monitor live CPU/RAM metrics via SSE, stream real-time logs, scan and free network ports, and automate GitHub deployments — all from a unified, sleek web interface.

![Dashboard](https://img.shields.io/badge/SvelteKit-2.x-ff3e00?logo=svelte)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)
![Database](https://img.shields.io/badge/DB-PostgreSQL%20%7C%20SQLite-4ff5d9)
![Real-time](https://img.shields.io/badge/Real--time-SSE-00E676)
![Containers](https://img.shields.io/badge/Containers-Docker%20%7C%20Podman-2496ED?logo=docker)

![PM2 View Projects Dashboard](snapshots/00.png)

> 📖 **Visual Modules Guide:** For walkthroughs and screenshots of all modules (Projects, Containers, Port Manager, User Management, Teams, and Audit Logs), check out the [Modules Guide](docs/modules-guide.md).

## Features

- **Container & Workload Management (Docker & Podman)** — Native socket inspection and lifecycle control for containers, images, volumes, and networks with real-time CPU/memory stats and log streaming
- **Container Watchdog & Alerts** — Background watchdog that monitors critical containers and delivers immediate alerts through Email (SMTP) and Telegram
- **Authentication** — Email/password with Better Auth, **Google sign-in**, and **password reset** (email or console fallback)
- **Dashboard** — Overview of all PM2 processes with real-time status
- **Project Cards** — Beautiful cards showing CPU, RAM, uptime, and status
- **Multi-process Groups** — Monorepo/workspace projects (e.g. Atlas) grouped as a single card across all flows (see [docs/multi-process-groups.md](docs/multi-process-groups.md))
- **Favorites** — Star projects to quickly find them, filter by favorites in the list
- **Projects** — Restart, stop, delete processes from the UI (restart falls back to recreate on failure); favorites filter with collapsible Favorites/Others sections
- **Process Actions** — Restart, stop, and delete processes directly from the UI (restart falls back to recreate on failure)
- **Admin Process Registration** — Register unregistered PM2 processes as projects with team/member assignment (admin only)
- **PM2 Save & Startup** — Persist the process list (`pm2 save`) and enable boot startup (`pm2 startup`) from the UI (admin only)
- **One-Click Update** — Pull, rebuild, and restart the app from the UI (admin only)
- **Logs** — Efficient `tail -n` reading, content-based level classification (info/warn/error), datetime-range filter, "Load more", and log clearing
- **Log Viewer toolbar** — Reorganized into two aligned rows with a newest↔oldest sort order toggle, new-error highlighting, and dismiss
- **Real-time Metrics** — Push-based CPU/RAM updates every 10s via SSE (live-only, no DB persistence)
- **Environment Variables** — View, edit, add, and delete env vars (applied on next deploy)
- **Env Import** — Import environment variables from a local `.env` file with folder picker and paste-to-split rows
- **GitHub Integration** — Connect a GitHub App, list/import accessible repositories, skip-install option, zero-dependency detection, and multi-app ecosystem detection (see [docs/github-integration.md](docs/github-integration.md))
- **Auto-deploy** — Trigger full deploys (git → install → build → pm2 restart) from GitHub push webhooks, with email notifications and per-stage history (see [docs/auto-deploy.md](docs/auto-deploy.md))
- **Deploy All** — Sequentially deploy every online process from one button
- **Deploy Confirmation** — Confirmation modal before Deploy All to prevent accidental bulk deployments
- **Structured Logging** — Production-ready structured JSON logging powered by Pino with clean console output for local development
- **Security & Hardening** — OWASP Top 10 hardening, HTTP security headers (CSP, X-Frame-Options), strict RBAC route guards, environment variable masking, and CSV formula sanitization (see [SECURITY.md](SECURITY.md))
- **Teams** — Manage teams, invite members, assign roles (team_owner, team_admin, team_member), team-based project access
- **Project Sharing** — Invite users with owner/editor/viewer roles, assign projects to teams (see [docs/sharing-permissions.md](docs/sharing-permissions.md))
- **Metrics Dashboard** — Visual CPU/RAM bars, aggregated stats
- **Metrics Recording** — Persistent metrics snapshots stored in the database with repository layer for historical queries
- **Port Manager** — Scan system ports in use (TCP/UDP), search/filter by port/process/address, and free ports with OTP email verification before killing (admin only)
- **Admin Panel** — Manage users, teams, and audit logs; role-based access control (see [docs/sharing-permissions.md](docs/sharing-permissions.md))
- **Audit Logs** — Append-only trail of admin actions with filters (action/actor/date), pagination, and CSV export (see [docs/audit-module.md](docs/audit-module.md))
- **Dark/Light Mode** — Toggle between themes with smooth transitions
- **Premium Animations** — Page transitions, staggered lists, smooth tab switching

## Tech Stack

| Layer          | Technology                                                      |
| -------------- | --------------------------------------------------------------- |
| **Framework**  | SvelteKit 2.x + Svelte 5 (runes)                                |
| **Language**   | TypeScript                                                      |
| **Auth**       | Better Auth (pluggable — see [Auth Providers](#auth-providers)) |
| **Database**   | PostgreSQL or SQLite/Turso (see [Database](#database))          |
| **ORM**        | Drizzle ORM                                                     |
| **Validation** | Zod                                                             |
| **Styling**    | Tailwind CSS                                                    |
| **Real-time**  | Server-Sent Events (SSE)                                        |
| **Containers** | Dockerode (Docker & Podman socket API)                         |
| **Logging**    | Pino (Structured JSON logging)                                  |
| **Testing**    | Vitest                                                          |

## Architecture

Built with **Screaming Architecture** — organized by domain, not by technical layer:

```
src/lib/
├── auth/              # Authentication domain (pluggable providers)
│   ├── provider.interface.ts
│   ├── providers/     # Auth implementations (better-auth, etc.)
│   └── factory.ts     # Provider registry
├── db/                # Database domain (dialect-agnostic)
│   ├── driver.interface.ts
│   ├── drivers/       # DB implementations (libsql, postgres)
│   ├── dialect-registry.ts  # Extensible dialect detection
│   ├── factory.ts     # Driver factory
│   ├── schema/        # Drizzle schema definitions
│   └── repositories/  # Data access implementations
├── sse/               # Real-time communication
│   ├── sse-manager.ts # Server-side connection manager
│   ├── client.ts      # Browser EventSource wrapper
│   ├── server.ts      # Server-only exports
│   ├── metrics-emitter.ts
│   └── status-watcher.ts
├── services/          # Service container (DI factory)
├── containers/        # Container client models, formatting & types
├── server/containers/ # Docker & Podman engine, watchdog, alerts, settings
├── ports/             # Port scanning + OTP-verified kill (see docs/port-manager.md)
├── logger/            # Structured logging
├── rate-limiter/      # In-memory rate limiting
├── pagination/        # Pagination types and helpers
├── utils/             # Shared utilities (status, format, validation, shell)
├── projects/          # Projects domain
├── pm2/               # PM2 process manager domain
├── metrics/           # Metrics & monitoring domain
├── env-vars/          # Environment variables domain
├── ui/                # Shared UI components
└── config/            # Configuration
```

**Patterns used:**

- **Repository Pattern** — Interfaces decouple domain from implementation
- **Service Layer** — Business logic encapsulated in services
- **Dependency Injection** — Centralized `createServices()` factory
- **Registry Pattern** — Extensible driver/provider selection (Open/Closed)
- **Interface-first** — Contracts defined before implementations
- **Client/Server Split** — Clean separation of browser and Node.js code

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (or npm/yarn)
- PM2 installed globally (`npm i -g pm2`)
- Optional: Docker or Podman daemon running (for container features)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd pm2-view

# Install dependencies (committed lockfile is pnpm-lock.yaml)
pnpm install

# Copy environment variables
cp .env.example .env

# Edit .env with your database and auth configuration
```

> **Do this first:** after setup, promote a user to admin (see [Create an Admin Account](#create-an-admin-account)) — every new account starts with the `user` role and there is no bootstrap.

### Create an Admin Account

All new users are created with the `user` role by default, so you must promote your first user to admin. The user must already exist (registered via the app) before running this.

```bash
npm run make-admin <email>

# Example:
npm run make-admin admin@example.com
```

This runs a one-off script (`src/lib/server/migrations/make-admin.ts`) that updates the `role` column to `admin` in the database. It prints what it did: user not found, already admin, or promoted.

> **Note:** The script connects via `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` (SQLite/Turso). It does **not** work against a PostgreSQL `DATABASE_URL` — run it against your SQLite/Turso database instead.

**What admins can do:**

- Access the `/admin` panel (users, teams, audit logs, roles)
- Create users, change roles, ban/unban, and delete users
- See **all** projects (admin bypasses project-level access checks)
- Access the `/ports` manager and terminate ports with OTP email verification
- Manage container watchdog alerting settings
- Run admin-only PM2 operations: [PM2 Save](#pm2-save) / [PM2 Startup](#pm2-startup), and the [Update button](#one-click-update)

**Safety guards:** an admin cannot change their own role, and the **last remaining admin** cannot be demoted, banned, or deleted (HTTP 409).

### Database

PM2 View supports multiple database backends through a driver abstraction. The dialect is auto-detected from the connection URL.

**SQLite / Turso (default):**

```env
DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token
```

**PostgreSQL:**

```env
DATABASE_URL=postgres://user:password@localhost:5432/pm2view
```

**Local SQLite file:**

```env
DATABASE_URL=file:./data/local.db
```

To add a new database driver, register a dialect rule and driver in the factory — no existing code needs modification.

### Authentication

#### Email & Password (default)

The default auth provider is Better Auth. All auth endpoints live under `/api/auth/*`. Sessions last 30 days with a 5-minute cookie cache.

#### Google Sign-In

Google OAuth is configured via the Better Auth `socialProviders` block (`src/lib/auth/auth.ts`):

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
VITE_ALLOWED_HOSTS=localhost,your-domain.com
```

Setup in Google Cloud Console:

1. Create OAuth 2.0 credentials (APIs & Credentials → Create Credentials → OAuth client ID).
2. Add the **Authorized redirect URI**: `{BETTER_AUTH_URL}{base}/api/auth/callback/google`, where `base` is the app's base path (from `APP_BASE_PATH`, empty by default, `/pm2` in this deployment)
   - Dev: `http://localhost:5179/api/auth/callback/google`
   - Production (base `/pm2`): `https://engine.clinicamedicos.com/pm2/api/auth/callback/google`
3. Add `http://localhost:5179` and your production origin to **Authorized JavaScript origins** if required.

> **`BETTER_AUTH_URL` must be the origin only** — no base path, no trailing slash. The app appends the base path itself. Setting it to `https://engine.clinicamedicos.com/pm2` produces a doubled path (`.../pm2/pm2/api/auth/...`) and `redirect_uri_mismatch`. The full redirect URI you register in Google **does** include the base path.

`VITE_ALLOWED_HOSTS` (comma-separated) controls better-auth's `trustedOrigins`, used to validate the OAuth callback URL (open-redirect protection) and CSRF origin checks. The Google button appears on the login page only — first-time Google users get an account created automatically (no separate registration step).

#### Password Reset

Forgot your password? The login page links to `/forgot-password`, which sends a signed reset link valid for **1 hour**. The email is sent via SMTP (see env vars below); if SMTP is not configured, the reset link is printed to the server console instead.

- Reset links are signed with `BETTER_AUTH_SECRET` and expire after 1 hour (`resetPasswordTokenExpiresIn`).
- Changing the password **revokes all existing sessions** (`revokeSessionsOnPasswordReset`), so the user must sign in again.
- The forgot-password page never reveals whether an account exists (privacy-preserving message).

To enable email delivery, configure SMTP:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@example.com
SMTP_PASS=your-app-password
SMTP_FROM_EMAIL=you@example.com
NOTIFICATION_CHANNELS=nodemailer   # default if unset
```

> Gmail works with an app password. If `SMTP_HOST` is unset, no email is sent and reset links only appear in the server logs.

#### Swapping the Auth Provider

To swap to a different provider:

```typescript
// src/lib/auth/factory.ts
import { MyAuthProvider } from "./providers/my-auth.provider";

registerAuthProvider("my-auth", () => new MyAuthProvider());
```

Then set `AUTH_PROVIDER=my-auth` in your environment.

### Environment Variables

```env
# Database (required) — dialect auto-detected from URL
DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token  # Only for libsql/Turso

# Better Auth (required for default provider)
BETTER_AUTH_URL=http://localhost:5179
BETTER_AUTH_SECRET=your-secret-key
# Optional — forces the public origin when behind a reverse proxy.
# Without it, adapter-node derives the origin from request headers; if the
# proxy does not forward the correct Host/X-Forwarded-* headers, better-auth
# rejects requests (404 on /api/auth/*) because the perceived origin no longer
# matches BETTER_AUTH_URL. Set to the same origin as BETTER_AUTH_URL.
# ORIGIN=https://engine.clinicamedicos.com

# Auth Provider (optional — defaults to 'better-auth')
AUTH_PROVIDER=better-auth

# Google OAuth (optional — enables "Sign in with Google")
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
VITE_ALLOWED_HOSTS=localhost

# Email & Alerting (optional — password reset delivery & watchdog alerts)
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM_EMAIL=
NOTIFICATION_CHANNELS=nodemailer

# Telegram Alerts (optional — container watchdog notifications)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
NOTIFY_TO=

# Container Daemon (optional — auto-detected via sockets if unset)
DOCKER_HOST=
CONTAINERS_SOCKET=

# PM2 (optional)
PM2_HOST=localhost
PM2_PORT=4322

# Logging (optional)
DEBUG=true  # Enable debug-level logging
```

### Running

```bash
# Development
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Run tests (vitest)
pnpm vitest run

# Type check
pnpm check
```

### Database Setup

```bash
# Push schema to your database
npx drizzle-kit push

# Generate migrations
npx drizzle-kit generate
```

## Container & Workload Management

Manage your server's container ecosystem directly from `/container` without SSH access:

- **Multi-Engine Support**: Automatically discovers and communicates with Docker (`/var/run/docker.sock`) or rootless/root Podman (`/run/podman/podman.sock`) sockets.
- **Containers**: Start, stop, restart, delete, inspect metadata, view live CPU/memory charts, and stream container logs in real time.
- **Images**: Browse stored images, inspect layers and tags, and remove unused images.
- **Volumes & Networks**: Inspect volume mount points, network drivers, IP subnets, and attached containers.
- **Watchdog Service**: An integrated background monitor that watches container health and dispatches instant incident notifications via SMTP email and Telegram.

## GitHub Integration

Connect a **GitHub App** to let users import repositories. Requires one GitHub App (not a PAT, not an OAuth App) and 6 environment variables:

```env
GITHUB_APP_ID=1234567
GITHUB_APP_SLUG=your-app-slug
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----
```

There's one database table to create (`github_installations`) — run `pnpm db:migrate`.

> **Full step-by-step setup** (creating the GitHub App, callback URLs, webhook, permissions, key format, migration, and troubleshooting): see [docs/github-integration.md](docs/github-integration.md).

## PM2 System Operations

Admin-only operations backed by the PM2 CLI, exposed in the Projects page header (visible only to users with the `admin` role). The underlying PM2 commands can also be run directly in your terminal.

### PM2 Save

The **PM2 Save** button runs `pm2 save`, persisting the current process list as the "dump file" so PM2 can restore it later.

- Opens a modal, runs the command, and shows the output.
- A success banner ("Process list saved") confirms the dump was written.

> Run this after adding/removing processes to keep the resurrection list up to date.

### PM2 Startup

The **PM2 Startup** button enables PM2 to start processes automatically on boot.

1. It runs `pm2 startup` (quietly) and extracts the generated copy/paste command (a `sudo ... pm2 startup systemd ...` line).
2. The modal shows that command with a **Copy command** button — you can run it yourself in a terminal — or click **Apply here** to run it in-app.
3. To apply in-app, enter the **sudo password** (sent to the command's stdin via `sudo -S`; never stored or placed in argv). The output streams live as NDJSON (`/api/pm2/system?action=apply-startup`).
4. On success it verifies the service with `systemctl is-enabled '<service>'` (8s timeout) and reports the service name (e.g. `pm2-<user>.service`).

**Security:** the startup command is validated before running — it must be a single-line `sudo` invocation containing `pm2 startup`, blocking injection.

> **Note:** `pm2 startup` prints the copy/paste command and exits with a non-zero code as its *normal* success path, so the app treats "command extracted" as success, not the exit code.

### One-Click Update

The **Update** button in the app header (admin only) pulls and rebuilds the app:

```bash
git pull && pnpm build && pm2 restart pm2-view
```

Flow:

1. `POST /api/update` runs `git pull` then `pnpm build` (each fails the update if it errors).
2. After a 1.5s delay (to let the HTTP response flush), a detached background process runs `pm2 restart pm2-view`.
3. The UI shows a success banner and a **30-second countdown** before reloading the page — this avoids the nginx 502 that appears while PM2 is starting the new build.

> **Note:** The app name `pm2-view` is hardcoded. If you run the app under a different PM2 name, restart manually after updating.

## Real-time (SSE)

PM2 View uses **Server-Sent Events** for real-time updates:

- **Metrics**: CPU/RAM updates every 10 seconds
- **Process Status**: State change notifications (online → stopped → error)
- **Deploy Logs**: Per-stage log lines streamed during a deploy

Project log *viewing* is separate from SSE — it reads the PM2 log files with `tail -n` (fast, only the last N lines) and classifies each line by content level. See [Logs](#logs).

The SSE endpoint is at `/api/sse`. Connect from any browser:

```javascript
const es = new EventSource("/api/sse");
es.addEventListener("metrics", (e) => console.log(JSON.parse(e.data)));
es.addEventListener("process-status", (e) => console.log(JSON.parse(e.data)));
es.addEventListener("deploy-log", (e) => console.log(JSON.parse(e.data)));
```

## Design System

### Colors (Dark Mode)

| Token    | Hex       | Usage               |
| -------- | --------- | ------------------- |
| Base     | `#0A0E17` | Page background     |
| Surface  | `#0F1623` | Secondary surfaces  |
| Card     | `#141D2F` | Card backgrounds    |
| Accent 1 | `#CAF8FF` | Lightest accent     |
| Accent 3 | `#38CDFF` | Primary interactive |
| Accent 4 | `#009DCD` | Buttons, links      |
| Accent 6 | `#005C79` | Dark accent         |

### Fonts

- **Headings**: Roboto (300, 400, 500, 700)
- **Body**: Poppins (300, 400, 500, 600, 700)

### Transitions

- Page navigation: 350ms slide-up fade
- Tab switching: 300ms slide-up
- Theme toggle: 400ms crossfade
- List items: 50ms stagger delay

## Visual Tour & Screenshots

For a full visual walkthrough with screenshots of every module (Projects Dashboard, Containers & Workloads, Port Manager, User Management, Teams, and Audit Logs), see the [Modules Guide](docs/modules-guide.md).

## Testing

```bash
# Run all tests
pnpm vitest run

# Run with coverage
pnpm vitest run --coverage

# Watch mode
pnpm vitest
```

## Project Structure

```
pm2-view/
├── src/
│   ├── lib/
│   │   ├── auth/           # Auth domain (pluggable)
│   │   ├── db/             # Database (dialect-agnostic)
│   │   │   ├── schema/     # Drizzle schema (projects, teams, favorites, etc.)
│   │   │   └── repositories/ # Data access implementations
│   │   ├── sse/            # Real-time SSE communication
│   │   ├── services/       # DI factory
│   │   ├── containers/     # Container models and helpers
│   │   ├── server/         # Server-side engines (Docker/Podman) & background watchdog
│   │   ├── ports/          # Port scanning + OTP-verified kill
│   │   ├── logger/         # Structured logging
│   │   ├── rate-limiter/   # Rate limiting
│   │   ├── pagination/     # Pagination helpers
│   │   ├── utils/          # Shared utilities
│   │   ├── projects/       # Projects domain
│   │   ├── pm2/            # PM2 domain
│   │   ├── metrics/        # Metrics domain
│   │   ├── env-vars/       # Env vars domain
│   │   ├── ui/             # UI components
│   │   └── config/         # Configuration
│   ├── routes/
│   │   ├── (auth)/         # Login, register
│   │   ├── (app)/          # Protected routes (projects, container, teams, ports, admin)
│   │   └── api/            # API endpoints (/api/sse, /api/containers, /api/images, /api/ports, etc.)
│   ├── app.css             # Global styles
│   └── app.html            # HTML shell
├── drizzle/                # Migrations
├── drizzle.config.ts       # Drizzle config
├── tailwind.config.ts      # Tailwind config
├── svelte.config.js        # SvelteKit config
├── vite.config.ts          # Vite config
└── vitest.config.ts        # Vitest config
```

## Security

- **OWASP Top 10 Hardened** — Comprehensive security protections across all layers (see [SECURITY.md](SECURITY.md))
- **HTTP Security Headers** — `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy` in `src/hooks.server.ts`
- **Granular Route Guards (RBAC)** — Endpoints enforce authentication and authorization (`requireAuth`, `requireAdmin`, `requireProjectAccess`, `requireProjectRole`) across PM2 process actions, deployment triggers, env vars, logs, and SSE
- **Passwords & Sessions** — Passwords hashed by Better Auth (bcrypt); HTTP-only, secure, SameSite cookies with CSRF validation
- **Shell Command Sanitization** — Shell commands sanitized with `escapeShellArg()` to prevent command injection
- **PM2 Startup Hardening** — PM2 system startup commands are strictly validated against strict regex and platform whitelists before execution
- **Environment Secrets Protection** — Sensitive environment variable values are masked by default in the UI with interactive reveal controls
- **CSV Formula Injection Mitigation** — Audit export spreadsheets sanitize formula characters (`=`, `+`, `-`, `@`)
- **Rate Limiting** — In-memory sliding-window rate limiting (100 req/min per IP) on critical endpoints (`/projects/api`, `/api/logout`, `/api/ports*`)
- **Team-based Access Control** — Users only see projects they own or have team access to; team detail pages reject non-members with 403

See [SECURITY.md](SECURITY.md) for full security policy and vulnerability reporting.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and guidelines.

## 📄 License

Copyright (c) 2026 Jerson Tapias, operating as Camidev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files, to use, copy, modify,
merge, publish, and distribute the Software for **non-commercial purposes only**.

Commercial use is strictly prohibited without prior written permission from
the copyright holder.

See [LICENSE](LICENSE) for the full license text.
