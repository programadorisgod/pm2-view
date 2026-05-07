import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { join } from 'path';
import type { IPM2Repository } from '$lib/pm2/pm2.types';
import { logger } from '$lib/logger';
import type {
	DeployLogCallback,
	DeployResult,
	DeployStep,
	DeployStepResult,
	PackageManager,
} from './deploy.types';
import { DEPLOY_STEPS } from './deploy.types';

/**
 * Detects the package manager used in a directory.
 * Priority: bun > pnpm > npm (default).
 */
function detectPackageManager(dir: string): PackageManager {
	if (existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock'))) {
		return 'bun';
	}
	if (existsSync(join(dir, 'pnpm-lock.yaml'))) {
		return 'pnpm';
	}
	// package-lock.json or nothing → npm
	return 'npm';
}

/**
 * Checks if the directory is a git repository.
 */
function isGitRepo(dir: string): boolean {
	return existsSync(join(dir, '.git'));
}

/**
 * Reads package.json scripts from a directory.
 * Returns null if package.json doesn't exist or is invalid.
 */
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

/**
 * Runs a shell command via spawn and streams output line by line.
 * Returns the exit code.
 */
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

		const bufferStdout: string[] = [];
		const bufferStderr: string[] = [];

		// Buffer incomplete lines from stdout
		proc.stdout.on('data', (chunk: Buffer) => {
			const text = chunk.toString();
			bufferStdout.push(text);
			flushBuffer(bufferStdout, (line) => onLine(line, false));
		});

		// Buffer incomplete lines from stderr
		proc.stderr.on('data', (chunk: Buffer) => {
			const text = chunk.toString();
			bufferStderr.push(text);
			flushBuffer(bufferStderr, (line) => onLine(line, true));
		});

		proc.on('close', (code) => {
			// Flush any remaining buffered content
			flushBuffer(bufferStdout, (line) => onLine(line, false), true);
			flushBuffer(bufferStderr, (line) => onLine(line, true), true);
			resolve(code ?? 1);
		});

		proc.on('error', (err) => {
			onLine(`Command failed to start: ${err.message}`, true);
			resolve(1);
		});
	});
}

/**
 * Flushes complete lines from a buffer array.
 * Keeps incomplete trailing content in the buffer.
 */
function flushBuffer(
	buffer: string[],
	onLine: (line: string) => void,
	flushAll = false,
): void {
	const full = buffer.join('');
	buffer.length = 0;

	if (!full) return;

	const lines = full.split('\n');

	// If the last chunk doesn't end with newline, it's incomplete
	if (full.endsWith('\n')) {
		for (const line of lines) {
			if (line) onLine(line);
		}
	} else if (flushAll) {
		// Force flush everything including incomplete line
		for (const line of lines) {
			if (line) onLine(line);
		}
	} else {
		// Keep the last incomplete chunk in the buffer
		for (let i = 0; i < lines.length - 1; i++) {
			if (lines[i]) onLine(lines[i]);
		}
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
				packageManager: 'npm',
				workingDir: '',
				steps: [],
				success: false,
				error: `Process ${pmId} not found`,
			};
		}

		const workingDir =
			process.pm2_env.cwd ||
			process.pm2_env.env?.PWD ||
			(process.pm2_env.pm_exec_path ? dirname(process.pm2_env.pm_exec_path) : '');
		if (!workingDir || !existsSync(workingDir)) {
			return {
				pmId,
				processName: process.name,
				packageManager: 'npm',
				workingDir,
				steps: [],
				success: false,
				error: `Working directory not found: ${workingDir}`,
			};
		}

		const packageManager = detectPackageManager(workingDir);
		const scripts = readPackageScripts(workingDir);
		const hasGit = isGitRepo(workingDir);
		const hasBuild = !!scripts?.build;
		const steps: DeployStepResult[] = [];

		const log = (step: DeployStep, line: string, isError: boolean) => {
			onLog(step, line, isError);
		};

		// Step 1: git pull (only if git repo)
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

		// Step 2: package manager install
		const installResult = await this.runStep('install', workingDir, log, () =>
			this.runInstall(workingDir, packageManager, (line, isError) =>
				log('install', line, isError),
			),
		);
		steps.push(installResult);
		if (!installResult.success) {
			return this.buildResult(process.name, pmId, workingDir, packageManager, steps);
		}

		// Step 3: build (only if build script exists)
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

		// Step 4: pm2 restart --update-env
		// spawn passes args as array (safe), no shell escaping needed
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
