import { auth } from '$lib/auth';
import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const error = url.searchParams.get('error');
	if (error) {
		throw redirect(303, `${base}/login?oauth_error=${encodeURIComponent(error)}`);
	}
	const session = await auth.api.getSession({ headers: new Headers() });
	if (!session?.user) {
		throw redirect(303, `${base}/login`);
	}
	throw redirect(303, base || '/');
};
