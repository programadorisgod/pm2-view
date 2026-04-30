import { auth } from '$lib/auth';
import { redirect, error } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	if (!session) {
		throw redirect(302, `${base}/login`);
	}

	// Check admin routes - only admin role can access /admin/*
	if (event.route.id?.startsWith('/(app)/admin')) {
		if (session.user.role !== 'admin') {
			throw error(403, 'Access denied: Admin role required');
		}
	}

	return {
		user: session.user,
		session: session.session
	};
};
