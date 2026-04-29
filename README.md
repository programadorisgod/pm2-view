# PM2 View

A beautiful, modern visual dashboard for managing PM2 processes. Monitor CPU, RAM, uptime, view real-time logs via SSE, and manage environment variables — all from a sleek web interface.

![Dashboard](https://img.shields.io/badge/SvelteKit-2.x-ff3e00?logo=svelte)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)
![Database](https://img.shields.io/badge/DB-PostgreSQL%20%7C%20SQLite-4ff5d9)
![Real-time](https://img.shields.io/badge/Real--time-SSE-00E676)

## Features

- **Authentication** — Pluggable auth system (Better Auth included, swap with any provider)
- **Dashboard** — Overview of all PM2 processes with real-time status
- **Project Cards** — Beautiful cards showing CPU, RAM, uptime, and status
- **Process Actions** — Restart, stop, and delete processes directly from the UI
- **Real-time Logs** — Live log streaming via Server-Sent Events (SSE) with auto-scroll
- **Real-time Metrics** — Push-based CPU/RAM updates every 10s via SSE
- **Environment Variables** — View, edit, add, and delete env vars with auto-restart on save
- **Metrics Dashboard** — Visual CPU/RAM bars, aggregated stats
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
│   └── schema/        # Drizzle schema definitions
├── sse/               # Real-time communication
│   ├── sse-manager.ts # Server-side connection manager
│   ├── client.ts      # Browser EventSource wrapper
│   ├── server.ts      # Server-only exports
│   ├── metrics-emitter.ts
│   └── status-watcher.ts
├── services/          # Service container (DI factory)
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
- npm (or pnpm/yarn)
- PM2 installed globally (`npm i -g pm2`)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd pm2-view

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your database and auth configuration
```

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

### Auth Providers

The default auth provider is Better Auth. To swap to a different provider:

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

# Auth Provider (optional — defaults to 'better-auth')
AUTH_PROVIDER=better-auth

# PM2 (optional)
PM2_HOST=localhost
PM2_PORT=4322

# Logging (optional)
DEBUG=true  # Enable debug-level logging
```

### Running

```bash
# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm test

# Type check
npm run check
```

### Database Setup

```bash
# Push schema to your database
npx drizzle-kit push

# Generate migrations
npx drizzle-kit generate
```

## Real-time (SSE)

PM2 View uses **Server-Sent Events** for real-time updates — no polling, no WebSockets:

- **Logs**: Push new log lines as they arrive
- **Metrics**: CPU/RAM updates every 10 seconds
- **Process Status**: State change notifications (online → stopped → error)

The SSE endpoint is at `/api/sse`. Connect from any browser:

```javascript
const es = new EventSource("/api/sse");
es.addEventListener("log", (e) => console.log(JSON.parse(e.data)));
es.addEventListener("metrics", (e) => console.log(JSON.parse(e.data)));
es.addEventListener("process-status", (e) => console.log(JSON.parse(e.data)));
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

## Screenshots

### Dashboard

Process overview with summary cards and quick links.

### Projects

Grid of project cards with CPU, RAM, uptime, and action buttons.

### Project Detail

Tabs for Overview, Logs (real-time), and Environment Variables.

### Metrics

Visual performance metrics with progress bars and auto-refresh.

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Project Structure

```
pm2-view/
├── src/
│   ├── lib/
│   │   ├── auth/           # Auth domain (pluggable)
│   │   ├── db/             # Database (dialect-agnostic)
│   │   ├── sse/            # Real-time SSE communication
│   │   ├── services/       # DI factory
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
│   │   ├── (app)/          # Protected routes
│   │   └── api/            # API endpoints (including /api/sse)
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

- Passwords hashed by Better Auth (bcrypt)
- HTTP-only session cookies
- CSRF protection built-in
- Environment variables masked in UI (sensitive keys)
- Auth guard on all protected routes
- Shell commands sanitized with `escapeShellArg()` to prevent command injection
- Rate limiting on API endpoints (100 req/min per IP)

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

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
