import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import type { PageServerLoad } from './$types';

const pm2Repo = new PM2Repository();
const pm2Service = new PM2Service(pm2Repo);

export const load: PageServerLoad = async () => {
	const processes = await pm2Service.getAllProcesses();
	const summary = pm2Service.getSummary(processes);

	return {
		processes,
		summary
	};
};
