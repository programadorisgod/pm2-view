import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { MetricsRepository } from '$lib/db/repositories/metrics-repository.impl';
import { MetricsService } from '$lib/metrics/metrics.service';
import { createServices } from '$lib/services/factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { metricsService } = createServices();
	const processes = await metricsService.getCurrentProcessesWithMetrics();
	const summary = await metricsService.getAggregatedMetrics();

	return {
		processes,
		summary
	};
};
