import { describe, it, expect } from 'vitest';
import { hasPermission } from '../../lib/auth/permissions';

describe('hasPermission', () => {
	// Admin has all permissions
	it('should grant admin all permissions on user resource', () => {
		expect(hasPermission('admin', 'user', 'create')).toBe(true);
		expect(hasPermission('admin', 'user', 'list')).toBe(true);
		expect(hasPermission('admin', 'user', 'update')).toBe(true);
		expect(hasPermission('admin', 'user', 'delete')).toBe(true);
		expect(hasPermission('admin', 'user', 'set-role')).toBe(true);
		expect(hasPermission('admin', 'user', 'ban')).toBe(true);
	});

	it('should grant admin all permissions on project resource', () => {
		expect(hasPermission('admin', 'project', 'create')).toBe(true);
		expect(hasPermission('admin', 'project', 'read')).toBe(true);
		expect(hasPermission('admin', 'project', 'update')).toBe(true);
		expect(hasPermission('admin', 'project', 'delete')).toBe(true);
	});

	it('should grant admin all permissions on project_member resource', () => {
		expect(hasPermission('admin', 'project_member', 'create')).toBe(true);
		expect(hasPermission('admin', 'project_member', 'read')).toBe(true);
		expect(hasPermission('admin', 'project_member', 'update')).toBe(true);
		expect(hasPermission('admin', 'project_member', 'delete')).toBe(true);
	});

	it('should grant admin all permissions on team resource', () => {
		expect(hasPermission('admin', 'team', 'create')).toBe(true);
		expect(hasPermission('admin', 'team', 'read')).toBe(true);
		expect(hasPermission('admin', 'team', 'update')).toBe(true);
		expect(hasPermission('admin', 'team', 'delete')).toBe(true);
	});

	it('should grant admin all permissions on team_member resource', () => {
		expect(hasPermission('admin', 'team_member', 'create')).toBe(true);
		expect(hasPermission('admin', 'team_member', 'read')).toBe(true);
		expect(hasPermission('admin', 'team_member', 'update')).toBe(true);
		expect(hasPermission('admin', 'team_member', 'delete')).toBe(true);
	});

	it('should grant admin all permissions on audit_log resource', () => {
		expect(hasPermission('admin', 'audit_log', 'create')).toBe(true);
		expect(hasPermission('admin', 'audit_log', 'read')).toBe(true);
		expect(hasPermission('admin', 'audit_log', 'delete')).toBe(true);
	});

	// Viewer has read-only permissions
	it('should grant viewer read permission on user resource', () => {
		expect(hasPermission('viewer', 'user', 'read')).toBe(true);
		expect(hasPermission('viewer', 'user', 'list')).toBe(true);
	});

	it('should deny viewer write permissions on user resource', () => {
		expect(hasPermission('viewer', 'user', 'create')).toBe(false);
		expect(hasPermission('viewer', 'user', 'update')).toBe(false);
		expect(hasPermission('viewer', 'user', 'delete')).toBe(false);
		expect(hasPermission('viewer', 'user', 'set-role')).toBe(false);
		expect(hasPermission('viewer', 'user', 'ban')).toBe(false);
	});

	it('should grant viewer read permission on project resource', () => {
		expect(hasPermission('viewer', 'project', 'read')).toBe(true);
	});

	it('should deny viewer write permissions on project resource', () => {
		expect(hasPermission('viewer', 'project', 'create')).toBe(false);
		expect(hasPermission('viewer', 'project', 'update')).toBe(false);
		expect(hasPermission('viewer', 'project', 'delete')).toBe(false);
	});

	// User has standard permissions (read, create but not admin actions)
	it('should grant user read and create permissions on user resource', () => {
		expect(hasPermission('user', 'user', 'read')).toBe(true);
		expect(hasPermission('user', 'user', 'list')).toBe(true);
		expect(hasPermission('user', 'user', 'create')).toBe(true);
	});

	it('should deny user admin permissions on user resource', () => {
		expect(hasPermission('user', 'user', 'update')).toBe(false);
		expect(hasPermission('user', 'user', 'delete')).toBe(false);
		expect(hasPermission('user', 'user', 'set-role')).toBe(false);
		expect(hasPermission('user', 'user', 'ban')).toBe(false);
	});

	it('should grant user read and create permissions on project resource', () => {
		expect(hasPermission('user', 'project', 'read')).toBe(true);
		expect(hasPermission('user', 'project', 'create')).toBe(true);
		expect(hasPermission('user', 'project', 'update')).toBe(true);
	});

	it('should deny user delete permission on project resource', () => {
		expect(hasPermission('user', 'project', 'delete')).toBe(false);
	});

	// Unknown role should deny all permissions
	it('should deny all permissions for unknown role', () => {
		expect(hasPermission('unknown', 'user', 'create')).toBe(false);
		expect(hasPermission('unknown', 'project', 'read')).toBe(false);
	});

	// Unknown resource should return false
	it('should return false for unknown resource', () => {
		expect(hasPermission('admin', 'unknown', 'create')).toBe(false);
	});

	// Unknown action should return false
	it('should return false for unknown action', () => {
		expect(hasPermission('admin', 'user', 'unknown-action')).toBe(false);
	});
});
