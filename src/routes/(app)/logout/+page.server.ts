import { auth } from '$lib/auth';
import type { Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { logger } from '$lib/logger';

export const actions: Actions = {
	default: async ({ request }) => {
		try {
			await auth.api.signOut({
				headers: request.headers
			});
		} catch (error) {
			logger.error('Logout error:', { error: String(error) });
		}

		throw redirect(303, `${base}/login`);
	}
};
