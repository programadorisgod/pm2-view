# Specification: roles-multi-usuario

## Domain: user-roles

### Requirement: Global Role Assignment
The system MUST support three global roles for users: `admin`, `user`, and `viewer`. Each user MUST have exactly one global role assigned at any time.

#### Scenario: Admin assigns admin role to a user
Given a user with role `user` exists in the system  
And an admin user is authenticated  
When the admin assigns the role `admin` to the user  
Then the user's global role MUST be updated to `admin`  
And the role change MUST be recorded in the audit log

#### Scenario: Admin assigns viewer role to a user
Given a user with role `user` exists in the system  
And an admin user is authenticated  
When the admin assigns the role `viewer` to the user  
Then the user's global role MUST be updated to `viewer`  
And the role change MUST be recorded in the audit log

#### Scenario: Non-admin cannot assign roles
Given a user with role `user` is authenticated  
When the user attempts to assign a role to another user  
Then the system MUST return a 403 Forbidden error  
And the role MUST NOT be changed

#### Scenario: Self-role-change prevention
Given an admin user is authenticated  
When the admin attempts to change their own role  
Then the system MUST reject the change with a 403 Forbidden error  
And the admin's role MUST remain unchanged

#### Scenario: Last admin cannot be banned or demoted
Given only one user with role `admin` exists in the system  
When an attempt is made to ban that admin or change their role to non-admin  
Then the system MUST reject the operation  
And the admin's role and status MUST remain unchanged

#### Scenario: New user gets default role
Given a new user registers in the system  
When the user account is created  
Then the user's global role MUST be set to `user` by default  
And no manual role assignment SHOULD be required

---

### Requirement: User Banning and Unbanning
The system MUST allow admins to ban and unban users. Banned users MUST NOT be able to authenticate.

#### Scenario: Admin bans a user
Given a user with role `user` exists in the system  
And the user is not currently banned  
When an admin bans the user with a reason  
Then the user's banned status MUST be set to true  
And the ban reason MUST be recorded  
And the user MUST NOT be able to authenticate  
And the ban action MUST be recorded in the audit log

#### Scenario: Admin unbans a user
Given a user with role `user` is banned  
When an admin unbans the user  
Then the user's banned status MUST be set to false  
And the user MUST be able to authenticate  
And the unban action MUST be recorded in the audit log

#### Scenario: Cannot ban the last admin
Given only one user with role `admin` exists in the system  
When an attempt is made to ban that admin  
Then the system MUST reject the operation  
And the admin MUST NOT be banned

#### Scenario: Banned user cannot access protected routes
Given a user is banned  
When the user attempts to access any authenticated route  
Then the system MUST return a 401 Unauthorized error  
And the user MUST be redirected to the login page

---

### Requirement: Role-Based Permission Checking
The system MUST provide a `hasPermission()` function that checks if a user has a specific permission based on their global role.

#### Scenario: Admin has all permissions
Given a user with role `admin` is authenticated  
When the system checks if the user has permission to perform any action  
Then the system MUST return true for all permission checks

#### Scenario: Viewer has read-only permissions
Given a user with role `viewer` is authenticated  
When the system checks if the user has permission to read resources  
Then the system MUST return true for read permissions  
When the system checks if the user has permission to create, update, or delete resources  
Then the system MUST return false

#### Scenario: User has standard permissions
Given a user with role `user` is authenticated  
When the system checks if the user has permission to read and create resources  
Then the system MUST return true  
When the system checks if the user has permission to perform admin actions  
Then the system MUST return false

---

## Domain: project-sharing

### Requirement: Project Role Assignment
The system MUST support per-project access control with three roles: `owner`, `editor`, and `viewer`. Each user-project pair MUST have exactly one role assigned.

#### Scenario: Project owner invites user as editor
Given a project exists with an owner  
And a user with role `user` exists in the system  
When the owner invites the user to the project with role `editor`  
Then the user MUST be added to the project_members table with role `editor`  
And the invitation MUST be recorded in the audit log

