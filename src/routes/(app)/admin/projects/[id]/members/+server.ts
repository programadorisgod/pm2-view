import { json, error } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createProjectSharingService } from '$lib/services/admin/project-sharing.service';
import { addProjectMemberSchema, updateProjectMemberSchema } from '$lib/validation/project-member-schemas';

const projectSharingService = createProjectSharingService();

export const GET = adminHandler(async ({ params }) => {
	const projectId = params.id;
	if (!projectId) {
		throw new Error('Project ID is required');
	}

	const members = await projectSharingService.listMembers(projectId);
	return json(members);
});

export const POST = adminHandler(async ({ params, request }, user) => {
	const projectId = params.id;
	if (!projectId) {
		throw new Error('Project ID is required');
	}

	const body = await request.json();
	const parseResult = addProjectMemberSchema.safeParse(body);

	if (!parseResult.success) {
		throw error(400, parseResult.error.issues[0].message);
	}

	await projectSharingService.addMember(projectId, parseResult.data.userId, parseResult.data.role, user.id);
	return json({ success: true }, { status: 201 });
});

export const PATCH = adminHandler(async ({ params, request }, user) => {
	const projectId = params.id;
	if (!projectId) {
		throw new Error('Project ID is required');
	}

	const body = await request.json();
	const { userId, role } = body;

	if (!userId || !role) {
		throw new Error('userId and role are required');
	}

	const parseResult = updateProjectMemberSchema.safeParse({ role });
	if (!parseResult.success) {
		throw error(400, parseResult.error.issues[0].message);
	}

	await projectSharingService.updateRole(projectId, userId, role, user.id);
	return json({ success: true });
});

export const DELETE = adminHandler(async ({ params, request }, user) => {
	const projectId = params.id;
	if (!projectId) {
		throw new Error('Project ID is required');
	}

	const url = new URL(request.url);
	const userId = url.searchParams.get('userId');

	if (!userId) {
		throw new Error('userId query parameter is required');
	}

	await projectSharingService.removeMember(projectId, userId, user.id);
	return json({ success: true });
});
