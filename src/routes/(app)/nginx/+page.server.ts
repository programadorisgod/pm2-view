import { requireAdmin } from '$lib/server/route-guards';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { NginxService } from '$lib/nginx/nginx.service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}
	requireAdmin(locals.user);

	try {
		const service = new NginxService();
		const files = await service.listFiles();
		return {
			files,
			baseDir: service.getBaseDir()
		};
	} catch (err: any) {
		return {
			files: [],
			baseDir: '/etc/nginx/conf.d',
			error: err.message
		};
	}
};