#### Scenario: Project owner invites user as viewer
Given a project exists with an owner  
And a user with role `user` exists in the system  
When the owner invites the user to the project with role `viewer`  
Then the user MUST be added to the project_members table with role `viewer`  
And the invitation MUST be recorded in the audit log

#### Scenario: Editor cannot invite users
Given a user with role `editor` on a project is authenticated  
When the user attempts to invite another user to the project  
Then the system MUST return a 403 Forbidden error  
And no new project member MUST be added

#### Scenario: Viewer cannot modify project
Given a user with role `viewer` on a project is authenticated  
When the user attempts to modify project settings  
Then the system MUST return a 403 Forbidden error  
And the project MUST NOT be modified

---

### Requirement: Project Member Removal
The system MUST allow project owners to remove members from a project.

#### Scenario: Owner removes a member from project
Given a project exists with an owner  
And a user with role `editor` is a member of the project  
When the owner removes the user from the project  
Then the user MUST be removed from the project_members table  
And the removal MUST be recorded in the audit log

#### Scenario: Last owner cannot be removed
Given a project exists with only one owner  
When an attempt is made to remove that owner from the project  
Then the system MUST reject the operation  
And the owner MUST remain associated with the project

#### Scenario: User removes themselves from project
Given a user is a member of a project with role `editor`  
When the user removes themselves from the project  
Then the user MUST be removed from the project_members table  
And the removal MUST be recorded in the audit log  
And the user MUST NOT be able to access the project

#### Scenario: Removing user who is the only owner promotes next eligible member
Given a project exists with one owner and multiple editors  
When the owner is removed from the project (by an admin or via transfer)  
Then the system MUST promote the earliest-added editor to owner  
And the promotion MUST be recorded in the audit log

---

### Requirement: Project Access Control
The system MUST enforce project-level access control based on the user's project role.

#### Scenario: Owner can perform all actions on project
Given a user with role `owner` on a project is authenticated  
When the user attempts to read, update, delete, or share the project  
Then the system MUST allow all actions

#### Scenario: Editor can modify but not delete project
Given a user with role `editor` on a project is authenticated  
When the user attempts to read or update the project  
Then the system MUST allow the action  
When the user attempts to delete the project or change member roles  
Then the system MUST return a 403 Forbidden error

#### Scenario: Viewer can only read project
Given a user with role `viewer` on a project is authenticated  
When the user attempts to read the project  
Then the system MUST allow the action  
When the user attempts to modify, delete, or share the project  
Then the system MUST return a 403 Forbidden error

#### Scenario: Non-member cannot access project
Given a user is not a member of a project  
When the user attempts to access the project  
Then the system MUST return a 404 Not Found error (to prevent enumeration)

---

### Requirement: Project Role Listing
The system MUST allow querying all members of a project with their roles.

#### Scenario: Owner lists project members
Given a project exists with an owner, an editor, and a viewer  
When the owner requests the list of project members  
Then the system MUST return all three members with their respective roles

#### Scenario: Viewer lists project members
Given a user with role `viewer` on a project is authenticated  
When the user requests the list of project members  
Then the system MUST return all members with their roles  
And the system MUST NOT allow the viewer to modify any member's role

---

## Domain: team-management

### Requirement: Team Creation
The system MUST allow users to create teams. The creator MUST automatically become the team owner.

#### Scenario: User creates a team
Given a user with role `user` is authenticated  
When the user creates a team with a name and description  
Then a new team MUST be created  
And the user MUST be added as a team member with role `team_owner`  
And the team creation MUST be recorded in the audit log

#### Scenario: Team name must be unique
Given a team with name "Engineering" already exists  
When a user attempts to create another team with name "Engineering"  
Then the system MUST reject the operation with a 409 Conflict error  
And no new team MUST be created

#### Scenario: Team requires a name
Given a user attempts to create a team without a name  
Then the system MUST reject the operation with a 400 Bad Request error  
And no new team MUST be created

---

### Requirement: Team Role Assignment
The system MUST support three team-level roles: `team_owner`, `team_admin`, and `team_member`.

