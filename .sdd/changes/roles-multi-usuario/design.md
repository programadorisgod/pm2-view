# Technical Design: Multi-user Roles System with Admin Dashboard

## Change Information
- **Change Name**: `roles-multi-usuario`
- **Date**: 2026-04-29
- **Status**: Design Phase
- **SDD Phase**: Design

---

## 1. Architecture Overview

### Approach
Hybrid authorization model using Better Auth admin plugin for global roles (`admin`, `user`, `viewer`) combined with custom Drizzle ORM tables for project-level (`owner`, `editor`, `viewer`) and team-level (`team_owner`, `team_admin`, `team_member`) access control, with append-only audit logs for traceability.

### Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Better Auth admin plugin for global roles** | Leverages built-in `role`, `banned`, `banReason`, `banExpires` fields; provides `admin` API routes |
| 2 | **Custom `project_members` table** | Projects need per-user role assignment independent of global roles; many-to-many relationship |
| 3 | **Custom `teams` + `team_members` tables** | Team management is not covered by Better Auth's organization plugin; need lightweight team grouping |
| 4 | **Append-only `audit_logs` table** | Immutable audit trail; no UPDATE/DELETE operations allowed at application layer |
| 5 | **`createAccessControl()` for permissions** | Better Auth's ACL system maps resources to actions; used for both global and project-level checks |
| 6 | **Server-side permission checks in `+layout.server.ts` and `+page.server.ts`** | All route protection happens on the server; client receives only authorized data |
| 7 | **Melt UI + custom Svelte 5 components** | Consistent with project stack; uses runes (`$props`, `@render` snippets) |

---

## 2. Database Schema Design

### 2.1 Users Table (Modified)

Better Auth admin plugin automatically adds these fields to the `users` table:
- `role` (text): `'admin' | 'user' | 'viewer'` (default: `'user'`)
- `banned` (boolean): default false
- `banReason` (text): nullable
- `banExpires` (timestamp): nullable

No schema changes needed in `users.ts` — Better Auth handles this via the admin plugin's schema extensions.

### 2.2 Project Members Table (New)

```typescript
// src/lib/db/schema/project-members.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { projects } from './projects';

export const projectMembers = sqliteTable('project_members', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull().default('viewer'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

// Unique constraint: one role per user per project
// Handled via Drizzle unique index
export const projectMembersIndexes = {
  unq_project_user: (table: typeof projectMembers) =>
    sql`CREATE UNIQUE INDEX IF NOT EXISTS unq_project_user ON ${table} (project_id, user_id)`
};
```

### 2.3 Teams Table (New)

```typescript
// src/lib/db/schema/teams.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});
```

### 2.4 Team Members Table (New)

```typescript
// src/lib/db/schema/team-members.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { teams } from './teams';

export const teamMembers = sqliteTable('team_members', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['team_owner', 'team_admin', 'team_member'] }).notNull().default('team_member'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

// Unique constraint: one role per user per team
```

### 2.5 Audit Logs Table (New)

```typescript
// src/lib/db/schema/audit-logs.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').notNull().references(() => users.id), // Who performed the action
  action: text('action').notNull(), // e.g., 'role_change', 'project_member_add', 'team_create', 'user_ban'
  targetType: text('target_type'), // e.g., 'user', 'project', 'team'
  targetId: text('target_id'), // ID of the affected resource
  oldValue: text('old_value', { mode: 'json' }), // Previous state (JSON)
  newValue: text('new_value', { mode: 'json' }), // New state (JSON)
  metadata: text('metadata', { mode: 'json' }), // Additional context (reason, etc.)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)
});

// Indexes for efficient querying
// - actorId for "what did this user do?"
// - action for filtering by type
// - targetType + targetId for "what happened to this resource?"
// - createdAt for date range queries
```

### 2.6 Schema Exports Update

