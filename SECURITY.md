# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x     | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do NOT open a public issue**. Instead:

1. Email us at [security@your-domain.com](mailto:security@your-domain.com)
2. Include a description of the vulnerability
3. Include steps to reproduce
4. We will respond within 48 hours

## Security Measures

### HTTP Security Headers (OWASP Top 10)

All HTTP responses in `src/hooks.server.ts` include security headers:
- `Content-Security-Policy` (CSP): Restricts scripts, styles, frames, and resource origins.
- `X-Frame-Options: DENY`: Defends against clickjacking.
- `X-Content-Type-Options: nosniff`: Prevents MIME-type sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin`: Controls referrer data leakage.
- `Permissions-Policy`: Restricts camera, microphone, and geolocation.

### Shell Command Injection & RCE Prevention

- All PM2 process names passed to shell commands are sanitized using `escapeShellArg()`, wrapping arguments in single quotes and escaping inner quotes.
- PM2 system startup commands are strictly validated via platform whitelisting and regular expressions (`src/lib/pm2/pm2-system.service.ts`) to prevent arbitrary command injection.

### Access Control & Route Guards (RBAC)

- Strict authentication and role-based access control guards (`requireAuth`, `requireAdmin`, `requireProjectAccess`, `requireProjectRole`) protect PM2 process control, project deployment, environment variables, logs, and SSE endpoints.
- Ownership and team role mappings prevent unauthorized horizontal and vertical privilege escalation.

### Database Security

- SQL injection is prevented by Drizzle ORM's parameterized queries across PostgreSQL and SQLite/libSQL.
- Connection strings and credentials are read from environment variables only.
- Auth tokens and secrets are never logged or exposed in error messages.

### Authentication & Session Security

- Passwords are hashed using bcrypt via Better Auth.
- Sessions use HTTP-only, secure, same-site cookies.
- CSRF protection is built-in.
- Session expiration and token invalidation on password reset are enforced.
- Better Auth updated to patch OAuth token replay advisories.

### Sensitive Data & Environment Variables Protection

- Environment variable secrets in the UI are masked by default (`••••••••••••`) and only revealed upon deliberate user click/interaction.
- Server-side env endpoints sanitize and enforce role checks before returning variable configurations.

### CSV Formula Injection Mitigation

- Exported audit logs sanitize formula-trigger characters (`=`, `+`, `-`, `@`) with prepended tab quotes to prevent formula execution in spreadsheet applications (Excel, LibreOffice).

### Rate Limiting

- In-memory sliding window rate limiter (100 requests per minute per IP) protects sensitive and resource-heavy endpoints (`/projects/api`, `/api/logout`, `/api/ports*`).
- Violations return `429 Too Many Requests` with a `Retry-After` header.

### Structured Logging & Redaction

- Production structured logging powered by Pino (`PinoLogger`), outputting structured JSON without leaking credentials or tokens.
- Development logging uses `ConsoleLogger` with formatted output; raw console output is disabled in production.

### Input Validation

- All form inputs and API request payloads are validated with Zod schemas on both client and server.
- Process IDs, repo IDs, and filenames are validated before execution or disk access.

## Known Limitations

- PM2 log files are read synchronously (`readFileSync`) — could block on very large log files
- No pagination for process lists (planned for future release)
