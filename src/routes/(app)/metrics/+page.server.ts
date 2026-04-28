import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { MetricsRepository } from '$lib/db/repositories/metrics-repository.impl';
import { MetricsService } from '$lib/metrics/metrics.service';
import type { PageServerLoad } from './$types';

const pm2Repo = new PM2Repository();
const pm2Service = new PM2Service(pm2Repo);
const metricsRepo = new MetricsRepository();
const metricsService = new MetricsService(metricsRepo, pm2Service);

export const load: PageServerLoad = async () => {
	const processes = await metricsService.getCurrentProcessesWithMetrics();
	const summary = await metricsService.getAggregatedMetrics();

	return {
		processes,
		summary
	};
};
