# Modules Guide & Visual Tour

A visual overview and module-by-module guide for PM2 View.

---

## 0. Projects Dashboard

![Projects Dashboard](../snapshots/00.png)

The central operational dashboard provides real-time visibility and process control over all PM2 services.

- **Process Monitoring**: Live status (`online`, `stopped`, `errored`), CPU percentage, RAM consumption, and uptime.
- **Process Actions**: Instant restart, stop, delete, and recreate operations with automatic fallback recovery.
- **Organization**: Collapsible **Favorites** pinning and grouping of multi-process monorepos/workspaces.
- **Operations Toolbar**: One-click **Deploy All**, **Register Process**, **PM2 Save** (persist configuration), and **PM2 Startup** systemd setup.

---

## 1. Authentication & Access Control

![Authentication & Sign In](../snapshots/1.png)

PM2 View secures access with an authentication system powered by [Better Auth](https://www.better-auth.com/).

- **Route**: `/login`, `/register`, `/forgot-password`, `/reset-password`
- **Sign-in Methods**: Email & password authentication as well as Google OAuth 2.0.
- **Password Recovery**: Self-service password reset flow with email notification or local console fallback.
- **Security**: HTTP-only session cookies, CSRF protection, and route-level authentication guards.

---

## 2. Port Manager

![Port Manager](../snapshots/2.png)

A dedicated system-level networking inspector and process manager built for administrators.

- **Route**: `/ports` *(Admin only)*
- **Documentation**: [Port Manager Deep Dive](port-manager.md)
- **Features**:
  - **Socket Inspection**: Scans active TCP and UDP sockets using `ss` (with `lsof` fallback).
  - **Deduplication**: Intelligent socket deduplication across IPv4 and IPv6 interfaces.
  - **Live Filter**: Fast search by port number, process name, PID, or bound address.
  - **OTP-Verified Kill**: Destructive port freeing (`kill -9` by PID or `fuser -k` by port) requires a time-limited 6-digit OTP delivered via email.
  - **Audit Trail**: Every port termination is logged with actor, target, and timestamp in the audit log.

---

## 3. User Management

![User Management](../snapshots/3.png)

Administrative interface for managing platform users and role-based permissions.

- **Route**: `/admin/users` *(Admin only)*
- **Features**:
  - **User Directory**: Searchable directory displaying user name, email, creation date, and status.
  - **Role Assignment**: Dynamic role switching between `admin` and `user`.
  - **Access Control**: Instant account suspension and ban management.
  - **Audit Logging**: All permission changes and ban actions are recorded in the audit log.

---

## 4. Team Management & Workspaces

![Team Management](../snapshots/4.png)

Collaborative team spaces for organizing projects and managing shared access across engineering groups.

- **Route**: `/admin/teams` and `/teams`
- **Documentation**: [Sharing & Permissions](sharing-permissions.md)
- **Features**:
  - **Workspaces**: Create, manage, and configure team workspaces.
  - **Granular Roles**: Team roles including `team_owner`, `team_admin`, and `team_member`.
  - **Project Sharing**: Share PM2 projects with whole teams or individual users with viewer or editor roles.
  - **Unique Identifiers**: Copyable team IDs for quick reference and assignment.

---

## 5. Audit Logs

![Audit Logs](../snapshots/5.png)

An append-only, searchable compliance and activity trail tracking sensitive administrative actions.

- **Route**: `/admin/audit` *(Admin only)*
- **Documentation**: [Audit Module Architecture](audit-module.md)
- **Features**:
  - **Event Tracking**: Captures user role changes, process registrations, deployments, and port kills.
  - **Detailed Metadata**: Tracks actor, timestamp, action type, target resource, and change details.
  - **Advanced Filters**: Multi-criteria filtering by action type, actor (name/email/ID), and start/end dates.
  - **Exporting**: One-click CSV export of filtered audit logs for compliance reviews.

---

## 6. Containers & Workload Management

![Containers & Workload Management](../snapshots/6.png)

A unified container and server workload manager supporting both Docker and Podman daemon sockets.

- **Route**: `/container`
- **Features**:
  - **Multi-Engine Detection**: Auto-detects local Docker (`/var/run/docker.sock`) and Podman (`/run/podman/podman.sock` or rootless `$XDG_RUNTIME_DIR/podman/podman.sock`) sockets.
  - **Container Operations**: Start, stop, restart, delete, inspect metadata, and view real-time CPU/memory consumption per container.
  - **Live Log Streaming**: Stream container stdout and stderr in real-time directly inside the web console.
  - **Resource Management**: Dedicated tabs for inspecting and pruning **Images**, persistent **Volumes**, and virtual bridge/host **Networks**.
  - **Watchdog & Automated Alerting**: Background health monitor that detects unexpected restarts or container failure states and dispatches incident alerts through **Email (SMTP)** and **Telegram Bot**.

---

## 7. Nginx Engine & Reverse Proxy Manager

![Nginx Engine & Reverse Proxy Manager](../snapshots/7.png)

A visual dashboard and configuration suite for managing local Nginx gateway configurations and application reverse proxies.

- **Route**: `/nginx` *(Admin only)*
- **Configuration Root**: `/etc/nginx/conf.d` and `/etc/nginx/conf.d/apps/`
- **Features**:
  - **Route & Gateway Mapping**: Overview of main server blocks (e.g. `rpatic.conf`, HTTP 80 → HTTPS 443 redirect, SSL certificates) and separate application cards for `/apps/*.conf` with active `location` routes, target proxy ports, and buffering/timeout settings.
  - **In-App Config Editor**: Syntax-highlighted editor with line counters and tab indentation for modifying any `.conf` file safely.
  - **Automated Syntax Testing (`nginx -t`)**: Every save automatically runs `sudo nginx -t` and displays the exact stdout/stderr terminal output. If errors exist, they are highlighted immediately before downtime occurs.
  - **Hot Daemon Reloading (`nginx -s reload`)**: One-click configuration reloading via `sudo` elevation without interrupting active client connections.
  - **App Template Generator**: Quick-start templates for *Reverse Proxy (Node/PM2)*, *WebSocket / SSE*, *Static Frontend*, or *Blank*.
  - **Reload Reminders**: Clear reminder notifications after creating or editing files to prevent forgetting to reload the Nginx daemon.

![Nginx Configuration Editor](../snapshots/8.png)
*In-app configuration editor with instant `nginx -t` validation and sudo elevation.*

![New Application Config Generator](../snapshots/9.png)
*Template generator for quickly creating reverse proxy configurations in `/apps/`.*

---

## Related Documentation

- [Architecture & Layers](architecture.md)
- [Multi-Process Groups](multi-process-groups.md)
- [Port Manager Deep Dive](port-manager.md)
- [GitHub Integration & Auto-Deploy](auto-deploy.md)
- [Process Error Alerts](process-error-alerts.md)