#### Scenario: Team owner promotes member to team admin
Given a team exists with an owner and a member with role `team_member`  
When the owner promotes the member to `team_admin`  
Then the member's role MUST be updated to `team_admin`  
And the role change MUST be recorded in the audit log

#### Scenario: Team admin cannot promote members to owner
Given a user with role `team_admin` on a team is authenticated  
When the user attempts to promote a member to `team_owner`  
Then the system MUST return a 403 Forbidden error  
And the member's role MUST NOT be changed

#### Scenario: Team member cannot modify other members
Given a user with role `team_member` on a team is authenticated  
When the user attempts to change another member's role  
Then the system MUST return a 403 Forbidden error  
And no role MUST be changed

#### Scenario: Last team owner cannot be demoted
Given a team has only one member with role `team_owner`  
When an attempt is made to change that owner's role to `team_member` or `team_admin`  
Then the system MUST reject the operation  
And the owner's role MUST remain `team_owner`

---

### Requirement: Team Member Removal
The system MUST allow team owners and admins to remove members from a team.

#### Scenario: Team owner removes a member
Given a team exists with an owner and a member with role `team_member`  
When the owner removes the member from the team  
Then the member MUST be removed from the team_members table  
And the removal MUST be recorded in the audit log

#### Scenario: Team admin removes a member
Given a team exists with an admin and a member with role `team_member`  
When the admin removes the member from the team  
Then the member MUST be removed from the team_members table  
And the removal MUST be recorded in the audit log

#### Scenario: Team member cannot remove other members
Given a user with role `team_member` on a team is authenticated  
When the user attempts to remove another member  
Then the system MUST return a 403 Forbidden error  
And no member MUST be removed

#### Scenario: Last owner leaves the team
Given a team has only one member with role `team_owner`  
When that owner attempts to leave the team  
Then the system MUST reject the operation  
And the owner MUST remain on the team  
And the system SHOULD prompt to transfer ownership first

#### Scenario: Owner leaves after transferring ownership
Given a team has an owner and another member with role `team_admin`  
When the owner transfers ownership to the admin  
And then the former owner leaves the team  
Then the new owner MUST be the admin  
And the former owner MUST be removed from the team  
And both actions MUST be recorded in the audit log

---

### Requirement: Team Access Control
The system MUST enforce team-level access control based on the user's team role.

#### Scenario: Team owner can perform all team actions
Given a user with role `team_owner` on a team is authenticated  
When the user attempts to update team settings, add/remove members, or change roles  
Then the system MUST allow all actions

#### Scenario: Team admin can manage members but not delete team
Given a user with role `team_admin` on a team is authenticated  
When the user attempts to add or remove members  
Then the system MUST allow the action  
When the user attempts to delete the team or change the owner's role  
Then the system MUST return a 403 Forbidden error

#### Scenario: Team member can view team but not modify
Given a user with role `team_member` on a team is authenticated  
When the user attempts to view team details and members  
Then the system MUST allow the action  
When the user attempts to modify team settings or manage members  
Then the system MUST return a 403 Forbidden error

---

### Requirement: Team Listing and Membership Query
The system MUST allow users to list teams they belong to and query team membership.

#### Scenario: User lists their teams
Given a user belongs to three teams  
When the user requests their team list  
Then the system MUST return all three teams with the user's role in each

#### Scenario: Team owner lists team members
Given a team exists with an owner, an admin, and two members  
When the owner requests the list of team members  
Then the system MUST return all four members with their respective roles

---

## Domain: audit-logs

### Requirement: Audit Log Creation
The system MUST create an immutable audit log entry for every role change, permission change, team change, and project sharing action.

#### Scenario: Role change creates audit log entry
Given an admin changes a user's role from `user` to `admin`  
When the role change is successful  
Then an audit log entry MUST be created with:  
- action: "role_change"  
- actor_id: the admin's user ID  
- target_id: the affected user's ID  
- details: the old and new roles  
- timestamp: the time of the change

#### Scenario: Project sharing creates audit log entry
Given a project owner invites a user to a project with role `editor`  
When the invitation is successful  
Then an audit log entry MUST be created with:  
- action: "project_member_add"  
- actor_id: the owner's user ID  
- target_id: the invited user's ID  
- resource_type: "project"  
- resource_id: the project ID  
- details: the assigned role  
- timestamp: the time of the invitation

