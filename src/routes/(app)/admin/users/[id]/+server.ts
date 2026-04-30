import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/route-guards';
import { logAudit } from '$lib/server/audit';
import { auth } from '$lib/auth';
import { z } from 'zod';

const updateUserSchema = z.object({
	role: z.enum(['admin', 'user', 'viewer']).optional(),
	banned: z.boolean().optional(),
	banReason: z.string().optional()
});

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Check admin access
	requireAdmin(user);

	const targetUserId = params.id;
	if (!targetUserId) {
		throw error(400, 'User ID is required');
	}

	// Prevent self-role-change
	if (targetUserId === user.id) {
		throw error(403, 'Cannot modify your own role or ban status');
	}

	// Validate request body
	const body = await request.json();
	const parseResult = updateUserSchema.safeParse(body);

	if (!parseResult.success) {
		throw error(400, parseResult.error.errors[0].message);
	}

	const updates = parseResult.data;
	const updatePromises: Promise<any>[] = [];

	try {
		// Get current user data for audit log
		const currentUserResult = await auth.api.getUser({
			body: { userId: targetUserId }
		});

		if (!currentUserResult || !currentUserResult.user) {
			throw error(404, 'User not found');
		}

		const currentUser = currentUserResult.user;

		// Handle role change
		if (updates.role !== undefined && updates.role !== currentUser.role) {
			// Check if trying to demote the last admin
			if (currentUser.role === 'admin' && updates.role !== 'admin') {
				// Count remaining admins
				const adminsResult = await auth.api.listUsers({
					query: { role: 'admin', limit: 100 }
				});
				const adminCount = adminsResult.users?.filter((u: any) => u.role === 'admin').length || 0;

				if (adminCount <= 1) {
					throw error(403, 'Cannot remove the last admin');
				}
			}

			updatePromises.push(
				auth.api.setRole({
					body: { userId: targetUserId, role: updates.role }
				}).then(() =>
					logAudit('role_change', user.id, targetUserId, 'user', targetUserId, {
						from: currentUser.role,
						to: updates.role
					})
				)
			);
		}

		// Handle ban/unban
		if (updates.banned !== undefined) {
			if (updates.banned && !currentUser.banned) {
				// Ban user
				updatePromises.push(
					auth.api.banUser({
						body: {
							userId: targetUserId,
							banReason: updates.banReason || 'No reason provided'
						}
					}).then(() =>
						logAudit('user_ban', user.id, targetUserId, 'user', targetUserId, {
							reason: updates.banReason || 'No reason provided'
						})
					)
				);
			} else if (!updates.banned && currentUser.banned) {
				// Unban user
				updatePromises.push(
					auth.api.unbanUser({
						body: { userId: targetUserId }
					}).then(() =>
						logAudit('user_unban', user.id, targetUserId, 'user', targetUserId, {})
					)
				);
			}
		}

		await Promise.all(updatePromises);

		// Return updated user
		const updatedUserResult = await auth.api.getUser({
			body: { userId: targetUserId }
		});

		return json({ user: updatedUserResult.user });
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to update user:', e);
		throw error(500, 'Failed to update user');
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// Check admin access
	requireAdmin(user);

	const targetUserId = params.id;
	if (!targetUserId) {
		throw error(400, 'User ID is required');
	}

	// Prevent self-deletion
	if (targetUserId === user.id) {
		throw error(403, 'Cannot delete your own account');
	}

	try {
		// Check if user exists
		const userResult = await auth.api.getUser({
			body: { userId: targetUserId }
		});

		if (!userResult || !userResult.user) {
			throw error(404, 'User not found');
		}

		// Check if trying to delete the last admin
		if (userResult.user.role === 'admin') {
			const adminsResult = await auth.api.listUsers({
				query: { role: 'admin', limit: 100 }
			});
			const adminCount = adminsResult.users?.filter((u: any) => u.role === 'admin').length || 0;

			if (adminCount <= 1) {
				throw error(403, 'Cannot delete the last admin');
			}
		}

		// Delete user using Better Auth API
		await auth.api.deleteUser({
			body: { userId: targetUserId }
		});

		// Log the deletion
		await logAudit('user_delete', user.id, targetUserId, 'user', targetUserId, {
			email: userResult.user.email,
			role: userResult.user.role
		});

		return json({ success: true });
	} catch (e: any) {
		if (e.status) throw e;
		console.error('Failed to delete user:', e);
		throw error(500, 'Failed to delete user');
	}
};
