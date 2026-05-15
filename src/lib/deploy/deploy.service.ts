import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import type { IPM2Repository } from '$lib/pm2/pm2.types';
import type {
	DeployLogCallback,
	DeployResult,
	DeployStep,
	DeployStepResult,
	PackageManager,
} from './deploy.types';

const LOCK_FILES: Record<string, PackageManager> = {
	'pnpm-lock.yaml': 'pnpm',
	'bun.lockb': 'bun',
	'bun.lock': 'bun',
} as const;

function detectPackageManager(dir: string): PackageManager {
	const pkgPath = join(dir, 'package.json');
	if (existsSync(pkgPath)) {
		try {
			const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
			if (pkg.packageManager) {
				const [pm] = pkg.packageManager.split('@');
				if (pm === 'pnpm' || pm === 'bun') return pm;
			}
		} catch {
			// ignore parse errors
		}
	}

	for (const [file, pm] of Object.entries(LOCK_FILES)) {
		if (existsSync(join(dir, file))) return pm;
	}

	throw new Error(
		`No pnpm or bun lockfile found in ${dir}. Cannot determine package manager.`,
	);
}

function isGitRepo(dir: string): boolean {
	return existsSync(join(dir, '.git'));
}

function readPackageScripts(dir: string): Record<string, string> | null {
	const pkgPath = join(dir, 'package.json');
	if (!existsSync(pkgPath)) return null;
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
		return pkg.scripts ?? null;
	} catch {
		return null;
	}
}

