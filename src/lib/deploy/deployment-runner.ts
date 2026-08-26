import { existsSync } from 'fs';
import type { Project } from '$lib/projects/project.types';
import type { IPM2Repository } from '$lib/pm2/pm2.types';
import type { IDeploymentRepository, DeployStage, Deployment } from './deployment.types';
import { GitService, GitCommandError } from './git.service';
import {
	runCommand,
	detectPackageManagerOrDefault,
	tokenizeCommand,
	type EnvMap
} from './process-runner';
import { loadProjectEnv, readPackageScripts } from './deploy.service';
import type { GitAuthTokenProvider } from './git-auth.provider';
import type { DeploymentNotifier, DeploymentOutcome } from './deployment-notifier';
import { logger } from '$lib/logger';

const INSTALL_BUILD_TIMEOUT_MS = 600_000;
const DEFAULT_VERIFY_ATTEMPTS = 20;
const DEFAULT_VERIFY_DELAY_MS = 500;

export interface DeploymentRunnerDeps {
	deploymentRepo: IDeploymentRepository;
	gitService: GitService;
	pm2Repo: IPM2Repository;
	deployConfigRepo: { getByType(projectId: string, type: 'install' | 'build' | 'restart'): Promise<{ command: string; sortOrder: number }[]> };
	/** Runs `pm2 restart <name> --update-env`; injectable for testing. */
	runPm2Restart: (
		processName: string,
		cwd: string,
		env: EnvMap,
		onLine: (line: string, isError: boolean) => void
	) => Promise<number>;
	/** Provides short-lived git credentials per repository; null falls back to remote defaults. */
	gitAuth: GitAuthTokenProvider;
	/** Sends the deploy result email to the project owner; failures never affect the deployment itself. */
	notifier?: DeploymentNotifier;
	verifyAttempts?: number;
	verifyDelayMs?: number;
}

/**
 * Executes a persisted deployment end-to-end:
 *   git (safe fetch/checkout/pull --ff-only) → install → build → pm2 restart → verify online
 *
 * PM2 is never touched unless the build succeeded.
 * All commands come from internal project configuration; webhook data is
 * limited to the commit SHA (validated) and repository/branch matching.
 */
export class DeploymentRunner {
	constructor(private deps: DeploymentRunnerDeps) {}

