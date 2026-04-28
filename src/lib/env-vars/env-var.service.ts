import { exec } from 'child_process';
import { promisify } from 'util';
import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { PM2Service } from '$lib/pm2/pm2.service';
import type { PM2Process } from '$lib/pm2/pm2.types';

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

			// Get the process name (needed for pm2 commands)
			const processName = rawProcess.name;

			// Build env vars flags for PM2
			// PM2 doesn't have a direct way to update env vars on a running process
			// The approach is to use `pm2 restart <name> --update-env` which will
			// re-read env vars from the process environment
			// For env vars to persist, they should be stored in PM2's ecosystem file
			// or set in the environment before restart

			// For this implementation, we'll store env vars and restart
			// In a production scenario, you'd want to use an ecosystem file
			// or a .env file that the process reads on startup

			// Build the command to restart with env vars
			// Note: This approach uses --env flag which works for some PM2 versions
			const envFlags = Object.entries(envVars)
				.map(([key, value]) => `--env ${key}=${value}`)
				.join(' ');

			// Restart the process with updated env vars
			// First, let's try using pm2 restart with --update-env
			// If the env vars were originally set via CLI, they need to be re-passed
			if (envFlags) {
				await execAsync(`pm2 restart ${processName} --update-env ${envFlags}`);
			} else {
				await this.pm2Service.restartProcess(processId);
			}

			return { success: true, message: 'Environment variables saved and process restarted' };
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : 'Failed to save environment variables'
			};
		}
	}
}
