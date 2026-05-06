import { exec } from 'child_process';
import { promisify } from 'util';
import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import type { PM2Process } from '$lib/pm2/pm2.types';
import { escapeShellArg } from '$lib/utils/shell';

const execAsync = promisify(exec);

export class EnvVarService {
  private pm2Repo: PM2Repository;
  private pm2Service: PM2Service;

  constructor(pm2Repo: PM2Repository, pm2Service: PM2Service) {
    this.pm2Repo = pm2Repo;
    this.pm2Service = pm2Service;
  }

	async getEnvVars(processId: string): Promise<Record<string, string>> {
		const rawProcess = await this.pm2Repo.describe(processId);
		if (!rawProcess) {
			throw new Error(`Process with ID ${processId} not found`);
		}
		return rawProcess.pm2_env?.env || {};
	}

	async saveAndRestart(
		processId: string,
		envVars: Record<string, string>
	): Promise<{ success: boolean; message: string }> {
		try {
			const rawProcess = await this.pm2Repo.describe(processId);
			if (!rawProcess) {
				return { success: false, message: `Process with ID ${processId} not found` };
			}

			const processName = escapeShellArg(rawProcess.name);

			// Build --env flags for each variable.
			// PM2 supports: pm2 restart <name> --env KEY=VALUE --env KEY2=VALUE2
			// This injects env vars into the restarted process.
			const envFlags = Object.entries(envVars)
				.map(([key, value]) => `--env ${escapeShellArg(`${key}=${value}`)}`)
				.join(' ');

			const command = envFlags
				? `pm2 restart ${processName} ${envFlags}`
				: `pm2 restart ${processName}`;

			await execAsync(command);

			return { success: true, message: 'Process restarted with updated environment variables' };
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : 'Failed to save environment variables'
			};
		}
	}
}
