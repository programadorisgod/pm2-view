# Audit Module — Guide

This document covers PM2 View's audit log module: what it records, how to query and export it, and where the code lives.

> **TL;DR** — The audit module is an **append-only** trail of administrative actions (`admin` role only). Every admin mutation (user/team/project-member changes, project registration, team assignment) writes a row to `audit_logs`. Admins browse it at `/admin/audit` with filters and pagination, and can export the current filter set to CSV.

## What it does

| Capability | How it works |
| ---------- | ------------ |
| **Recording** | `logAudit()` / `AuditLogRepository.create()` insert a row with `action`, `actor`, `target`, `resource`, and a JSON `details` blob |
| **Immutability** | No update or delete path exists — audit logs can only be appended |
| **Visibility** | Admin-only (`requireAdmin()` on the page, `adminHandler()` on the export endpoint) |
| **Query** | Filters by action, actor (name/email/id), and date range; paginated |
| **Export** | CSV download of the current filter set (up to 10,000 rows) |

## Data model

Table `audit_logs` — `src/lib/db/schema/audit-logs.ts`:

| Column         | Type             | Description |
| -------------- | ---------------- | ----------- |
| `id`           | text (PK, UUID)  | Entry id |
| `action`       | text (not null)  | Machine-readable action name |
| `actor_id`     | text (not null)  | FK → `users.id` — who performed the action |
| `target_id`    | text (nullable)  | The user/resource affected |
| `resource_type`| text (nullable)  | `user`, `project`, `team` |
| `resource_id`  | text (nullable)  | ID of the specific resource |
| `details`      | text (nullable)  | JSON string with extra context (old/new role, name, etc.) |
| `timestamp`    | integer          | Unix epoch, defaults to `unixepoch()` |

There is a `relations` mapping so `auditLogs` joins back to `users` for the actor's name/email.

## Actions recorded

| Action | Triggered by |
| ------ | ------------ |
| `user_create` | Creating a user (Admin → Users) |
| `user_role_change` | Changing a user's global role |
| `user_ban` / `user_unban` | Banning / unbanning a user |
| `user_delete` | Deleting a user |
| `team_create` / `team_update` / `team_delete` | Team CRUD (Admin → Teams) |
| `team_member_add` / `team_member_remove` / `team_member_role_change` | Managing team members |
| `project_member_add` / `project_member_remove` / `project_member_role_change` | Managing project collaborators (Sharing) |
| `project_team_assign` | Assigning/unassigning a project to a team |
| `project_register` | Registering an unregistered PM2 process as a project |

Each action's `details` carries context, e.g. `project_member_role_change` stores `{ projectId, userId, oldRole, newRole }`.

## Filtering

The query supports these filters (`src/lib/db/repositories/audit-log-repository.interface.ts`):

| Filter | Type | Notes |
| ------ | ---- | ----- |
| `action` | string | Exact action name |
| `actorId` | string | Exact user id |
| `actorQuery` | string | Partial match across name, email, or id (resolves matching user ids first) |
| `targetId` | string | Exact target id |
| `resourceType` | string | `user` / `project` / `team` |
| `startDate` / `endDate` | Date | Inclusive timestamp range |

The UI exposes a subset of these: **Action** (dropdown), **Actor** (text search), **Start Date**, **End Date**.

## Step-by-step usage

1. Log in as an admin and open **Admin → Audit Logs** (`/admin/audit`).
2. Optionally set filters:
   - **Action** — pick from the dropdown (e.g. `Role Change`, `User Ban`, `Team Create`).
   - **Actor** — type a name, email, or ID fragment.
   - **Start/End Date** — constrain the timestamp range.
3. Click **Apply Filters** — the page reloads with the matching logs (paginated at 20 per page; navigate pages at the bottom).
4. Click **Export CSV** to download the current filter set as `audit-logs-YYYY-MM-DD.csv`.
5. Click **Clear** to remove all filters.

The CSV columns are: `id`, `action`, `actorEmail`, `actorName`, `targetId`, `resourceType`, `resourceId`, `details`, `timestamp`.

## Where the code lives

| File | Role |
| ---- | ---- |
| `src/lib/db/schema/audit-logs.ts` | Drizzle schema for `audit_logs` + actor relation |
| `src/lib/server/audit.ts` | `logAudit()` helper (supports object + positional API) |
| `src/lib/db/repositories/audit-log-repository.impl.ts` | `AuditLogRepository` — `create`, `findAll`, `count`, filter builder |
| `src/lib/db/repositories/audit-log-repository.interface.ts` | `IAuditLogRepository` + filter types |
| `src/lib/services/admin/audit.service.ts` | `AuditService` — `listLogs` (pagination), `exportCSV` |
| `src/lib/services/admin/user.service.ts` | Emits `user_*` actions |
| `src/lib/services/admin/team.service.ts` | Emits `team_*` actions |
| `src/lib/services/admin/project-sharing.service.ts` | Emits `project_member_*` and `project_team_assign` |
| `src/routes/api/projects/register/+server.ts` | Emits `project_register` |
| `src/routes/(app)/admin/audit/+page.server.ts` | Loads filtered, paginated logs (admin-only) |
| `src/routes/(app)/admin/audit/+page.svelte` | Table (desktop) + cards (mobile), pagination, export button |
| `src/routes/(app)/admin/audit/export/+server.ts` | CSV export (admin-only) |
| `src/lib/components/admin/audit-filters.svelte` | Filter bar UI |
| `src/lib/validation/audit-schemas.ts` | Zod schema for list/query params |

## Notes & limitations

- Audit logs are **never** cleaned up automatically — there is no retention/rotation job. Plan storage growth accordingly.
- `details` is stored as a JSON string; the UI parses it back into key/value pairs for display.
- Export fetches up to 10,000 rows regardless of the on-screen pagination.
