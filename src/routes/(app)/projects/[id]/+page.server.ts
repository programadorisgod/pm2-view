import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const pm2Repo = new PM2Repository();
const pm2Service = new PM2Service(pm2Repo);

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

	const process = await pm2Service.getProcessById(id);

	if (!process) {
		throw error(404, `Process with ID ${id} not found`);
	}

	// Get logs (limited to 50 lines for the detail page)
	const logs = await pm2Service.getProcessLogs(id, 50);

	return {
		process,
		logs
	};
};
