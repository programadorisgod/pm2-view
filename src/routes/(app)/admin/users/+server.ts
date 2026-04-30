import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/route-guards';
import { logAudit } from '$lib/server/audit';
import { auth } from '$lib/auth';
import { z } from 'zod';

const createUserSchema = z.object({
	email: z.string().email('Invalid email address'),
	password: z.string().min(8, 'Password must be at least 8 characters'),
	name: z.string().min(1, 'Name is required'),
	role: z.enum(['admin', 'user', 'viewer']).default('user')
});

export const GET: RequestHandler = async ({ url, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Check admin access
	requireAdmin(user);

	// Parse pagination parameters
	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const limit = parseInt(url.searchParams.get('limit') || '20', 10);
	const offset = (page - 1) * limit;

	try {
		// Use Better Auth's admin API to list users
		const result = await auth.api.listUsers({
			query: {
				limit,
				offset
			}
		});

		return json({
			users: result.users || [],
			pagination: {
				page,
				limit,
				total: result.total || 0,
				totalPages: Math.ceil((result.total || 0) / limit)
			}
		});
	} catch (e) {
		console.error('Failed to list users:', e);
		throw error(500, 'Failed to retrieve users');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Check admin access
	requireAdmin(user);

	// Validate request body
	const body = await request.json();
	const parseResult = createUserSchema.safeParse(body);

	if (!parseResult.success) {
		throw error(400, parseResult.error.errors[0].message);
	}

	const { email, password, name, role } = parseResult.data;

	try {
		// Create user using Better Auth admin API
		const result = await auth.api.createUser({
			body: {
				email,
				password,
				name,
				role
			}
		});

		if (!result || !result.data) {
			throw error(500, 'Failed to create user');
		}

		// Log the user creation
		await logAudit('user_create', user.id, result.data.id, 'user', result.data.id, {
			email,
			role,
			name
		});

		return json({ user: result.data }, { status: 201 });
	} catch (e: any) {
		if (e.message?.includes('already exists')) {
			throw error(409, 'User with this email already exists');
		}
		console.error('Failed to create user:', e);
		throw error(500, 'Failed to create user');
	}
};
