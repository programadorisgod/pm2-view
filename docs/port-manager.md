# Port Manager

Admin-only module that lets you view every port in use on the server, search/filter them, and free (kill) the process bound to them — with **email OTP verification** before any destructive action.

## Access

- **Route**: `/ports` (admin only)
- **API**: `/api/ports` (GET), `/api/ports/kill` (POST), `/api/ports/confirm` (POST)
- All endpoints are protected by `adminHandler()` and rate-limited.

## How It Works

### Port Scanning

`PortScannerService` (`src/lib/ports/port-scanner.service.ts`) runs:

- `ss -tlnp` for TCP sockets
- `ss -ulnp` for UDP sockets

with an `lsof` fallback if `ss` is unavailable. Results are **deduplicated** by `port-protocol-address-pid-processName-state` — `ss` emits the same socket twice for IPv4/IPv6 pairs (e.g. `127.0.0.1:323` and `[::1]:323`), so the key includes address and pid to collapse true duplicates without losing distinct bound addresses.

`getSummary()` computes `total`, `tcpCount`, `udpCount`, and `listeningCount` for the stats cards.

### Kill Flow (OTP-verified)

```
Click "Free" → GET → POST /api/ports/kill → generate 6-digit OTP
  → email it (existing notification module) → POST /api/ports/confirm
  → verify code → kill -9 <pid> or fuser -k <port>/tcp → audit log
```

1. **Request kill** — `POST /api/ports/kill` (Zod-validated body: `port`, optional `pid`/`processName`).
2. **OTP generation** — `PortOtpService` (`src/lib/ports/port-otp.service.ts`) creates a 6-digit code stored in-memory per user with a **5-minute TTL**. Expired codes are swept by a 60s interval.
3. **Email delivery** — the code goes out via the shared notification module (`sendNotificationEmail` → nodemailer). The `from` address resolves to `SMTP_FROM_EMAIL || SMTP_USER`; if neither is set, the request fails fast with a clear error instead of silently succeeding.
4. **Confirm** — `POST /api/ports/confirm` verifies the code (consumed after one use) and executes the kill via `PortManagerService`:
   - By PID: `kill -9 <pid>`
   - By port (no PID): `fuser -k <port>/tcp`
5. **Audit** — every kill is recorded in `audit_logs` (`port_kill`) with the actor, target port, protocol, and process.

> **Why OTP by email?** Killing a process is destructive and often affects other users sharing the box. Requiring a code mailed to a verified address proves the operator has access to the account inbox and matches the existing SMTP infrastructure used by process alerts and deploy notifications.

## SMTP Configuration

OTP emails reuse the same SMTP settings as password reset and process alerts:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@example.com
SMTP_PASS=your-app-password
SMTP_FROM_EMAIL=you@example.com
NOTIFICATION_CHANNELS=nodemailer
```

If `SMTP_HOST` is unset, the kill request returns `500` with "Failed to send verification email. Check SMTP configuration." and logs `OTP email failed: no notification providers configured`.

## Tables

| File | Purpose |
| ---- | ------- |
| `src/lib/ports/types.ts` | `PortInfo`, `PortSummary`, `KillRequest`, `OtpPayload` |
| `src/lib/ports/port-scanner.service.ts` | `ss`/`lsof` scanning + dedup + summary |
| `src/lib/ports/port-otp.service.ts` | 6-digit OTP generation, TTL, email, verify |
| `src/lib/ports/port-manager.service.ts` | `killByPid` / `killByPort` + audit logging |
| `src/lib/ui/components/port-confirm-modal.svelte` | 6-digit code entry modal |
| `src/routes/api/ports/+server.ts` | GET — list ports (admin, rate-limited) |
| `src/routes/api/ports/kill/+server.ts` | POST — request OTP |
| `src/routes/api/ports/confirm/+server.ts` | POST — verify code + execute kill |

## Design Decisions

- **Duplicate entries are real**: `ss` genuinely lists the same socket twice for loopback v4/v6. Deduplication happens in the service, not by trusting unique output.
- **The kill modal opens only after the OTP email was actually sent** — the "Free" button shows a spinner while the request endpoint runs, and the modal opens on success.
- **Codes are per-user and single-use** — a user can only have one pending OTP (new request overwrites), and every code is consumed on first verify attempt.