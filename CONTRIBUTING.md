# Contributing to PM2 View

Thank you for your interest in contributing! Here's how to get started.

## Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/pm2-view.git
cd pm2-view

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start the development server
npm run dev
```

## Code Style

- **TypeScript strict mode** — no `any`, no `as any`, no `as unknown as` (except at API boundaries)
- **No if/else chains** for selection logic — use registry maps (`Record<K, V>`) or strategy patterns
- **Dependency injection** — use `createServices()` from `$lib/services/factory`, never create services at module scope
- **Logging** — use `logger` from `$lib/logger`, never `console.error`/`console.log`
- **Shell safety** — always use `escapeShellArg()` before passing values to `exec`/`execAsync`
- **Svelte 5 runes** — use `$state`, `$derived`, `$effect`, `$props` (not stores)
- **Components** — use `{#snippet}` and `{@render}` (not slots)

## Architecture

PM2 View uses a layered architecture with dependency injection:

```
Routes → Services → Drivers/Providers
```

- **Routes** (SvelteKit) handle HTTP requests and render UI
- **Services** contain business logic, injected via `createServices()`
- **Drivers/Providers** implement interfaces for database and auth

### Adding a New Database Driver

1. Implement `DatabaseDriver` interface in `src/lib/db/drivers/`
2. Register a dialect rule in `src/lib/db/dialect-registry.ts`
3. Add the driver to `DRIVER_MAP` in `src/lib/db/factory.ts`

### Adding a New Auth Provider

1. Implement `AuthProvider` interface in `src/lib/auth/providers/`
2. Register the provider in `PROVIDER_REGISTRY` in `src/lib/auth/factory.ts`

## Testing

```bash
# Run all tests
npm test

# Run a specific test file
npm test -- src/tests/pm2/pm2.service.test.ts

# Watch mode
npm test -- --watch
```

## Pull Requests

1. Create a feature branch from `main`
2. Write tests for new functionality
3. Ensure `npm run check` passes (TypeScript + Svelte)
4. Submit a PR with a clear description of changes

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation changes
- `refactor:` — code refactoring (no behavior change)
- `test:` — test changes
- `chore:` — maintenance tasks

## Code of Conduct

- Be respectful and inclusive
- Review code, not people
- Assume good faith
