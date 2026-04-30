import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireProjectAccess } from '$lib/server/route-guards';
import { getProjectRole } from '$lib/server/project-access';
import { logAudit } from '$lib/server/audit';
import { db } from '$lib/db';
import { projectMembers, projects, users } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const inviteSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	role: z.enum(['owner', 'editor', 'viewer']).default('viewer')
});

const updateRoleSchema = z.object({
	role: z.enum(['owner', 'editor', 'viewer'])
});

export const GET: RequestHandler = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const projectId = params.id;
	if (!projectId) {
		throw error(400, 'Project ID is required');
	}

	// Check project access
	requireProjectAccess(projectId, user.id);

	try {
		const members = await db.query.projectMembers.findMany({
			where: eq(projectMembers.projectId, projectId),
			with: {
				user: {
					columns: { id: true, email: true, name: true, role: true }
				}
			},
			orderBy: (projectMembers, { asc }) => [asc(projectMembers.createdAt)]
		});

		return json({
			members: members.map(m => ({
				id: m.id,
				userId: m.userId,
				role: m.role,
				createdAt: m.createdAt,
				user: m.user
			}))
		});
	} catch (e) {
		console.error('Failed to list project members:', e);
		throw error(500, 'Failed to retrieve project members');
	}
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const projectId = params.id;
	if (!projectId) {
		throw error(400, 'Project ID is required');
	}

	// Only owner or editor can invite
	const currentRole = await getProjectRole(user.id, projectId);
	if (!currentRole || (currentRole !== 'owner' && currentRole !== 'editor')) {
		throw error(403, 'Insufficient permissions to invite users');
	}

	const body = await request.json();
	const parseResult = inviteSchema.safeParse(body);
	if (!parseResult.success) {
		throw error(400, parseResult.error.errors[0].message);
	}

	const { userId, role } = parseResult.data;

	try {
		// Check if project exists
		const project = await db.query.projects.findFirst({
			where: eq(projects.id, projectId)
		});
		if (!project) {
			throw error(404, 'Project not found');
		}

		// Check if user exists
		const targetUser = await db.query.users.findFirst({
			where: eq(users.id, userId)
		});
		if (!targetUser) {
			throw error(404, 'User not found');
		}

		// Check if already a member
		const existing = await db.query.projectMembers.findFirst({
			where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))
		});
		if (existing) {
			throw error(409, 'User is already a member of this project');
		}

		const memberId = crypto.randomUUID();
		await db.insert(projectMembers).values({
			id: memberId,
			projectId,
			userId,
			role,
			createdAt: new Date()
		});

		await logAudit('project_member_add', user.id, userId, 'project', projectId, {
			projectName: project.name,
			role
		});

		return json({
			member: {
				id: memberId,
				projectId,
				userId,
				role,
				createdAt: new Date()
			}
		}, { status: 201 });
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to invite user:', e);
		throw error(500, 'Failed to invite user');
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const projectId = params.id;
	if (!projectId) {
		throw error(400, 'Project ID is required');
	}

	const currentRole = await getProjectRole(user.id, projectId);
	if (currentRole !== 'owner') {
		throw error(403, 'Only project owner can change member roles');
	}

	const body = await request.json();
	const { userId, role } = body;
	if (!userId || !role) {
		throw error(400, 'userId and role are required');
	}

	const parseResult = updateRoleSchema.safeParse({ role });
	if (!parseResult.success) {
		throw error(400, parseResult.error.errors[0].message);
	}

	try {
		const existing = await db.query.projectMembers.findFirst({
			where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))
		});
		if (!existing) {
			throw error(404, 'Project member not found');
		}

		// Prevent removing last owner
		if (existing.role === 'owner' && role !== 'owner') {
			const ownerCount = await db.select({ count: db.$count() })
				.from(projectMembers)
				.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'owner')));
			if (ownerCount[0]?.count <= 1) {
				throw error(403, 'Cannot remove the last project owner');
			}
		}

		await db.update(projectMembers)
			.set({ role })
			.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));

		await logAudit('project_member_role_change', user.id, userId, 'project', projectId, {
			from: existing.role,
			to: role
		});

		return json({ success: true });
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to update member role:', e);
		throw error(500, 'Failed to update member role');
	}
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const projectId = params.id;
	if (!projectId) {
		throw error(400, 'Project ID is required');
	}

	const url = new URL(request.url);
	const userId = url.searchParams.get('userId');
	if (!userId) {
		throw error(400, 'userId query parameter is required');
	}

	const currentRole = await getProjectRole(user.id, projectId);
	if (!currentRole || (currentRole !== 'owner' && currentRole !== 'editor')) {
		throw error(403, 'Insufficient permissions to remove members');
	}

	try {
		const existing = await db.query.projectMembers.findFirst({
			where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))
		});
		if (!existing) {
			throw error(404, 'Project member not found');
		}

		// Prevent removing last owner
		if (existing.role === 'owner') {
			const ownerCount = await db.select({ count: db.$count() })
				.from(projectMembers)
				.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'owner')));
			if (ownerCount[0]?.count <= 1) {
				throw error(403, 'Cannot remove the last project owner');
			}
		}

		await db.delete(projectMembers)
			.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));

		await logAudit('project_member_remove', user.id, userId, 'project', projectId, {
			role: existing.role
		});

		return json({ success: true });
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to remove member:', e);
		throw error(500, 'Failed to remove member');
	}
};