```typescript
// src/lib/db/schema/index.ts (modified)
export { users } from './users';
export { sessions } from './sessions';
export { accounts } from './accounts';
export { verifications } from './verifications';
export { projects } from './projects';
export { projectMembers } from './project-members';
export { teams } from './teams';
export { teamMembers } from './team-members';
export { auditLogs } from './audit-logs';
export { envVars } from './env-vars';
export { metrics } from './metrics';
```

---

## 3. Better Auth Integration

### 3.1 Admin Plugin Configuration

```typescript
// src/lib/auth/auth.ts (modified)
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { admin } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { db } from '../db/db';
import * as schema from '../db/schema';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';

// Define access control statements
const ac = createAccessControl({
  user: ['create', 'read', 'update', 'delete'],
  project: ['create', 'read', 'update', 'delete', 'share'],
  projectMember: ['add', 'remove', 'update_role'],
  team: ['create', 'read', 'update', 'delete', 'dissolve'],
  teamMember: ['add', 'remove', 'update_role'],
  auditLog: ['read'],
  admin: ['read', 'manage_users', 'manage_roles', 'manage_teams', 'view_audit']
} as const);

// Define roles with permissions
const adminRole = ac.newRole({
  user: ['create', 'read', 'update', 'delete'],
  project: ['create', 'read', 'update', 'delete', 'share'],
  projectMember: ['add', 'remove', 'update_role'],
  team: ['create', 'read', 'update', 'delete', 'dissolve'],
  teamMember: ['add', 'remove', 'update_role'],
  auditLog: ['read'],
  admin: ['read', 'manage_users', 'manage_roles', 'manage_teams', 'view_audit']
});

const userRole = ac.newRole({
  user: ['read', 'update'], // Can read all users, update self
  project: ['create', 'read', 'update', 'share'], // Can create projects, share with others
  projectMember: [], // Cannot manage project members directly (project owner/editor does this)
  team: ['create', 'read'], // Can create teams, view own teams
  teamMember: [], // Cannot manage team members directly
  auditLog: [],
  admin: []
});

const viewerRole = ac.newRole({
  user: ['read'], // Read-only access to user list
  project: ['read'], // Read-only access to projects
  projectMember: [],
  team: ['read'],
  teamMember: [],
  auditLog: [],
  admin: []
});

const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || 'localhost')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

const trustedOrigins = allowedHosts.map((host) =>
  host === 'localhost' ? 'http://localhost:5179' : `https://${host}`
);

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL || 'http://localhost:5179',
  basePath: `${base}/api/auth`,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      ...schema,
      user: schema.users,
      session: schema.sessions
    },
    usePlural: true
  }),
  plugins: [
    sveltekitCookies(getRequestEvent),
    admin({
      ac,
      roles: {
        admin: adminRole,
        user: userRole,
        viewer: viewerRole
      },
      defaultRole: 'user'
    })
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days in seconds
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5 // 5 minutes
    }
  },
  emailAndPassword: {
    enabled: true
  }
});
```

### 3.2 AuthUser Type Update

```typescript
// src/lib/auth/provider.interface.ts (modified)
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  role: 'admin' | 'user' | 'viewer'; // Added: comes from Better Auth admin plugin
  banned: boolean; // Added: comes from Better Auth admin plugin
  banReason: string | null; // Added
  banExpires: Date | null; // Added
  createdAt: Date;
}
```

### 3.3 Session Normalization Update

```typescript
// src/lib/auth/providers/better-auth.provider.ts (modified)
private normalizeSession(raw: unknown): AuthSession {
  const result = raw as Record<string, unknown>;
  const user = result.user as Record<string, unknown>;
  const session = result.session as Record<string, unknown> | undefined;

  return {
    user: {
      id: user.id as string,
      email: user.email as string,
      name: (user.name as string) ?? null,
      emailVerified: Boolean(user.emailVerified),
      role: (user.role as 'admin' | 'user' | 'viewer') || 'user', // Default to 'user' if missing
      banned: Boolean(user.banned),
      banReason: (user.banReason as string) ?? null,
      banExpires: user.banExpires ? new Date(user.banExpires as string) : null,
      createdAt: new Date(user.createdAt as string)
    },
    token: (result.token ?? session?.token ?? '') as string,
    expiresAt: new Date((session?.expiresAt ?? user.expiresAt) as string)
  };
}
```

---

## 4. Authorization Layer

### 4.1 Server-Side Permission Checking Utility

```typescript
// src/lib/auth/permissions.ts (new)
import type { AuthUser } from '../auth/provider.interface';
import type { ProjectMemberRole, TeamMemberRole } from '../db/schema';

