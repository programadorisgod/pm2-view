import { auth } from '$lib/auth';
import type { Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

export const actions: Actions = {
	default: async ({ request }) => {
		try {
			await auth.api.signOut({
				headers: request.headers
			});
		} catch (error) {
			console.error('Logout error:', error);
		}

		throw redirect(303, `${base}/login`);
	}
};
