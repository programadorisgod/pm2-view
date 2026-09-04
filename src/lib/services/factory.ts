import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import { MetricsService } from '$lib/metrics/metrics.service';
import { EnvVarService } from '$lib/env-vars/env-var.service';
import { EnvVarRepository } from '$lib/db/repositories/env-var-repository.impl';
import { DeployConfigRepository } from '$lib/db/repositories/deploy-config-repository.impl';
import { DeployConfigService } from '$lib/deploy-config/deploy-config.service';
import { PortScannerService } from '$lib/ports/port-scanner.service';
import { PortManagerService } from '$lib/ports/port-manager.service';
import { PortOtpService } from '$lib/ports/port-otp.service';
import { logger } from '$lib/logger';

export interface ServiceContainer {
  pm2Service: PM2Service;
  pm2Repo: PM2Repository;
  metricsService: MetricsService;
  envVarService: EnvVarService;
  envVarRepo: EnvVarRepository;
  deployConfigService: DeployConfigService;
  portScannerService: PortScannerService;
  portManagerService: PortManagerService;
  portOtpService: PortOtpService;
}

let container: ServiceContainer | null = null;

export function createServices(): ServiceContainer {
  if (!container) {
    const pm2Repo = new PM2Repository();
    const pm2Service = new PM2Service(pm2Repo);
    const metricsService = new MetricsService(pm2Service);
    const envVarRepo = new EnvVarRepository();
    const envVarService = new EnvVarService(envVarRepo);
    const deployConfigRepo = new DeployConfigRepository();
    const deployConfigService = new DeployConfigService(deployConfigRepo);
    const portScannerService = new PortScannerService();
    const portManagerService = new PortManagerService(portScannerService);
    const portOtpService = new PortOtpService();

    container = {
      pm2Service,
      pm2Repo,
      metricsService,
      envVarService,
      envVarRepo,
      deployConfigService,
      portScannerService,
      portManagerService,
      portOtpService,
    };
  }
  return container;
}

export function resetServices(): void {
  container = null;
}
