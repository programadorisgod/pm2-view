import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { MetricsRepository } from '$lib/db/repositories/metrics-repository.impl';
import { MetricsService } from '$lib/metrics/metrics.service';
import { EnvVarService } from '$lib/env-vars/env-var.service';
import { logger } from '$lib/logger';

export interface ServiceContainer {
  pm2Service: PM2Service;
  pm2Repo: PM2Repository;
  metricsService: MetricsService;
  metricsRepo: MetricsRepository;
  envVarService: EnvVarService;
}

let container: ServiceContainer | null = null;

export function createServices(): ServiceContainer {
  if (!container) {
    const pm2Repo = new PM2Repository();
    const pm2Service = new PM2Service(pm2Repo);
    const metricsRepo = new MetricsRepository();
    const metricsService = new MetricsService(metricsRepo, pm2Service);
    const envVarService = new EnvVarService(pm2Repo, pm2Service);

    container = {
      pm2Service,
      pm2Repo,
      metricsService,
      metricsRepo,
      envVarService,
    };
  }
  return container;
}

export function resetServices(): void {
  container = null;
}
