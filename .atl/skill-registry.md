# Skill Registry - pm2-view

> Updated by `sdd-init` on 2026-04-28
> User preferences and project conventions indexed for quick reference

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| "improve accessibility", "a11y audit", "WCAG compliance" | accessibility | /home/camidev/projects/pm2-view/.agents/skills/accessibility/SKILL.md |
| "improve SEO", "optimize for search", "fix meta tags" | seo | /home/camidev/projects/pm2-view/.agents/skills/seo/SKILL.md |
| Build web components, pages, landing pages, dashboards | frontend-design | /home/camidev/projects/pm2-view/.agents/skills/frontend-design/SKILL.md |
| Svelte 5 components, runes, snippets, SvelteKit patterns | svelte5-best-practices | /home/camidev/projects/pm2-view/.agents/skills/svelte5-best-practices/SKILL.md |
| Creating/editing/analyzing .svelte files or Svelte modules | svelte-code-writer | /home/camidev/projects/pm2-view/.agents/skills/svelte-code-writer/SKILL.md |
| Vite projects, vite.config.ts, Vite plugins | vite | /home/camidev/projects/pm2-view/.agents/skills/vite/SKILL.md |
| Node.js servers, REST APIs, GraphQL backends | nodejs-backend-patterns | /home/camidev/projects/pm2-view/.agents/skills/nodejs-backend-patterns/SKILL.md |
| Node.js architecture decisions, framework selection | nodejs-best-practices | /home/camidev/projects/pm2-view/.agents/skills/nodejs-best-practices/SKILL.md |
| Complex type logic, reusable type utilities | typescript-advanced-types | /home/camidev/projects/pm2-view/.agents/skills/typescript-advanced-types/SKILL.md |
| "create GitHub issue", "report bug" | issue-creation | /home/camidev/.config/opencode/skills/issue-creation/SKILL.md |
| "create pull request", "open PR" | branch-pr | /home/camidev/.config/opencode/skills/branch-pr/SKILL.md |
| "create new skill", "add agent instructions" | skill-creator | /home/camidev/.config/opencode/skills/skill-creator/SKILL.md |
| Go tests, Bubbletea TUI testing | go-testing | /home/camidev/.config/opencode/skills/go-testing/SKILL.md |
| "judgment day", "dual review", "juzgar" | judgment-day | /home/camidev/.config/opencode/skills/judgment-day/SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### svelte5-best-practices
- Use runes ($state, $derived, $effect, $props, $bindable) not stores
- Use snippets ({#snippet}, {@render}) not slots
- Use onclick (not on:click) for event handlers in Svelte 5
- Use callback props (not createEventDispatcher) for events
- Never use `let` without `$state` for reactive variables
- Use `$derived` not `$effect` for computed values
- Always use `$bindable()` for `bind:` to work
- Avoid setting module-level state in SSR (causes cross-request leaks)

### vite
- Use vite.config.ts with ESM (avoid CommonJS)
- Vite 8 uses Rolldown bundler and Oxc transformer
- Configure `resolve.alias` for path aliases (e.g., '@' → './src')
- Use `loadEnv` for environment variables in config
- Plugins ordered: pre → normal → post

### svelte-code-writer
- MUST use for any .svelte or .svelte.ts/.js file
- Run `npx @sveltejs/mcp list-sections` to list documentation
- Run `npx @sveltejs/mcp get-documentation "<topics>"` to fetch docs
- Run `npx @sveltejs/mcp svelte-autofixer` to analyze/fix code
- Escape $ as \$ when passing runes via terminal

### nodejs-backend-patterns
- Use layered architecture: controllers → services → repositories
- Use custom error classes (AppError, ValidationError, NotFoundError)
- Use Zod for input validation with validate middleware
- Use JWT for authentication with authenticate middleware
- Use rate limiting for API endpoints (express-rate-limit)
- Use request logging with Pino, dependency injection for testability

### frontend-design
- Choose a BOLD aesthetic direction (minimal, maximalist, retro-futuristic, etc.)
- Avoid generic AI aesthetics (Inter/Roboto, purple gradients, predictable layouts)
- Use distinctive typography (pair display + body fonts)
- Commit to cohesive color theme with sharp accents
- Add motion/micro-interactions (CSS-only preferred)
- Use unexpected layouts (asymmetry, overlap, diagonal flow)

### accessibility
- Follow WCAG 2.2 POUR principles (Perceivable, Operable, Understandable, Robust)
- Target WCAG AA compliance (4.5:1 contrast for normal text, 3:1 for large)
- Add alt text to all images (descriptive or empty for decorative)
- Use aria-label or visually-hidden text for icon buttons
- Ensure keyboard navigation works (tab order, focus indicators)

### seo
- Create robots.txt with Allow/Disallow rules and sitemap reference
- Add meta robots tag (index/follow/noindex/nofollow)
- Use canonical URLs to prevent duplicate content
- Generate XML sitemap (max 50,000 URLs or 50MB)
- Use structured data (JSON-LD) for rich snippets

### nodejs-best-practices
- Choose framework by context: Hono (edge), Fastify (performance), NestJS (enterprise), Express (legacy)
- Use ESM (import/export) for new projects
- Use Node.js 22+ --experimental-strip-types for native TypeScript
- Apply security: helmet, cors, rate limiting, input validation
- Use async/await with proper error handling

### typescript-advanced-types
- Use generics for reusable, type-flexible components with constraints (`T extends Interface`)
- Use conditional types with `infer` to extract types
- Create mapped types with key remapping (`[K in keyof T]`)
- Use template literal types for string manipulation
- Leverage utility types (Partial, Required, Pick, Omit, Record)

### issue-creation
- Follow issue-first enforcement system
- Create GitHub issues before starting work
- Include clear reproduction steps for bugs
- Use labels and milestones appropriately

### branch-pr
- Follow issue-first enforcement system for PR creation
- Reference issue number in PR title/description
- Include summary of changes and testing notes

### skill-creator
- Follow Agent Skills spec for creating new skills
- Include frontmatter with name, description, license, metadata
- Document triggers and provide reference files in subdirectories

### go-testing
- Use table-driven tests for Go
- Use teatest for Bubbletea TUI testing
- Test public APIs, not internal implementation

### judgment-day
- Launch two independent blind judge sub-agents simultaneously
- Synthesize findings, apply fixes, re-judge until both pass
- Max 2 iterations before escalation

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | /home/camidev/projects/pm2-view/AGENTS.md | Index — behavioral guidelines for LLM coding |
| DESIGN.md | /home/camidev/projects/pm2-view/DESIGN.md | Referenced by AGENTS.md — architecture decisions |
| README.md | /home/camidev/projects/pm2-view/README.md | Project documentation |
| TODO.md | /home/camidev/projects/pm2-view/TODO.md | Pending tasks |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.

## Stack-Specific Conventions

**SvelteKit + Svelte 5**:
- Use runes ($state, $derived, $effect, $props, $bindable) not stores
- Use snippets ({#snippet}, {@render}) not slots
- TypeScript strict mode enabled
- $lib aliases for imports

**Drizzle ORM**:
- Schema definitions in `src/lib/db/schema/`
- Use Turso/LibSQL for serverless SQLite
- Zod for runtime validation

**Motion Core**:
- Components scaffolded via CLI: `motion-core add <component>`
- Components live in `src/lib/motion-core/`
- GSAP + Three.js for animations
- Tailwind CSS required (v3 in this project)

**Melt UI**:
- Headless accessible components
- SvelteKit-native integration

## Auto-Load Rules

When these contexts are detected, IMMEDIATELY load the corresponding skill:

| Context Detected | Skill to Load |
|------------------|---------------|
| `.svelte` file edit/create | svelte5-best-practices, svelte-code-writer |
| `vite.config.ts` edit | vite |
| `drizzle.config.ts` or schema | nodejs-backend-patterns |
| Accessibility work | accessibility |
| SEO optimization | seo |
| TypeScript advanced types | typescript-advanced-types |
| "sdd init/explore/propose/spec/design/tasks/apply/verify/archive" | corresponding sdd-* skill |
| Go code (not in this project) | go-testing |

## Notes

- Project-level skills override user-level skills with the same name
- SDD skills (sdd-*) are managed centrally and should not be duplicated at project level
- The `_shared` skill is internal and not invocable
- Motion Core components are added via `motion-core add <component-slug>` CLI
- Tailwind CSS v3 (not v4 as mentioned in original registry — this project uses v3)
- PM2 process management configured via ecosystem.config.cjs
