import { createAccessControl, type Role } from 'better-auth/plugins/access';

const statements = {
	user: ['create', 'read', 'list', 'set-role', 'ban', 'impersonate', 'impersonate-admins', 'delete', 'set-password', 'get', 'update'],
	project: ['create', 'read', 'update', 'delete'],
	project_member: ['create', 'read', 'update', 'delete'],
	team: ['create', 'read', 'update', 'delete'],
	team_member: ['create', 'read', 'update', 'delete'],
	audit_log: ['create', 'read', 'delete']
} as const;

const ac = createAccessControl(statements);

const adminRole: Role = ac.newRole({
	user: ['create', 'read', 'list', 'set-role', 'ban', 'impersonate', 'impersonate-admins', 'delete', 'set-password', 'get', 'update'],
	project: ['create', 'read', 'update', 'delete'],
	project_member: ['create', 'read', 'update', 'delete'],
	team: ['create', 'read', 'update', 'delete'],
	team_member: ['create', 'read', 'update', 'delete'],
	audit_log: ['create', 'read', 'delete']
});

const userRole: Role = ac.newRole({
	user: ['create', 'read', 'list', 'get'],
	project: ['create', 'read', 'update'],
	project_member: ['create', 'read'],
	team: ['create', 'read'],
	team_member: ['create', 'read'],
	audit_log: []
});

const viewerRole: Role = ac.newRole({
	user: ['read', 'list', 'get'],
	project: ['read'],
	project_member: ['read'],
	team: ['read'],
	team_member: ['read'],
	audit_log: []
});

const roles: Record<string, Role> = {
	admin: adminRole,
	user: userRole,
	viewer: viewerRole
};

export function hasPermission(userRole: string, resource: string, action: string): boolean {
	const role = roles[userRole];
	if (!role) return false;

	const result = role.authorize({ [resource]: [action] });
	return result.success;
}
