import { auth } from '$lib/auth';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '$lib/logger';

export const POST: RequestHandler = async ({ request }) => {
		try {
		await auth.api.signOut({
			headers: request.headers
		});
	} catch (error) {
		logger.error('Logout error:', { error: String(error) });
	}

	return json({ success: true });
};
