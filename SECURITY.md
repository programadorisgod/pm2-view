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

### Shell Command Injection Prevention

All PM2 process names passed to shell commands are sanitized using `escapeShellArg()`, which:
- Wraps arguments in single quotes
- Escapes any existing single quotes
- Validates input is a non-empty string

### Database Security

- SQL injection is prevented by Drizzle ORM's parameterized queries
- Connection strings are read from environment variables only
- Auth tokens are never logged or exposed in error messages

### Authentication Security

- Passwords are hashed using bcrypt (via Better Auth)
- Sessions use HTTP-only cookies
- CSRF protection is built-in
- Session expiration is configurable

### Input Validation

- All form inputs are validated with Zod on both client and server
- Process IDs are validated before use
- Environment variable values are sanitized before display

## Known Limitations

- PM2 log files are read synchronously (`readFileSync`) — could block on very large log files
- No rate limiting on API endpoints (planned for future release)
- No pagination for process lists (planned for future release)
