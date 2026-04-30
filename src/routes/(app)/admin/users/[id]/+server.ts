import { json, error } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createUserService } from '$lib/services/admin/user.service';
import { updateUserSchema } from '$lib/validation/user-schemas';

const userService = createUserService();

export const PATCH = adminHandler(async ({ params, request }, user) => {
	const targetUserId = params.id;
	if (!targetUserId) {
		throw error(400, 'User ID is required');
	}

	const body = await request.json();
	const parseResult = updateUserSchema.safeParse(body);

	if (!parseResult.success) {
		throw error(400, parseResult.error.issues[0].message);
	}

	await userService.updateUser(targetUserId, parseResult.data, user.id);

	return json({ success: true, role: parseResult.data.role, banned: parseResult.data.banned });
});

export const DELETE = adminHandler(async ({ params }, user) => {
	const targetUserId = params.id;
	if (!targetUserId) {
		throw error(400, 'User ID is required');
	}

	await userService.deleteUser(targetUserId, user.id);
	return json({ success: true });
});
