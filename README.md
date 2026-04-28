# PM2 View

A beautiful, modern visual dashboard for managing PM2 processes. Monitor CPU, RAM, uptime, view real-time logs, and manage environment variables — all from a sleek web interface.

![Dashboard](https://img.shields.io/badge/SvelteKit-2.x-ff3e00?logo=svelte)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)
![Better Auth](https://img.shields.io/badge/Auth-Better%20Auth-0070f3)
![Database](https://img.shields.io/badge/DB-Turso%20SQLite-4ff5d9)

## ✨ Features

- **Authentication** — Secure login/register with Better Auth and session management
- **Dashboard** — Overview of all PM2 processes with real-time status
- **Project Cards** — Beautiful cards showing CPU, RAM, uptime, and status
- **Process Actions** — Restart, stop, and delete processes directly from the UI
- **Real-time Logs** — Live log streaming with auto-scroll and color-coded output
- **Environment Variables** — View, edit, add, and delete env vars with auto-restart on save
- **Metrics Dashboard** — Visual CPU/RAM bars, aggregated stats, auto-refresh every 10s
- **Dark/Light Mode** — Toggle between themes with smooth transitions
- **Premium Animations** — Page transitions, staggered lists, smooth tab switching

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | SvelteKit 2.x + Svelte 5 (runes) |
| **Language** | TypeScript |
| **Auth** | Better Auth |
| **Database** | Turso (libSQL/SQLite) |
| **ORM** | Drizzle ORM |
| **Validation** | Zod |
| **Styling** | Tailwind CSS |
| **UI Components** | Custom components with Melt UI patterns |
| **Animations** | Svelte transitions + View Transitions API |
| **Testing** | Vitest |

## 📁 Architecture

Built with **Screaming Architecture** — organized by domain, not by technical layer:

```
src/lib/
├── auth/              # Authentication domain
├── projects/          # Projects domain
├── pm2/               # PM2 process manager domain
├── metrics/           # Metrics & monitoring domain
├── env-vars/          # Environment variables domain
├── db/                # Database infrastructure (Drizzle + schema)
├── ui/                # Shared UI components
├── config/            # Configuration
└── theme.svelte.ts    # Theme management (dark/light)
```

**Patterns used:**
- **Repository Pattern** — Interfaces decouple domain from implementation
- **Service Layer** — Business logic encapsulated in services
- **Interface-first** — Contracts defined before implementations

## 🏁 Getting Started

### Prerequisites

- Node.js 20+
- PNPM (or npm)
- PM2 installed globally (`npm i -g pm2`)
- Turso account (or local SQLite)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd pm2-view

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Edit .env with your Turso credentials
```

### Environment Variables

```env
# Turso Database
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# Better Auth
BETTER_AUTH_URL=http://localhost:5179
BETTER_AUTH_SECRET=your-secret-key

# PM2 (optional)
PM2_HOST=localhost
PM2_PORT=4322
```

### Running

```bash
# Development
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Run tests
pnpm test

# Type check
pnpm check
```

### Database Setup

```bash
# Push schema to Turso
npx drizzle-kit push

# Generate migrations
npx drizzle-kit generate
```

## 📸 Screenshots

### Dashboard
Process overview with summary cards and quick links.

### Projects
Grid of project cards with CPU, RAM, uptime, and action buttons.

### Project Detail
Tabs for Overview, Logs (real-time), and Environment Variables.

### Metrics
Visual performance metrics with progress bars and auto-refresh.

## 🎨 Design System

### Colors (Dark Mode)
| Token | Hex | Usage |
|-------|-----|-------|
| Base | `#0A0E17` | Page background |
| Surface | `#0F1623` | Secondary surfaces |
| Card | `#141D2F` | Card backgrounds |
| Accent 1 | `#CAF8FF` | Lightest accent |
| Accent 3 | `#38CDFF` | Primary interactive |
| Accent 4 | `#009DCD` | Buttons, links |
| Accent 6 | `#005C79` | Dark accent |

### Fonts
- **Headings**: Roboto (300, 400, 500, 700)
- **Body**: Poppins (300, 400, 500, 600, 700)

### Transitions
- Page navigation: 350ms slide-up fade
- Tab switching: 300ms slide-up
- Theme toggle: 400ms crossfade
- List items: 50ms stagger delay

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test -- --coverage

# Watch mode
pnpm test -- --watch
```

## 📦 Project Structure

```
pm2-view/
├── src/
│   ├── lib/
│   │   ├── auth/           # Auth domain
│   │   ├── projects/       # Projects domain
│   │   ├── pm2/            # PM2 domain
│   │   ├── metrics/        # Metrics domain
│   │   ├── env-vars/       # Env vars domain
│   │   ├── db/             # Database layer
│   │   │   ├── schema/     # Drizzle schema
│   │   │   └── repositories/  # Repo implementations
│   │   ├── ui/             # UI components
│   │   ├── config/         # Configuration
│   │   └── theme.svelte.ts # Theme state
│   ├── routes/
│   │   ├── (auth)/         # Login, register
│   │   ├── (app)/          # Protected routes
│   │   │   ├── +page.svelte      # Dashboard
│   │   │   ├── projects/         # Projects list
│   │   │   ├── projects/[id]/    # Project detail
│   │   │   └── metrics/          # Metrics page
│   │   └── api/            # API endpoints
│   ├── app.css             # Global styles
│   ├── app.html            # HTML shell
│   └── hooks.server.ts     # Server hooks
├── drizzle/                # Migrations
├── drizzle.config.ts       # Drizzle config
├── tailwind.config.ts      # Tailwind config
├── svelte.config.js        # SvelteKit config
├── vite.config.ts          # Vite config
└── vitest.config.ts        # Vitest config
```

## 🔐 Security

- Passwords hashed by Better Auth (bcrypt)
- HTTP-only session cookies
- CSRF protection built-in
- Environment variables masked in UI (sensitive keys)
- Auth guard on all protected routes

## 📝 License

MIT