#### Scenario: Team creation creates audit log entry
Given a user creates a team  
When the team creation is successful  
Then an audit log entry MUST be created with:  
- action: "team_create"  
- actor_id: the user's ID  
- resource_type: "team"  
- resource_id: the new team ID  
- timestamp: the time of creation

#### Scenario: User ban creates audit log entry
Given an admin bans a user with reason "Violation of terms"  
When the ban is successful  
Then an audit log entry MUST be created with:  
- action: "user_ban"  
- actor_id: the admin's user ID  
- target_id: the banned user's ID  
- details: the ban reason  
- timestamp: the time of the ban

---

### Requirement: Audit Log Immutability
The system MUST ensure audit log entries are append-only. No audit log entry MAY be modified or deleted after creation.

#### Scenario: Attempt to modify audit log entry
Given an audit log entry exists in the system  
When an attempt is made to update the entry  
Then the system MUST reject the operation  
And the audit log entry MUST remain unchanged

#### Scenario: Attempt to delete audit log entry
Given an audit log entry exists in the system  
When an attempt is made to delete the entry  
Then the system MUST reject the operation  
And the audit log entry MUST remain in the database

#### Scenario: Direct database modification prevention
Given the audit_logs table exists  
When any database operation attempts to UPDATE or DELETE from the table  
Then the system SHOULD use database-level constraints or triggers to prevent modification  
And only INSERT operations MUST be allowed

---

### Requirement: Audit Log Query and Pagination
The system MUST provide a way to query audit logs with filtering and pagination. Audit logs MAY grow large over time.

#### Scenario: Admin queries all audit logs with pagination
Given 1000 audit log entries exist in the system  
When an admin requests audit logs with page=1 and limit=50  
Then the system MUST return the first 50 entries ordered by timestamp descending  
And the response MUST include pagination metadata (total count, current page, total pages)

#### Scenario: Admin filters audit logs by action type
Given audit log entries of types "role_change", "project_member_add", and "team_create" exist  
When an admin filters audit logs by action="role_change"  
Then the system MUST return only entries with action "role_change"

#### Scenario: Admin filters audit logs by actor
Given multiple users have performed actions recorded in audit logs  
When an admin filters audit logs by actor_id  
Then the system MUST return only entries where the specified user was the actor

#### Scenario: Admin filters audit logs by date range
Given audit log entries span multiple months  
When an admin filters audit logs by start_date and end_date  
Then the system MUST return only entries within the specified date range

#### Scenario: Pagination prevents timeout on large datasets
Given 1,000,000 audit log entries exist  
When an admin requests audit logs with limit=100  
Then the system MUST return results within 5 seconds  
And MUST NOT attempt to load all entries into memory

---

### Requirement: Audit Log Retention
The system SHOULD define a retention policy for audit logs. Old audit logs MAY be archived but MUST NOT be deleted.

#### Scenario: Audit logs older than retention period are archived
Given a retention period of 2 years is configured  
And audit log entries older than 2 years exist  
When the archival process runs  
Then old entries MUST be moved to an archive table or storage  
And the entries MUST NOT be deleted from the system

#### Scenario: Archived audit logs remain queryable
Given archived audit log entries exist  
When an admin queries audit logs with include_archive=true  
Then the system MUST return both active and archived entries

---

## Domain: admin-dashboard

### Requirement: Admin Dashboard Access Control
The system MUST restrict access to the admin dashboard to users with the `admin` global role only.

#### Scenario: Admin accesses admin dashboard
Given a user with role `admin` is authenticated  
When the user navigates to `/admin`  
Then the system MUST allow access to the admin dashboard

#### Scenario: Non-admin cannot access admin dashboard
Given a user with role `user` is authenticated  
When the user attempts to navigate to `/admin`  
Then the system MUST return a 403 Forbidden error  
And the user MUST NOT see any admin dashboard content

