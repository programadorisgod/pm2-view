import { json, error } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createUserService } from '$lib/services/admin/user.service';
import { listUsersQuerySchema, createUserSchema } from '$lib/validation/user-schemas';

const userService = createUserService();

export const GET = adminHandler(async ({ url }, user) => {
	const parseResult = listUsersQuerySchema.safeParse({
		page: url.searchParams.get('page'),
		limit: url.searchParams.get('limit'),
		role: url.searchParams.get('role')
	});

	if (!parseResult.success) {
		throw error(400, parseResult.error.issues[0].message);
	}

	const result = await userService.listUsers(parseResult.data);
	return json(result);
});

export const POST = adminHandler(async ({ request }, user) => {
	const body = await request.json();
	const parseResult = createUserSchema.safeParse(body);

	if (!parseResult.success) {
		throw error(400, parseResult.error.issues[0].message);
	}

	const newUser = await userService.createUser(parseResult.data, user.id);
	return json({ user: newUser }, { status: 201 });
});
