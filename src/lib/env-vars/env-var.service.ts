import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import type { PM2Process } from '$lib/pm2/pm2.types';

export class EnvVarService {
  private pm2Repo: PM2Repository;

  constructor(pm2Repo: PM2Repository) {
    this.pm2Repo = pm2Repo;
  }

	async getEnvVars(processId: string): Promise<Record<string, string>> {
		const rawProcess = await this.pm2Repo.describe(processId);
		if (!rawProcess) {
			throw new Error(`Process with ID ${processId} not found`);
		}
		return rawProcess.pm2_env?.env || {};
	}
}