#### Scenario: Viewer cannot access admin dashboard
Given a user with role `viewer` is authenticated  
When the user attempts to navigate to `/admin`  
Then the system MUST return a 403 Forbidden error

---

### Requirement: User Management Interface
The admin dashboard MUST provide an interface for managing users, including listing users, changing roles, and banning/unbanning users.

#### Scenario: Admin views user list
Given a user with role `admin` is authenticated  
When the admin navigates to `/admin/users`  
Then the system MUST display a list of all users with:  
- User ID, name, email  
- Global role  
- Ban status  
- Date joined  
And the list MUST be paginated

#### Scenario: Admin changes user role from dashboard
Given an admin is viewing the user list  
When the admin selects a user and changes their role from `user` to `admin`  
Then the system MUST update the user's role  
And the change MUST be reflected in the user list  
And the change MUST be recorded in the audit log

#### Scenario: Admin bans user from dashboard
Given an admin is viewing the user list  
When the admin selects a user and bans them with a reason  
Then the system MUST update the user's ban status  
And the ban MUST be reflected in the user list  
And the ban action MUST be recorded in the audit log

#### Scenario: Admin cannot change their own role from dashboard
Given an admin is viewing the user list  
When the admin attempts to change their own role  
Then the system MUST disable the role change option for the admin's own account  
Or MUST reject the change if attempted

---

### Requirement: Team Management Interface
The admin dashboard MUST provide an interface for managing teams, including listing teams, viewing team members, and dissolving teams.

#### Scenario: Admin views team list
Given a user with role `admin` is authenticated  
When the admin navigates to `/admin/teams`  
Then the system MUST display a list of all teams with:  
- Team ID, name, description  
- Number of members  
- Date created  
And the list MUST be paginated

#### Scenario: Admin views team details
Given an admin is viewing the team list  
When the admin selects a team to view details  
Then the system MUST display:  
- Team information (name, description, created date)  
- List of all team members with their roles  
- Option to dissolve the team (with confirmation)

#### Scenario: Admin dissolves a team
Given an admin is viewing a team with members  
When the admin chooses to dissolve the team and confirms  
Then the team MUST be marked as dissolved or deleted  
And all team members MUST be removed from the team  
And the dissolution MUST be recorded in the audit log

---

### Requirement: Audit Log Viewer Interface
The admin dashboard MUST provide an interface for viewing audit logs with filtering and pagination.

#### Scenario: Admin views audit logs
Given a user with role `admin` is authenticated  
When the admin navigates to `/admin/audit`  
Then the system MUST display audit log entries with:  
- Timestamp  
- Actor (user who performed the action)  
- Action type  
- Target (affected user/resource)  
- Details  
And the list MUST be paginated

#### Scenario: Admin filters audit logs from dashboard
Given an admin is viewing the audit log page  
When the admin applies filters (action type, actor, date range)  
Then the system MUST display only entries matching the filters  
And the filters MUST be applied server-side

#### Scenario: Admin exports audit logs
Given an admin is viewing the audit log page  
When the admin requests to export audit logs as CSV  
Then the system MUST generate a CSV file with all filtered entries  
And the file MUST include all audit log fields

---

### Requirement: Role Management Interface
The admin dashboard MUST provide an interface for viewing and managing global role definitions and permissions.

#### Scenario: Admin views role definitions
Given a user with role `admin` is authenticated  
When the admin navigates to `/admin/roles`  
Then the system MUST display all global roles (`admin`, `user`, `viewer`)  
And their associated permissions

#### Scenario: Admin views permission matrix
Given an admin is viewing the roles page  
When the admin requests to view the permission matrix  
Then the system MUST display a matrix showing:  
- Each role as a row  
- Each permission as a column  
- Which roles have which permissions

---

## Domain: route-protection

### Requirement: Server-Side Route Guards
The system MUST implement server-side route guards that check user roles and permissions before allowing access to protected routes.

#### Scenario: Unauthenticated user accesses protected route
Given no user is authenticated  
When a request is made to a protected route  
Then the system MUST return a 401 Unauthorized error  
And the user MUST be redirected to the login page

