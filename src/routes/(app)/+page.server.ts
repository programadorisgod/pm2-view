import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { createServices } from '$lib/services/factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { pm2Service } = createServices();
	const processes = await pm2Service.getAllProcesses();
	const summary = pm2Service.getSummary(processes);

	return {
		processes,
		summary
	};
};
