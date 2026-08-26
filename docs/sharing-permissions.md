# Sharing & Permissions — Guide

This document covers how access control works in PM2 View: the three role tiers (global, team, project), how they map onto each other, and how to share a project step by step.

## The three role tiers

| Tier | Stored in | Values | Scope |
| ---- | --------- | ------ | ----- |
| **Global** | `users.role` | `admin`, `user`, `viewer` | Whole app (sidebar access, admin panel, system operations) |
| **Team** | `team_members.role` | `team_owner`, `team_admin`, `team_member` | Within a team |
| **Project** | `project_members.role` | `owner`, `editor`, `viewer` | Within a single project |

Every new account starts as global `user`. There is **no bootstrap admin** — promote one with `npm run make-admin <email>`.

## Global roles & permission matrix

Defined in `src/lib/auth/permissions.ts` (better-auth access plugin). The statements:

```
user:            create, read, list, get, update, delete, set-role, ban,
                 set-password, impersonate, impersonate-admins
project:         create, read, update, delete
project_member:  create, read, update, delete
team:            create, read, update, delete
team_member:     create, read, update, delete
audit_log:       create, read, delete
```

| Resource | `admin` | `user` | `viewer` |
| -------- | ------- | ------- | -------- |
| `user` | create, read, list, get, update, delete, set-role, ban, set-password, impersonate, impersonate-admins | create, read, list, get | read, list, get |
| `project` | create, read, update, delete | create, read, update | read |
| `project_member` | create, read, update, delete | create, read | read |
| `team` | create, read, update, delete | create, read | read |
| `team_member` | create, read, update, delete | create, read | read |
| `audit_log` | create, read, delete | — | — |

The **Roles** page (`/admin/roles`) renders this exact matrix live from `hasPermission()`.

### What `admin` means in practice

- Access to the `/admin` panel (Users, Teams, Audit Logs, Roles).
- See **all** projects (bypasses project-level access checks).
- Admin-only operations: `PM2 Save`, `PM2 Startup`, the **Update** button, process registration, and assigning projects to teams.

## Team roles

| Role | Permissions |
| ---- | ----------- |
| `team_owner` | Full control: manage members, change roles, delete team |
| `team_admin` | Manage members, invite/remove users |
| `team_member` | View team projects, no management |

## Project roles

| Role | Permissions |
| ---- | ----------- |
| `owner` | Full control including deletion |
| `editor` | Can modify (env vars, deploy settings, restart/stop) |
| `viewer` | Read-only |

## How access is resolved on a project

`getProjectRole()` in `src/lib/server/project-access.ts` checks, in order:

1. **Admin bypass** → returns `owner` (universal access).
2. **`project_members`** — if the user has an explicit entry, that role wins.
3. **Project creator** — if `projects.userId === userId`, returns `owner`.
4. **Team membership** — if the project has a `teamId` and the user belongs to that team, the team role is mapped to a project role.

### Team → project role mapping

| Team role | Project role |
| --------- | ------------ |
| `team_owner` | `owner` |
| `team_admin` | `editor` |
| `team_member` | `viewer` |

So assigning a project to a team grants every team member access, with the team role translated into a project role.

## Route guards

`src/lib/server/route-guards.ts` + `src/lib/server/admin-handler.ts`:

- `requireAdmin(user)` — throws 403 unless `admin`.
- `requireRole(user, role)` — throws 403 unless the user has that role (admins always pass).
- `requireProjectAccess(projectId, user, requiredRole?)` — resolves the effective project role and throws 403 if absent or below `requiredRole`.
- `adminHandler(handler)` — wraps API endpoints: requires auth + `admin`, logs errors, rethrows status errors.

## Safety guards (HTTP 403/409)

Enforced in `UserService`, `TeamService`, and `ProjectSharingService`:

- An admin cannot change their own role, ban themselves, or delete themselves.
- The **last remaining admin** cannot be demoted, banned, or deleted.
- The **last `owner`** of a project cannot be removed or demoted.
- The **last `team_owner`** of a team cannot be removed or demoted.

## Step-by-step: share a project with a user

1. Open the project detail page and switch to the **Sharing** tab, then click **Manage Collaborators** (or navigate to `/projects/[id]/sharing`).
2. Click **Invite User**.
3. Pick a user from the dropdown and a role (`viewer`, `editor`, or `owner`).
   - Choosing `owner` (or `admin`-class elevated roles) prompts a confirmation dialog.
4. Click **Invite**. The user is added to `project_members` and the action is audit-logged (`project_member_add`).

To change a role, use the dropdown next to a member; to remove, click **Remove** (audit-logged as `project_member_role_change` / `project_member_remove`).

## Step-by-step: assign a project to a team (admin only)

1. On the same **Sharing** page, find the **Team Assignment** card (visible only to admins).
2. Click **Assign Team**, choose a team, and confirm.
3. Every member of that team immediately gains access with the mapped role (see table above). The assignment is audit-logged as `project_team_assign`.

Use **Change Team** or **Remove Team** to reassign or detach. Removing a team revokes team-based access (members lose access unless they also have an explicit `project_members` entry).

## Where the code lives

| File | Role |
| ---- | ---- |
| `src/lib/auth/permissions.ts` | Global permission statements + role matrix |
| `src/lib/db/schema/users.ts` | `users.role` |
| `src/lib/db/schema/teams.ts` | `teams` + `team_members` (team roles) |
| `src/lib/db/schema/project-members.ts` | `project_members` (project roles) |
| `src/lib/server/project-access.ts` | `getProjectRole`, `isProjectMember`, `canAccessProject`, team→project mapping |
| `src/lib/server/team-access.ts` | `getTeamRole`, `isTeamMember`, `canManageTeam` |
| `src/lib/server/route-guards.ts` | `requireAdmin`, `requireRole`, `requireProjectAccess` |
| `src/lib/server/admin-handler.ts` | `adminHandler` wrapper |
| `src/lib/services/admin/user.service.ts` | User role/ban/delete + safety guards |
| `src/lib/services/admin/team.service.ts` | Team + member management + safety guards |
| `src/lib/services/admin/project-sharing.service.ts` | Project members, roles, team assignment |
| `src/routes/(app)/projects/[id]/sharing/+page.server.ts` | Loads members, available users, team |
| `src/routes/(app)/projects/[id]/sharing/+page.svelte` | Sharing UI (members, invite, team assignment) |
| `src/routes/(app)/projects/[id]/members/+server.ts` | Member add/update/remove API |
| `src/routes/(app)/admin/projects/[id]/team/+server.ts` | Team assignment API |
| `src/routes/(app)/admin/roles/+page.svelte` | Roles & permissions page |