	async run(deployment: Deployment, project: Project): Promise<void> {
		const startedAt = new Date();
		await this.deps.deploymentRepo.markRunning(deployment.id, startedAt);

		const logs: string[] = [];
		let currentStage: DeployStage = 'git';
		let failed = false;

		const flushLogs = async () => {
			try {
				await this.deps.deploymentRepo.setLogs(deployment.id, logs.join('\n') + (logs.length ? '\n' : ''));
			} catch (err) {
				logger.error('Failed to persist deployment logs', { deploymentId: deployment.id, error: err });
			}
		};

		const log = (line: string, isError = false) => {
			const entry = `[${currentStage}] ${line}`;
			logs.push(entry);
			if (isError) {
				logger.warn(`[deployment:${deployment.id}] ${entry}`);
			} else {
				logger.info(`[deployment:${deployment.id}] ${entry}`);
			}
		};

		const fail = async (message: string): Promise<void> => {
			failed = true;
			log(`Deployment failed: ${message}`, true);
			await flushLogs();
			const finishedAt = new Date();
			await this.deps.deploymentRepo.markFailed(
				deployment.id,
				currentStage,
				message,
				finishedAt,
				finishedAt.getTime() - startedAt.getTime()
			);
			if (this.deps.notifier) {
				const outcome: DeploymentOutcome = {
					status: 'failed',
					stage: currentStage,
					error: message,
					durationMs: finishedAt.getTime() - startedAt.getTime()
				};
				try {
					await this.deps.notifier.notifyResult(deployment, project, outcome);
				} catch (err) {
					logger.error('Deployment notifier threw unexpectedly', {
						deploymentId: deployment.id,
						error: err
					});
				}
			}
		};

		log(`Starting deployment of ${deployment.repository}@${deployment.branch}`);

		// Resolve working directory from internal configuration
		const workingDir = project.targetPath ?? '';
		if (!workingDir || !existsSync(workingDir)) {
			await fail(`Working directory not found: ${workingDir || '(not configured)'}`);
			return;
		}

		try {
			// ── Stage: git ──────────────────────────────────────────────
			currentStage = 'git';
			log('Checking working tree status');
			if (await this.deps.gitService.hasLocalChanges(workingDir)) {
				await fail(
					'Local modifications detected in the working tree. Deployment aborted to avoid destroying them. Resolve or stash local changes first.'
				);
				return;
			}

			const authToken = await this.deps.gitAuth.getToken(deployment.repository);
			if (authToken) {
				log('Using GitHub App installation credentials');
			}
			log('Fetching origin');
			await this.deps.gitService.fetchOrigin(workingDir, (line) => log(line), authToken ?? undefined);
			await this.deps.gitService.checkoutBranch(workingDir, deployment.branch, (line) => log(line));
			log(`Pulling latest changes (${deployment.branch}, fast-forward only)`);
			await this.deps.gitService.pullFFOnly(workingDir, (line) => log(line), authToken ?? undefined);

			const deployedSha = await this.deps.gitService.headSha(workingDir);
			await this.deps.deploymentRepo.setCommitSha(deployment.id, deployedSha);
			log(`Deployed commit: ${deployedSha}`);
			await flushLogs();

			// ── Stage: install ──────────────────────────────────────────
			currentStage = 'install';
			const runEnv: EnvMap = { ...process.env };
			const packageManager = detectPackageManagerOrDefault(workingDir);

			const [installCmd] = await this.deps.deployConfigRepo.getByType(project.id, 'install');
			if (installCmd) {
				log(`Installing dependencies (configured): ${installCmd.command}`);
				const { bin, args } = tokenizeCommand(installCmd.command);
				const code = await runCommand(
					workingDir,
					bin,
					args,
					(line, isError) => log(line, isError),
					runEnv,
					INSTALL_BUILD_TIMEOUT_MS
				);
				if (code !== 0) {
					await fail(`Install failed with exit code ${code}`);
					return;
				}
			} else {
				log(`Installing dependencies (${packageManager})`);
				const code = await runCommand(
					workingDir,
					packageManager,
					['install'],
					(line, isError) => log(line, isError),
					runEnv,
					INSTALL_BUILD_TIMEOUT_MS
				);
				if (code !== 0) {
					await fail(`Install failed with exit code ${code}`);
					return;
				}
			}
			log('Install completed');
			await flushLogs();

			// ── Stage: build ────────────────────────────────────────────
			currentStage = 'build';
			const [buildCmd] = await this.deps.deployConfigRepo.getByType(project.id, 'build');
			const scripts = readPackageScripts(workingDir);

			if (buildCmd) {
				log(`Building (configured): ${buildCmd.command}`);
				const { bin, args } = tokenizeCommand(buildCmd.command);
				const code = await runCommand(
					workingDir,
					bin,
					args,
					(line, isError) => log(line, isError),
					runEnv,
					INSTALL_BUILD_TIMEOUT_MS
				);
				if (code !== 0) {
					await fail(`Build failed with exit code ${code}. Process NOT restarted.`);
					return;
				}
			} else if (scripts?.build) {
				log(`Building (${packageManager} run build)`);
				const code = await runCommand(
					workingDir,
					packageManager,
					['run', 'build'],
					(line, isError) => log(line, isError),
					runEnv,
					INSTALL_BUILD_TIMEOUT_MS
				);
				if (code !== 0) {
					await fail(`Build failed with exit code ${code}. Process NOT restarted.`);
					return;
				}
			} else {
				log('Skipped: no build command configured and no build script in package.json');
			}
			log('Build completed');
			await flushLogs();

			// ── Stage: pm2 ──────────────────────────────────────────────
			currentStage = 'pm2';
			const processNames = this.resolveProcessNames(project);
			if (processNames.length === 0) {
				await fail(
					`No PM2 process configured. Start it once manually; auto-start from webhook deployments is not supported yet.`
				);
				return;
			}

			// Minimal env for pm2 restart so pm2-view's own env does not leak
			// into the deployed app via --update-env (same approach as DeployService).
			const projectEnv = loadProjectEnv(workingDir);
			const restartEnv: EnvMap = {
				PATH: process.env.PATH ?? '',
				HOME: process.env.HOME ?? '',
				...projectEnv
			};

			// Verify all processes exist before restarting any
			for (const procName of processNames) {
				const existing = await this.deps.pm2Repo.describe(procName);
				if (!existing) {
					await fail(
						`PM2 process "${procName}" not found. Start it once manually; auto-start from webhook deployments is not supported yet.`
					);
					return;
				}
			}

			// Restart all processes sequentially
			for (const procName of processNames) {
				log(`Restarting PM2 process: ${procName}`);
				const restartCode = await this.deps.runPm2Restart(
					procName,
					workingDir,
					restartEnv,
					(line, isError) => log(line, isError)
				);
				if (restartCode !== 0) {
					await fail(`PM2 restart failed for "${procName}" with exit code ${restartCode}`);
					return;
				}
			}

			// Verify all processes are online
			for (const procName of processNames) {
				log(`Verifying process is online: ${procName}`);
				const online = await this.verifyOnline(procName);
				if (!online) {
					await fail(`PM2 process "${procName}" did not reach online state after restart`);
					return;
				}
				log(`Process online: ${procName}`);
			}

			// ── Success ─────────────────────────────────────────────────
			log('Deployment completed successfully');
			await flushLogs();
			const finishedAt = new Date();
			const durationMs = finishedAt.getTime() - startedAt.getTime();
			await this.deps.deploymentRepo.markSuccess(deployment.id, finishedAt, durationMs);
			if (this.deps.notifier) {
				const outcome: DeploymentOutcome = {
					status: 'success',
					commitSha: deployedSha,
					durationMs
				};
				try {
					await this.deps.notifier.notifyResult(deployment, project, outcome);
				} catch (err) {
					logger.error('Deployment notifier threw unexpectedly', {
						deploymentId: deployment.id,
						error: err
					});
				}
			}
		} catch (err) {
			if (err instanceof GitCommandError) {
				await fail(err.message);
				return;
			}
			logger.error('Unexpected deployment error', { deploymentId: deployment.id, error: err });
			await fail(err instanceof Error ? err.message : 'Unexpected deployment error');
		}
	}

	private async verifyOnline(processName: string): Promise<boolean> {
		const attempts = this.deps.verifyAttempts ?? DEFAULT_VERIFY_ATTEMPTS;
		const delayMs = this.deps.verifyDelayMs ?? DEFAULT_VERIFY_DELAY_MS;
		for (let i = 0; i < attempts; i++) {
			try {
				const proc = await this.deps.pm2Repo.describe(processName);
				if (proc?.pm2_env?.status === 'online') return true;
			} catch {
				// retry below
			}
			if (i < attempts - 1) {
				await new Promise((r) => setTimeout(r, delayMs));
			}
		}
		return false;
	}

	/**
	 * Resolves the list of PM2 process names for a project.
	 * Uses `pm2Names` (JSON array) if present, falls back to `pm2Name` for single-process projects.
	 */
	private resolveProcessNames(project: Project): string[] {
		if (project.pm2Names) {
			try {
				const parsed = JSON.parse(project.pm2Names) as unknown;
				if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((v) => typeof v === 'string')) {
					return parsed as string[];
				}
			} catch {
				// Invalid JSON — fall through to single-process fallback
			}
		}
		return project.pm2Name ? [project.pm2Name] : [];
	}
}