export type Resource = 'user' | 'project' | 'projectMember' | 'team' | 'teamMember' | 'auditLog' | 'admin';
export type Action = string;

export interface PermissionCheck {
  resource: Resource;
  action: Action;
}

/**
 * Check if a user has a specific permission based on their global role.
 * Uses Better Auth's access control statements.
 */
export function hasGlobalPermission(user: AuthUser, resource: Resource, action: Action): boolean {
  // Admin has all permissions
  if (user.role === 'admin') return true;

  // Define permission matrix for user and viewer roles
  const permissions: Record<string, Record<Resource, Action[]>> = {
    user: {
      user: ['read', 'update'],
      project: ['create', 'read', 'update', 'share'],
      projectMember: [],
      team: ['create', 'read'],
      teamMember: [],
      auditLog: [],
      admin: []
    },
    viewer: {
      user: ['read'],
      project: ['read'],
      projectMember: [],
      team: ['read'],
      teamMember: [],
      auditLog: [],
      admin: []
    },
    admin: {
      // Admin has all permissions (handled above)
      user: [], project: [], projectMember: [], team: [], teamMember: [], auditLog: [], admin: []
    }
  };

  const userPermissions = permissions[user.role];
  if (!userPermissions) return false;

  return userPermissions[resource]?.includes(action) ?? false;
}

/**
 * Check if a user has a specific project-level permission.
 */
export function hasProjectPermission(
  projectRole: ProjectMemberRole | null,
  action: 'read' | 'update' | 'delete' | 'share'
): boolean {
  if (!projectRole) return false;

  const permissions: Record<ProjectMemberRole, ('read' | 'update' | 'delete' | 'share')[]> = {
    owner: ['read', 'update', 'delete', 'share'],
    editor: ['read', 'update'],
    viewer: ['read']
  };

  return permissions[projectRole]?.includes(action) ?? false;
}

/**
 * Check if a user has a specific team-level permission.
 */
export function hasTeamPermission(
  teamRole: TeamMemberRole | null,
  action: 'read' | 'update' | 'delete' | 'add_member' | 'remove_member' | 'update_role' | 'dissolve'
): boolean {
  if (!teamRole) return false;

  const permissions: Record<TeamMemberRole, string[]> = {
    team_owner: ['read', 'update', 'delete', 'add_member', 'remove_member', 'update_role', 'dissolve'],
    team_admin: ['read', 'update', 'add_member', 'remove_member', 'update_role'],
    team_member: ['read']
  };

  return permissions[teamRole]?.includes(action) ?? false;
}

/**
 * Check if user is the last admin in the system (prevent self-demotion).
 */
export async function isLastAdmin(db: any, userId: string): Promise<boolean> {
  const adminCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.banned, false)));
  
  return adminCount[0].count === 1;
}
```

### 4.2 Route Guard Pattern in `+layout.server.ts`

```typescript
// src/routes/(app)/+layout.server.ts (modified)
import { auth } from '$lib/auth';
import { redirect, error } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { LayoutServerLoad } from './$types';
import { hasGlobalPermission } from '$lib/auth/permissions';

