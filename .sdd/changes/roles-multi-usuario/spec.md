# Specification: roles-multi-usuario

## Domain: user-roles


Then the system MUST return a 403 Forbidden error  
And the role MUST NOT be changed

Given a new user registers in the system  
When the user account is created  
Then the user's global role MUST be set to `user` by default  
And no manual role assignment SHOULD be required

---

And the user MUST NOT be able to authenticate  

Given a user is banned  
When the user attempts to access any authenticated route  
Then the system MUST return a 401 Unauthorized error  
And the user MUST be redirected to the login page

---

### Requirement: Role-Based Permission Checking


#### Scenario: Viewer has read-only permissions
Given a user with role `viewer` is authenticated  
When the system checks if the user has permission to read resources  
Then the system MUST return true for read permissions  
When the system checks if the user has permission to create, update, or delete resources  
Then the system MUST return false

#### Scenario: User has standard permissions
Given a user with role `user` is authenticated  

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

And the member's role MUST NOT be changed

#### Scenario: Team member cannot modify other members
Given a user with role `team_member` on a team is authenticated  
When the user attempts to change another member's role  
Then the system MUST return a 403 Forbidden error  
And no role MUST be changed



---

Given a team exists with an owner and a member with role `team_member`  
When the owner removes the member from the team  
Then the member MUST be removed from the team_members table  


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


---

### Requirement: Team Access Control
The system MUST enforce team-level access control based on the user's team role.

#### Scenario: Team owner can perform all team actions
Given a user with role `team_owner` on a team is authenticated  
When the user attempts to update team settings, add/remove members, or change roles  

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


---

## Domain: audit-logs

### Requirement: Audit Log Creation
The system MUST create an immutable audit log entry for every role change, permission change, team change, and project sharing action.

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


---

### Requirement: Audit Log Retention
The system SHOULD define a retention policy for audit logs. Old audit logs MAY be archived but MUST NOT be deleted.

#### Scenario: Audit logs older than retention period are archived
Given a retention period of 2 years is configured  
And audit log entries older than 2 years exist  
When the archival process runs  
Then old entries MUST be moved to an archive table or storage  
And the entries MUST NOT be deleted from the system


---

- Global role  
- Ban status  
- Date joined  

---

- Number of members  
- Date created  

- List of all team members with their roles  

And the dissolution MUST be recorded in the audit log

---

- Actor (user who performed the action)  
- Action type  
- Target (affected user/resource)  
- Details  


---

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



---

### Requirement: Concurrent Role Change Protection

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