#### Scenario: User with insufficient permissions accesses protected route
Given a user with role `viewer` is authenticated  
When the user attempts to access a route requiring `user` role  
Then the system MUST return a 403 Forbidden error

#### Scenario: User with sufficient permissions accesses protected route
Given a user with role `user` is authenticated  
When the user attempts to access a route requiring `user` role  
Then the system MUST allow access to the route

#### Scenario: Admin accesses any protected route
Given a user with role `admin` is authenticated  
When the user attempts to access any protected route  
Then the system MUST allow access regardless of the route's specific role requirement

---

### Requirement: Project Route Protection
The system MUST protect project routes based on the user's project-level role.

#### Scenario: Project member accesses project route
Given a user is a member of a project with role `editor`  
When the user attempts to access the project's overview page  
Then the system MUST allow access

#### Scenario: Non-member attempts to access project route
Given a user is not a member of a project  
When the user attempts to access the project's URL  
Then the system MUST return a 404 Not Found error (to prevent enumeration)

#### Scenario: Project viewer attempts to access edit route
Given a user is a member of a project with role `viewer`  
When the user attempts to access the project's settings page (edit route)  
Then the system MUST return a 403 Forbidden error

#### Scenario: Project editor accesses edit route
Given a user is a member of a project with role `editor`  
When the user attempts to access the project's edit page  
Then the system MUST allow access

---

### Requirement: Team Route Protection
The system MUST protect team routes based on the user's team-level role.

#### Scenario: Team member accesses team route
Given a user is a member of a team with role `team_member`  
When the user attempts to access the team's overview page  
Then the system MUST allow access

#### Scenario: Non-member attempts to access team route
Given a user is not a member of a team  
When the user attempts to access the team's URL  
Then the system MUST return a 404 Not Found error

#### Scenario: Team member attempts to access admin route
Given a user is a member of a team with role `team_member`  
When the user attempts to access the team's member management page  
Then the system MUST return a 403 Forbidden error

#### Scenario: Team admin accesses admin route
Given a user is a member of a team with role `team_admin`  
When the user attempts to access the team's member management page  
Then the system MUST allow access

---

### Requirement: Admin Route Protection
The system MUST protect admin dashboard routes to allow access only to users with the `admin` global role.

#### Scenario: Admin accesses admin route
Given a user with role `admin` is authenticated  
When the user attempts to access any `/admin/*` route  
Then the system MUST allow access

#### Scenario: Non-admin attempts to access admin route
Given a user with role `user` is authenticated  
When the user attempts to access `/admin/users`  
Then the system MUST return a 403 Forbidden error

#### Scenario: Viewer attempts to access admin route
Given a user with role `viewer` is authenticated  
When the user attempts to access `/admin/audit`  
Then the system MUST return a 403 Forbidden error

---

### Requirement: Concurrent Role Change Protection
The system MUST handle concurrent role changes gracefully, ensuring data consistency.

#### Scenario: Concurrent role change by two admins
Given two admins attempt to change the same user's role at the same time  
When both requests are processed  
Then the system MUST ensure only one change is applied  
Or MUST serialize the changes so the last write wins with audit log entries for both  
And the user's role MUST be in a consistent state

#### Scenario: Concurrent team membership change
Given two team owners attempt to add the same user to a team at the same time  
When both requests are processed  
Then the system MUST ensure the user is added only once  
And only one audit log entry MUST be created (or both if idempotent)

---

### Requirement: Permission Check Function
The system MUST provide a `hasPermission()` function that can be used in both server-side and client-side code to check permissions.

#### Scenario: Server-side permission check passes
Given a user with role `editor` on a project is authenticated  
When the server checks if the user has permission to "update" the project  
Then the system MUST return true

#### Scenario: Server-side permission check fails
Given a user with role `viewer` on a project is authenticated  
When the server checks if the user has permission to "delete" the project  
Then the system MUST return false

#### Scenario: Client-side permission check for UI rendering
Given a user with role `viewer` on a project is authenticated  
When the client renders the project page  
Then the system MUST check permissions and hide edit/delete buttons  
And only show read-only UI elements