function resolveProjectRoot(execPath: string, maxUpward = 10): string | null {
	let dir = dirname(execPath);
	for (let i = 0; i < maxUpward; i++) {
		if (existsSync(join(dir, 'package.json'))) return dir;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

function runCommand(
	cwd: string,
	command: string,
	args: string[],
	onLine: (line: string, isError: boolean) => void,
): Promise<number> {
	return new Promise((resolve) => {
		const proc = spawn(command, args, {
			cwd,
			shell: false,
			env: { ...process.env },
		});

		const bufferOut: string[] = [];
		const bufferErr: string[] = [];

		proc.stdout.on('data', (chunk: Buffer) => {
			bufferOut.push(chunk.toString());
			flushBuffer(bufferOut, (l) => onLine(l, false));
		});

		proc.stderr.on('data', (chunk: Buffer) => {
			bufferErr.push(chunk.toString());
			flushBuffer(bufferErr, (l) => onLine(l, true));
		});

		proc.on('close', (code) => {
			flushBuffer(bufferOut, (l) => onLine(l, false), true);
			flushBuffer(bufferErr, (l) => onLine(l, true), true);
			resolve(code ?? 1);
		});

		proc.on('error', (err) => {
			onLine(`Command failed to start: ${err.message}`, true);
			resolve(1);
		});
	});
}

function flushBuffer(
	buffer: string[],
	onLine: (line: string) => void,
	flushAll = false,
): void {
	const full = buffer.join('');
	buffer.length = 0;
	if (!full) return;

	const lines = full.split('\n');
	if (full.endsWith('\n')) {
		lines.forEach((l) => l && onLine(l));
	} else if (flushAll) {
		lines.forEach((l) => l && onLine(l));
	} else {
		lines.slice(0, -1).forEach((l) => l && onLine(l));
		buffer.push(lines[lines.length - 1]);
	}
}

/**
 * DeployService handles the deployment pipeline for a PM2-managed project.
 *
 * Pipeline: git pull → package manager install → build → pm2 restart --update-env
 *
 * Output is streamed line-by-line via a callback, decoupled from any transport
 * (SSE, WebSocket, etc.). The caller decides how to deliver logs to the client.
 */
export class DeployService {
	private pm2Repo: IPM2Repository;

	constructor(pm2Repo: IPM2Repository) {
		this.pm2Repo = pm2Repo;
	}

	/**
	 * Executes the full deploy pipeline for a given PM2 process.
	 * Returns a DeployResult with per-step outcomes.
	 *
	 * Steps are conditional:
	 * - git pull: only if .git exists
	 * - install: always
	 * - build: only if package.json has a "build" script
	 * - restart: always
	 */
	async deploy(pmId: string, onLog: DeployLogCallback): Promise<DeployResult> {
		const process = await this.pm2Repo.describe(pmId);

		if (!process) {
			return {
				pmId,
				processName: 'unknown',
				packageManager: 'pnpm',
				workingDir: '',
				steps: [],
				success: false,
				error: `Process ${pmId} not found`,
			};
		}

		const pmCwd = process.pm2_env.pm_cwd;
		const execPath = process.pm2_env.pm_exec_path;
		const workingDir =
			pmCwd ||
			(execPath ? resolveProjectRoot(execPath) : null) ||
			process.pm2_env.cwd ||
			'';

		if (!workingDir || !existsSync(workingDir)) {
			return {
				pmId,
				processName: process.name,
				packageManager: 'pnpm',
				workingDir,
				steps: [],
				success: false,
				error: `Working directory not found: ${workingDir}`,
			};
		}

		let packageManager: PackageManager;
		try {
			packageManager = detectPackageManager(workingDir);
		} catch (err) {
			return {
				pmId,
				processName: process.name,
				packageManager: 'pnpm',
				workingDir,
				steps: [],
				success: false,
				error: err instanceof Error ? err.message : 'Failed to detect package manager',
			};
		}

		const scripts = readPackageScripts(workingDir);
		const hasGit = isGitRepo(workingDir);
		const hasBuild = !!scripts?.build;
		const steps: DeployStepResult[] = [];

		const log = (step: DeployStep, line: string, isError: boolean) => {
			onLog(step, line, isError);
		};

		if (hasGit) {
			const gitResult = await this.runStep('git-pull', workingDir, log, () =>
				runCommand(workingDir, 'git', ['pull'], (line, isError) =>
					log('git-pull', line, isError),
				),
			);
			steps.push(gitResult);
			if (!gitResult.success) {
				return this.buildResult(process.name, pmId, workingDir, packageManager, steps);
			}
		} else {
			log('git-pull', '─── Skipped: not a git repository ───', false);
			steps.push({ step: 'git-pull', success: true, exitCode: 0 });
		}

		const installResult = await this.runStep('install', workingDir, log, () =>
			this.runInstall(workingDir, packageManager, (line, isError) =>
				log('install', line, isError),
			),
		);
		steps.push(installResult);
		if (!installResult.success) {
			return this.buildResult(process.name, pmId, workingDir, packageManager, steps);
		}

		if (hasBuild) {
			const buildResult = await this.runStep('build', workingDir, log, () =>
				this.runBuild(workingDir, packageManager, (line, isError) =>
					log('build', line, isError),
				),
			);
			steps.push(buildResult);
			if (!buildResult.success) {
				return this.buildResult(process.name, pmId, workingDir, packageManager, steps);
			}
		} else {
			log('build', '─── Skipped: no build script in package.json ───', false);
			steps.push({ step: 'build', success: true, exitCode: 0 });
		}

		const restartResult = await this.runStep('restart', workingDir, log, () =>
			runCommand(
				workingDir,
				'pm2',
				['restart', process.name, '--update-env'],
				(line, isError) => log('restart', line, isError),
			),
		);
		steps.push(restartResult);

		return this.buildResult(process.name, pmId, workingDir, packageManager, steps);
	}

	/**
	 * Runs a single deploy step with lifecycle logging.
	 */
	private async runStep(
		step: DeployStep,
		_cwd: string,
		log: DeployLogCallback,
		executor: () => Promise<number>,
	): Promise<DeployStepResult> {
		log(step, `─── Starting: ${step} ───`, false);
		const exitCode = await executor();
		const success = exitCode === 0;
		log(step, `─── ${success ? 'Completed' : 'Failed'}: ${step} (exit ${exitCode}) ───`, !success);

		return { step, success, exitCode };
	}

	/**
	 * Runs the install command for the detected package manager.
	 */
	private async runInstall(
		cwd: string,
		pm: PackageManager,
		onLine: (line: string, isError: boolean) => void,
	): Promise<number> {
		switch (pm) {
			case 'bun':
				return runCommand(cwd, 'bun', ['install'], onLine);
			case 'pnpm':
				return runCommand(cwd, 'pnpm', ['install'], onLine);
			default:
				return runCommand(cwd, 'npm', ['install'], onLine);
		}
	}

	/**
	 * Runs the build command for the detected package manager.
	 */
	private async runBuild(
		cwd: string,
		pm: PackageManager,
		onLine: (line: string, isError: boolean) => void,
	): Promise<number> {
		switch (pm) {
			case 'bun':
				return runCommand(cwd, 'bun', ['run', 'build'], onLine);
			case 'pnpm':
				return runCommand(cwd, 'pnpm', ['run', 'build'], onLine);
			default:
				return runCommand(cwd, 'npm', ['run', 'build'], onLine);
		}
	}

	/**
	 * Builds the final DeployResult from step outcomes.
	 */
	private buildResult(
		processName: string,
		pmId: string,
		workingDir: string,
		packageManager: PackageManager,
		steps: DeployStepResult[],
	): DeployResult {
		const success = steps.every((s) => s.success);
		const failedStep = steps.find((s) => !s.success);

		return {
			pmId,
			processName,
			packageManager,
			workingDir,
			steps,
			success,
			error: failedStep ? `Step '${failedStep.step}' failed with exit code ${failedStep.exitCode}` : undefined,
		};
	}
}
