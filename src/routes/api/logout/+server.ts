import { auth } from '$lib/auth';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		await auth.api.signOut({
			headers: request.headers
		});
	} catch (error) {
		console.error('Logout error:', error);
	}

	return json({ success: true });
};