export const load: LayoutServerLoad = async (event) => {
  const session = await auth.api.getSession({
    headers: event.request.headers
  });

  if (!session) {
    throw redirect(302, `${base}/login`);
  }

  // Check if user is banned
  if (session.user.banned) {
    throw error(401, 'Your account has been banned.');
  }

  // Check admin route access
  if (event.route.id?.startsWith('/(app)/admin')) {
    if (!hasGlobalPermission(session.user, 'admin', 'read')) {
      throw error(403, 'Access denied. Admin role required.');
    }
  }

  return {
    user: session.user,
    session: session.session
  };
};
```

### 4.3 Project-Level Access Checking

```typescript
// src/lib/auth/project-access.ts (new)
import { db } from '$lib/db/db';
import { projectMembers } from '$lib/db/schema/project-members';
import { eq, and } from 'drizzle-orm';
import type { ProjectMemberRole } from '$lib/db/schema/project-members';

/**
 * Get user's role for a specific project.
 * Returns null if user is not a member.
 */
export async function getProjectRole(userId: string, projectId: string): Promise<ProjectMemberRole | null> {
  const result = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(
      eq(projectMembers.userId, userId),
      eq(projectMembers.projectId, projectId)
    ))
    .limit(1);

  return result[0]?.role ?? null;
}

/**
 * Check if user has access to a project.
 * Owners of projects (via projects.userId) also have owner access.
 */
