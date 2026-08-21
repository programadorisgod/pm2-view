import { DeploymentRepository } from '$lib/db/repositories/deployment-repository.impl';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { DeployConfigRepository } from '$lib/db/repositories/deploy-config-repository.impl';
import { GitHubInstallationRepository } from '$lib/db/repositories/github-installation-repository.impl';
import { GitHubAppClient } from '$lib/github/infrastructure/github-app-client';
import { PM2Repository } from '$lib/pm2/pm2-repository.impl';
import { GitService } from './git.service';
import { GithubAppTokenProvider } from './git-auth.provider';
import { DeploymentRunner } from './deployment-runner';
import { DeploymentWorker } from './deployment-worker';
import { runCommand, type EnvMap } from './process-runner';

let worker: DeploymentWorker | null = null;

export function getDeploymentWorker(): DeploymentWorker {
	if (!worker) {
		const deploymentRepo = new DeploymentRepository();
		const runner = new DeploymentRunner({
			deploymentRepo,
			gitService: new GitService(),
			pm2Repo: new PM2Repository(),
			deployConfigRepo: new DeployConfigRepository(),
			gitAuth: new GithubAppTokenProvider(
				new GitHubInstallationRepository(),
				new GitHubAppClient()
			),
			runPm2Restart: (
				processName: string,
				cwd: string,
				env: EnvMap,
				onLine: (line: string, isError: boolean) => void
			) =>
				runCommand(
					cwd,
					'pm2',
					['restart', processName, '--update-env'],
					onLine,
					env,
					30_000
				)
		});
		worker = new DeploymentWorker({
			deploymentRepo,
			projectRepo: new ProjectRepository(),
			runner
		});
	}
	return worker;
}
