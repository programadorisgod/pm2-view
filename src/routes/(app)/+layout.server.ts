import { auth } from '$lib/auth';
import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { getEnv } from '$lib/db/env';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	if (!session) {
		throw redirect(302, `${base}/login`);
	}

	const env = getEnv();

	return {
		user: session.user,
		session: session.session,
		config: {
			reposPath: env.REPOS_PATH
		}
	};
};