export async function hasProjectAccess(
  userId: string,
  projectId: string,
  requiredRole: ProjectMemberRole = 'viewer'
): Promise<boolean> {
  // First check if user is the project creator (implicit owner)
  const project = await db
    .select({ userId: projects.userId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (project[0]?.userId === userId) return true;

  // Then check project_members table
  const role = await getProjectRole(userId, projectId);
  if (!role) return false;

  // Role hierarchy: owner > editor > viewer
  const roleHierarchy: Record<ProjectMemberRole, number> = {
    owner: 3,
    editor: 2,
    viewer: 1
  };

  return roleHierarchy[role] >= roleHierarchy[requiredRole];
}
```

---

## 5. Admin Dashboard Routes

### 5.1 Route Structure

```
src/routes/(app)/admin/
├── +layout.svelte          # Admin layout with sidebar navigation
├── +page.svelte            # Admin dashboard overview
├── users/
│   ├── +page.svelte        # User list with pagination
│   ├── +page.server.ts     # Server-side user listing
│   └── [id]/
│       ├── +page.svelte    # User detail/edit page
│       └── +page.server.ts # User update handler
├── teams/
│   ├── +page.svelte        # Team list with pagination
│   ├── +page.server.ts     # Server-side team listing
│   └── [id]/
│       ├── +page.svelte    # Team detail with members
│       └── +page.server.ts # Team update/dissolve handler
├── audit/
│   ├── +page.svelte        # Audit log viewer with filters
│   └── +page.server.ts     # Server-side audit log query
└── roles/
    ├── +page.svelte        # Role definitions and permissions matrix
    └── +page.server.ts     # Role listing
```

### 5.2 API Endpoints (via Better Auth admin plugin)

Better Auth admin plugin automatically creates these endpoints:

- `POST /api/auth/admin/set-role` — Set user role
- `POST /api/auth/admin/ban-user` — Ban user
- `POST /api/auth/admin/unban-user` — Unban user
- `POST /api/auth/admin/has-permission` — Check permissions
- `GET /api/auth/admin/list-users` — List users (with pagination)

### 5.3 Custom API Endpoints for Project/Team Management

```
src/routes/(app)/api/
├── projects/
│   └── [id]/
│       └── members/
│           ├── +server.ts  # GET (list), POST (add), DELETE (remove)
│           └── [userId]/
│               └── +server.ts  # PATCH (update role)
└── teams/
    ├── +server.ts          # GET (list), POST (create)
    └── [id]/
        ├── +server.ts      # GET (detail), PATCH (update), DELETE (dissolve)
        └── members/
            ├── +server.ts  # GET (list), POST (add)
            └── [userId]/
                └── +server.ts  # PATCH (update role), DELETE (remove)
```

---

## 6. Component Architecture

### 6.1 Reusable Components (New)

```
src/lib/components/admin/
├── user-list.svelte           # Paginated user table with role/badge
├── user-role-selector.svelte # Dropdown for role selection
├── user-ban-modal.svelte     # Modal for banning user with reason
├── team-list.svelte          # Paginated team table
├── team-member-manager.svelte # Add/remove team members
├── project-member-manager.svelte # Add/remove project members
├── audit-log-viewer.svelte   # Filterable audit log table
├── permission-matrix.svelte  # Visual permission matrix
└── confirm-action-modal.svelte # Reusable confirmation modal
```

### 6.2 Component Patterns (Svelte 5 with Runes)

```svelte
<!-- src/lib/components/admin/user-list.svelte -->
<script lang="ts">
  import { cn } from '$lib/motion-core/utils/cn';
  import Button from '$lib/ui/components/button.svelte';
  import Card from '$lib/ui/components/card.svelte';
  import type { AuthUser } from '$lib/auth/provider.interface';
  
  let {
    users = [],
    onrolechange,
    onban,
    onunban
  }: {
    users: (AuthUser & { projectCount?: number })[];
    onrolechange?: (userId: string, newRole: string) => void;
    onban?: (userId: string, reason: string) => void;
    onunban?: (userId: string) => void;
  } = $props();
</script>

<Card>
  <div class="overflow-x-auto">
    <table class="w-full text-left">
      <thead>
        <tr class="border-b border-gray-700">
          <th class="p-3">Name</th>
          <th class="p-3">Email</th>
          <th class="p-3">Role</th>
          <th class="p-3">Status</th>
          <th class="p-3">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each users as user (user.id)}
          <tr class="border-b border-gray-800 hover:bg-gray-800/50">
            <td class="p-3">{user.name ?? 'N/A'}</td>
            <td class="p-3">{user.email}</td>
            <td class="p-3">
              <span class="badge" class:badge-danger={user.role === 'admin'}>
                {user.role}
              </span>
            </td>
            <td class="p-3">
              {#if user.banned}
                <span class="badge badge-danger">Banned</span>
              {:else}
                <span class="badge badge-success">Active</span>
              {/if}
            </td>
            <td class="p-3 space-x-2">
              <Button size="xs" onclick={() => onrolechange?.(user.id, 'admin')}>
                Make Admin
              </Button>
              {#if user.banned}
                <Button size="xs" variant="secondary" onclick={() => onunban?.(user.id)}>
                  Unban
                </Button>
              {:else}
                <Button size="xs" variant="danger" onclick={() => onban?.(user.id, 'Violation')}>
                  Ban
                </Button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</Card>
```

### 6.3 Admin Layout with Navigation

```svelte
<!-- src/routes/(app)/admin/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import Sidebar from '$lib/ui/components/sidebar.svelte';
  import type { AuthUser } from '$lib/auth/provider.interface';
  
  let {
    children,
    data
  }: {
    children?: import('svelte').Snippet;
    data: { user: AuthUser };
  } = $props();
  
  const navItems = [
    { href: '/admin', label: 'Overview', icon: 'dashboard' },
    { href: '/admin/users', label: 'Users', icon: 'people' },
    { href: '/admin/teams', label: 'Teams', icon: 'group' },
    { href: '/admin/audit', label: 'Audit Logs', icon: 'history' },
    { href: '/admin/roles', label: 'Roles', icon: 'security' }
  ];
</script>

<div class="flex min-h-screen">
  <Sidebar items={navItems} activePath={$page.url.pathname} />
  <main class="flex-1 p-lg">
    {@render children?.()}
  </main>
</div>
```

---

## 7. Migration Strategy

### 7.1 Drizzle Migration Steps

1. **Generate migration for Better Auth admin plugin fields**:
   ```bash
   npm run db:generate  # Better Auth plugin adds role, banned, etc. to users table
   ```

2. **Create migration for new tables**:
   ```typescript
   // drizzle/migrations/000X_add_project_members_teams_audit.ts
   export async function up(db: any) {
     // Create project_members table
     await db.run(sql`
       CREATE TABLE IF NOT EXISTS project_members (
         id TEXT PRIMARY KEY,
         project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         role TEXT NOT NULL DEFAULT 'viewer',
         created_at INTEGER NOT NULL DEFAULT (unixepoch()),
         updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
         UNIQUE(project_id, user_id)
       )
     `);
     
     // Create teams table
     await db.run(sql`
       CREATE TABLE IF NOT EXISTS teams (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL UNIQUE,
         description TEXT,
         owner_id TEXT NOT NULL REFERENCES users(id),
         created_at INTEGER NOT NULL DEFAULT (unixepoch()),
         updated_at INTEGER NOT NULL DEFAULT (unixepoch())
       )
     `);
     
     // Create team_members table
     await db.run(sql`
       CREATE TABLE IF NOT EXISTS team_members (
         id TEXT PRIMARY KEY,
         team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
         user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         role TEXT NOT NULL DEFAULT 'team_member',
         created_at INTEGER NOT NULL DEFAULT (unixepoch()),
         UNIQUE(team_id, user_id)
       )
     `);
     
     // Create audit_logs table
     await db.run(sql`
       CREATE TABLE IF NOT EXISTS audit_logs (
         id TEXT PRIMARY KEY,
         actor_id TEXT NOT NULL REFERENCES users(id),
         action TEXT NOT NULL,
         target_type TEXT,
         target_id TEXT,
         old_value TEXT, -- JSON
         new_value TEXT, -- JSON
         metadata TEXT, -- JSON
         created_at INTEGER NOT NULL DEFAULT (unixepoch())
       )
     `);
     
     // Create indexes
     await db.run(sql`CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id)`);
     await db.run(sql`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)`);
     await db.run(sql`CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id)`);
     await db.run(sql`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)`);
   }
   ```

### 7.2 Handling Existing Users

```typescript
// Migration script: Set default role for existing users
// This runs after the migration adds the 'role' column
export async function setDefaultRolesForExistingUsers(db: any) {
  await db
    .update(users)
    .set({ role: 'user' })
    .where(sql`role IS NULL`);
}
```

### 7.3 Handling Existing Projects

```typescript
// Migration script: Create project_members entries for existing projects
// Project creators become 'owner' in project_members
export async function migrateExistingProjects(db: any) {
  const existingProjects = await db
    .select({
      id: projects.id,
      userId: projects.userId
    })
    .from(projects);
  
  for (const project of existingProjects) {
    await db
      .insert(projectMembers)
      .values({
        id: crypto.randomUUID(),
        projectId: project.id,
        userId: project.userId,
        role: 'owner'
      })
      .onConflictDoNothing(); // Skip if already exists
  }
}
```

---

## 8. File Changes Summary

### New Files (12)
| File | Description |
|------|-------------|
| `src/lib/db/schema/project-members.ts` | Project members table definition |
| `src/lib/db/schema/teams.ts` | Teams table definition |
| `src/lib/db/schema/team-members.ts` | Team members table definition |
| `src/lib/db/schema/audit-logs.ts` | Audit logs table definition |
| `src/lib/auth/permissions.ts` | Permission checking utilities |
| `src/lib/auth/project-access.ts` | Project-level access utilities |
| `src/lib/components/admin/user-list.svelte` | User list component |
| `src/lib/components/admin/team-list.svelte` | Team list component |
| `src/lib/components/admin/audit-log-viewer.svelte` | Audit log viewer component |
| `src/lib/components/admin/user-role-selector.svelte` | Role selector dropdown |
| `src/lib/components/admin/confirm-action-modal.svelte` | Confirmation modal |
| `src/routes/(app)/api/audit/+server.ts` | Audit log API endpoint |

### Modified Files (6)
| File | Changes |
|------|----------|
| `src/lib/auth/auth.ts` | Add admin plugin with `createAccessControl` |
| `src/lib/auth/provider.interface.ts` | Add `role`, `banned`, `banReason`, `banExpires` to `AuthUser` |
| `src/lib/auth/providers/better-auth.provider.ts` | Normalize new fields in `normalizeSession()` |
| `src/lib/db/schema/index.ts` | Export new schema files |
| `src/routes/(app)/+layout.server.ts` | Add admin route guard and banned check |
| `drizzle.config.ts` | Ensure new schema files are included |

### New Routes (10)
| Route | Description |
|-------|-------------|
| `src/routes/(app)/admin/+layout.svelte` | Admin layout with nav |
| `src/routes/(app)/admin/+page.svelte` | Dashboard overview |
| `src/routes/(app)/admin/users/+page.svelte` | User management page |
| `src/routes/(app)/admin/users/+page.server.ts` | User list server load |
| `src/routes/(app)/admin/teams/+page.svelte` | Team management page |
| `src/routes/(app)/admin/teams/+page.server.ts` | Team list server load |
| `src/routes/(app)/admin/audit/+page.svelte` | Audit log viewer page |
| `src/routes/(app)/admin/audit/+page.server.ts` | Audit log server load |
| `src/routes/(app)/admin/roles/+page.svelte` | Role definitions page |
| `src/routes/(app)/admin/roles/+page.server.ts` | Role list server load |

---

## 9. Testing Strategy

### Unit Tests
- `src/tests/auth/permissions.test.ts` — Test `hasGlobalPermission()`, `hasProjectPermission()`, `hasTeamPermission()`
- `src/tests/auth/project-access.test.ts` — Test `getProjectRole()`, `hasProjectAccess()`

### Integration Tests
- `src/tests/api/admin-users.test.ts` — Test admin user management endpoints
- `src/tests/api/project-members.test.ts` — Test project sharing flow
- `src/tests/api/team-management.test.ts` — Test team CRUD and membership

### E2E Tests (Future)
- Admin dashboard user journey (login → navigate to admin → manage users)
- Project sharing journey (create project → invite user → verify access)

### Coverage Target
- Permission utilities: 100%
- API endpoints: 90%+
- Components: 80%+ (focus on logic, not rendering)

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Better Auth admin plugin API changes | Medium | High | Pin version, monitor changelog, write adapter layer |
| Breaking change to `AuthUser` type | High | Medium | Update all usages, add migration for default role |
| Performance: audit_logs table growth | High | Medium | Pagination, indexing, consider archival strategy |
| Complexity: triple permission system | Medium | Medium | Clear separation in UI/UX, thorough documentation |
| Race conditions in role changes | Low | High | Use database transactions, optimistic locking |
| Self-demotion of last admin | Medium | High | Check `isLastAdmin()` before any role change |

---

## 11. Open Questions

None — all requirements from proposal and specs are addressed in this design.

---

## 12. Next Steps

1. **sdd-tasks**: Break down this design into implementable tasks
2. **Implementation**: Start with database schema and migrations
3. **Better Auth setup**: Configure admin plugin with access control
4. **Core utilities**: Build permission checking and access control
5. **Admin UI**: Build dashboard routes and components
6. **Testing**: Write unit and integration tests
7. **Migration**: Run migrations and verify data integrity
8. **sdd-verify**: Validate implementation against specs

---

## Appendix: Access Control Statement Reference

```typescript
// Full access control statements for reference
const ac = createAccessControl({
  user: ['create', 'read', 'update', 'delete'],
  project: ['create', 'read', 'update', 'delete', 'share'],
  projectMember: ['add', 'remove', 'update_role'],
  team: ['create', 'read', 'update', 'delete', 'dissolve'],
  teamMember: ['add', 'remove', 'update_role'],
  auditLog: ['read'],
  admin: ['read', 'manage_users', 'manage_roles', 'manage_teams', 'view_audit']
} as const);
```

---

**Design completed**: 2026-04-29  
**Ready for**: sdd-tasks phase
