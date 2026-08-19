import { spawn } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { readdir } from 'fs/promises';
import type { PackageManager } from '$lib/deploy/deploy.types';

const LOCK_FILES: Record<string, PackageManager> = {
	'pnpm-lock.yaml': 'pnpm',
	'bun.lockb': 'bun',
	'bun.lock': 'bun',
};

const ECOSYSTEM_FILES = [
	'ecosystem.cjs',
	'ecosystem.config.js',
	'ecosystem.config.cjs',
	'ecosystem.config.ts',
	'pm2.config.js',
	'pm2.config.cjs',
	'ecosystem.json',
] as const;

const APPROVAL_INDICATORS = /requires approval|needs to be built|approve-builds|ERR_PNPM_IGNORED_BUILDS/i;
const PACKAGE_LINE = /^\s*-\s+(.+)$/;
const IGNORED_BUILDS_LINE = /Ignored build scripts:\s*(.+)/i;

function extractPendingPackages(output: string[]): string[] {
	const packages: string[] = [];
	let inApprovalSection = false;

	for (const line of output) {
		// New pnpm format: "[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @swc/core@1.15.43"
		const ignoredMatch = line.match(IGNORED_BUILDS_LINE);
		if (ignoredMatch) {
			const pkgList = ignoredMatch[1].trim();
			// Could be single package or comma-separated
			const pkgs = pkgList.split(',').map((p) => p.trim()).filter(Boolean);
			packages.push(...pkgs);
			continue;
		}

		if (APPROVAL_INDICATORS.test(line)) {
			inApprovalSection = true;
			continue;
		}
		if (inApprovalSection) {
			const match = line.match(PACKAGE_LINE);
			if (match) {
				packages.push(match[1].trim());
			} else if (line.trim() && !line.startsWith('-')) {
				inApprovalSection = false;
			}
		}
	}

	return packages;
}

type EcosystemFile = (typeof ECOSYSTEM_FILES)[number];

/** Environment map passed to spawned child processes */
type EnvMap = Record<string, string | undefined>;

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

	// Default to npm if no lock file found
	return 'npm';
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

function runCommand(
	cwd: string,
	command: string,
	args: string[],
	onLine: (line: string, isError: boolean) => void,
	env?: EnvMap,
): Promise<number> {
	return new Promise((resolve) => {
		const proc = spawn(command, args, {
			cwd,
			shell: false,
			env: env ?? { ...process.env },
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

async function findEcosystemFiles(dir: string): Promise<string[]> {
	const found: string[] = [];

	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile()) {
				const name = entry.name.toLowerCase();
				if (ECOSYSTEM_FILES.some((ef) => name === ef)) {
					found.push(entry.name);
				}
			}
		}
	} catch {
		// Directory read error - return empty
	}

	return found;
}

/**
 * Log callback type for streaming output
 */
export type ImportLogCallback = (step: ImportStep, line: string, isError: boolean) => void;

/**
 * Steps for the import pipeline
 */
export const IMPORT_STEPS = ['clone', 'install', 'build', 'ecosystem', 'pm2-start', 'approve'] as const;
export type ImportStep = (typeof IMPORT_STEPS)[number];

/**
 * Result of Phase 1 (Clone + Install + Build + Detect)
 */
export interface Phase1Result {
	success: boolean;
	targetPath: string;
	processName: string;
	ecosystemFiles: string[];
	error?: string;
	needsApproval?: boolean;
	pendingPackages?: string[];
}

/**
 * Result of Phase 2 (PM2 Start)
 */
export interface Phase2Result {
	success: boolean;
	error?: string;
}

/**
 * GitHubImportPipelineService handles the full import pipeline for GitHub repositories.
 *
 * Phase 1: git clone → detect package manager → install → build → detect ecosystem files
 * Phase 2: pm2 start with selected ecosystem file
 */
export class GitHubImportPipelineService {
	/**
	 * Phase 1: Clone the repository, install dependencies, build, and detect ecosystem files.
	 *
	 * @param cloneUrl - The git clone URL (with embedded token if needed)
	 * @param targetPath - Absolute path where the repository should be cloned
	 * @param processName - Name for the PM2 process
	 * @param onLog - Callback for streaming log output
	 * @param options - Optional custom install/build commands
	 */
	async runPhase1(
		cloneUrl: string,
		targetPath: string,
		processName: string,
		onLog: ImportLogCallback,
		options?: { installCommand?: string; buildCommand?: string; skipClone?: boolean },
	): Promise<Phase1Result> {
		const log = (step: ImportStep, line: string, isError: boolean) => {
			onLog(step, line, isError);
		};

		let actualTargetPath = targetPath;

		if (!options?.skipClone) {
			// Step 1: Clone
			log('clone', '─── Starting: git clone ───', false);
			let cloneSuccess = false;

			// Extract repo name from clone URL for fallback path
			const urlParts = cloneUrl.split('/');
			const repoName = urlParts[urlParts.length - 1].replace(/\.git$/, '');

			// If targetPath already exists and is not empty, clone into a subdirectory
			if (existsSync(targetPath)) {
				const entries = readdirSync(targetPath);
				if (entries.length > 0) {
					actualTargetPath = join(targetPath, repoName);
					log('clone', `Target path exists and is not empty. Cloning into: ${actualTargetPath}`, false);
				}
			}

			try {
				log('clone', `Target: ${actualTargetPath}`, false);

				// Ensure parent directory exists
				const parentDir = join(actualTargetPath, '..');
				if (!existsSync(parentDir)) {
					log('clone', `Parent directory does not exist: ${parentDir}`, true);
					return {
						success: false,
						targetPath: actualTargetPath,
						processName,
						ecosystemFiles: [],
						error: `Parent directory does not exist: ${parentDir}`,
					};
				}

				// Log redacted clone URL for debugging
				const redactedUrl = cloneUrl.replace(/x-access-token:[^@]+@/, 'x-access-token:***@');
				log('clone', `git clone --depth 1 ${redactedUrl} ${actualTargetPath}`, false);

				const cloneExitCode = await runCommand(
					parentDir,
					'git',
					['clone', '--depth', '1', cloneUrl, actualTargetPath],
					(line, isError) => log('clone', line, isError),
				);
				cloneSuccess = cloneExitCode === 0;

				if (!cloneSuccess) {
					log('clone', `─── Failed: git clone (exit ${cloneExitCode}) ───`, true);
					return {
						success: false,
						targetPath: actualTargetPath,
						processName,
						ecosystemFiles: [],
						error: `Git clone failed with exit code ${cloneExitCode}`,
					};
				}

				log('clone', '─── Completed: git clone ───', false);
			} catch (err) {
				log('clone', `─── Failed: git clone (${err instanceof Error ? err.message : 'Unknown error'}) ───`, true);
				return {
					success: false,
					targetPath: actualTargetPath,
					processName,
					ecosystemFiles: [],
					error: err instanceof Error ? err.message : 'Git clone failed',
				};
			}

			// Verify targetPath now exists
			if (!existsSync(actualTargetPath)) {
				return {
					success: false,
					targetPath: actualTargetPath,
					processName,
					ecosystemFiles: [],
					error: 'Clone succeeded but target directory not found',
				};
			}
		}

		// Detect package manager
		let packageManager: PackageManager;
		try {
			packageManager = detectPackageManager(actualTargetPath);
			log('install', `Detected package manager: ${packageManager}`, false);
		} catch (err) {
			log('install', `Could not detect package manager: ${err instanceof Error ? err.message : 'Unknown'}`, true);
			packageManager = 'npm';
		}

		// Step 2: Install
		log('install', '─── Starting: install ───', false);

		try {
			let installResult: { exitCode: number; output: string[] };

			if (options?.installCommand) {
				const tokens = options.installCommand.trim().split(/\s+/);
				const bin = tokens[0];
				const args = tokens.slice(1);
				const output: string[] = [];
				const exitCode = await runCommand(actualTargetPath, bin, args, (line, isError) => {
					output.push(line);
					log('install', line, isError);
				});
				installResult = { exitCode, output };
			} else {
				installResult = await this.runInstall(actualTargetPath, packageManager, (line, isError) =>
					log('install', line, isError),
				);
			}

			// Check if pnpm requires approval for native builds
			if (packageManager === 'pnpm') {
				const pendingPackages = extractPendingPackages(installResult.output);
				if (pendingPackages.length > 0) {
					log('install', '─── Pending approval for native builds ───', false);
					log('install', `─── Failed: install (exit ${installResult.exitCode}) ───`, true);
					return {
						success: false,
						targetPath: actualTargetPath,
						processName,
						ecosystemFiles: [],
						needsApproval: true,
						pendingPackages,
						error: `Package manager requires approval for: ${pendingPackages.join(', ')}`,
					};
				}
			}

			if (installResult.exitCode !== 0) {
				log('install', `─── Failed: install (exit ${installResult.exitCode}) ───`, true);
				return {
					success: false,
					targetPath: actualTargetPath,
					processName,
					ecosystemFiles: [],
					error: `Install failed with exit code ${installResult.exitCode}`,
				};
			}

			log('install', '─── Completed: install ───', false);
		} catch (err) {
			log('install', `─── Failed: install (${err instanceof Error ? err.message : 'Unknown error'}) ───`, true);
			return {
				success: false,
				targetPath: actualTargetPath,
				processName,
				ecosystemFiles: [],
				error: err instanceof Error ? err.message : 'Install failed',
			};
		}

		// Step 3: Build (optional - only if build script exists or custom command provided)
		const scripts = readPackageScripts(actualTargetPath);
		const hasBuild = !!scripts?.build;

		if (options?.buildCommand) {
			log('build', '─── Starting: build (custom) ───', false);
			try {
				const tokens = options.buildCommand.trim().split(/\s+/);
				const bin = tokens[0];
				const args = tokens.slice(1);
				const buildExitCode = await runCommand(actualTargetPath, bin, args, (line, isError) =>
					log('build', line, isError),
				);

				if (buildExitCode !== 0) {
					log('build', `─── Failed: build (exit ${buildExitCode}) ───`, true);
					return {
						success: false,
						targetPath: actualTargetPath,
						processName,
						ecosystemFiles: [],
						error: `Build failed with exit code ${buildExitCode}`,
					};
				}
				log('build', '─── Completed: build (custom) ───', false);
			} catch (err) {
				log('build', `─── Failed: build (${err instanceof Error ? err.message : 'Unknown error'}) ───`, true);
				return {
					success: false,
					targetPath: actualTargetPath,
					processName,
					ecosystemFiles: [],
					error: err instanceof Error ? err.message : 'Build failed',
				};
			}
		} else if (hasBuild) {
			log('build', '─── Starting: build ───', false);
			try {
				const buildExitCode = await this.runBuild(actualTargetPath, packageManager, (line, isError) =>
					log('build', line, isError),
				);

				if (buildExitCode !== 0) {
					log('build', `─── Failed: build (exit ${buildExitCode}) ───`, true);
					return {
						success: false,
						targetPath: actualTargetPath,
						processName,
						ecosystemFiles: [],
						error: `Build failed with exit code ${buildExitCode}`,
					};
				}
				log('build', '─── Completed: build ───', false);
			} catch (err) {
				log('build', `─── Failed: build (${err instanceof Error ? err.message : 'Unknown error'}) ───`, true);
				return {
					success: false,
					targetPath: actualTargetPath,
					processName,
					ecosystemFiles: [],
					error: err instanceof Error ? err.message : 'Build failed',
				};
			}
		} else {
			log('build', '─── Skipped: no build script in package.json ───', false);
		}

		// Step 4: Detect ecosystem files
		log('ecosystem', '─── Detecting ecosystem files ───', false);
		const ecosystemFiles = await findEcosystemFiles(actualTargetPath);

		if (ecosystemFiles.length === 0) {
			log('ecosystem', 'No ecosystem files found in repository', false);
		} else {
			log('ecosystem', `Found ecosystem files: ${ecosystemFiles.join(', ')}`, false);
		}

		return {
			success: true,
			targetPath: actualTargetPath,
			processName,
			ecosystemFiles,
		};
	}

	/**
	 * Phase 2: Start the application with PM2 using the selected ecosystem file.
	 *
	 * @param targetPath - Absolute path where the repository was cloned
	 * @param processName - Name for the PM2 process
	 * @param ecosystemFile - Path to the ecosystem file (relative to targetPath)
	 * @param onLog - Callback for streaming log output
	 */
	async runPhase2(
		targetPath: string,
		processName: string,
		ecosystemFile: string,
		onLog: ImportLogCallback,
	): Promise<Phase2Result> {
		const log = (step: 'pm2-start', line: string, isError: boolean) => {
			onLog(step, line, isError);
		};

		// Validate ecosystem file exists
		const fullEcosystemPath = join(targetPath, ecosystemFile);
		if (!existsSync(fullEcosystemPath)) {
			log('pm2-start', `Ecosystem file not found: ${fullEcosystemPath}`, true);
			return {
				success: false,
				error: `Ecosystem file not found: ${ecosystemFile}`,
			};
		}

		log('pm2-start', '─── Starting: pm2 start ───', false);

		try {
			const exitCode = await runCommand(
				targetPath,
				'pm2',
				['start', ecosystemFile, '--update-env'],
				(line, isError) => log('pm2-start', line, isError),
			);

			if (exitCode !== 0) {
				log('pm2-start', `─── Failed: pm2 start (exit ${exitCode}) ───`, true);
				return {
					success: false,
					error: `PM2 start failed with exit code ${exitCode}`,
				};
			}

			log('pm2-start', '─── Completed: pm2 start ───', false);

			// Rename the process if needed
			if (processName) {
				await runCommand(
					targetPath,
					'pm2',
					['restart', ecosystemFile, '--update-env', '--name', processName],
					(line, isError) => log('pm2-start', line, isError),
				);
			}

			return { success: true };
		} catch (err) {
			log('pm2-start', `─── Failed: pm2 start (${err instanceof Error ? err.message : 'Unknown error'}) ───`, true);
			return {
				success: false,
				error: err instanceof Error ? err.message : 'PM2 start failed',
			};
		}
	}

	private async runInstall(
		cwd: string,
		pm: PackageManager,
		onLine: (line: string, isError: boolean) => void,
	): Promise<{ exitCode: number; output: string[] }> {
		const output: string[] = [];
		const exitCode = await this.runInstallCommand(cwd, pm, (line, isError) => {
			output.push(line);
			onLine(line, isError);
		});
		return { exitCode, output };
	}

	private async runInstallCommand(
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
	 * Run pnpm approve-builds --all in the target directory.
	 */
	async approveBuilds(
		targetPath: string,
		onLog: ImportLogCallback,
	): Promise<{ success: boolean; error?: string }> {
		const log = (step: 'approve', line: string, isError: boolean) => {
			onLog(step, line, isError);
		};

		log('approve', '─── Starting: approve-builds ───', false);

		try {
			const exitCode = await runCommand(
				targetPath,
				'pnpm',
				['approve-builds', '--all'],
				(line, isError) => log('approve', line, isError),
			);

			if (exitCode !== 0) {
				log('approve', `─── Failed: approve-builds (exit ${exitCode}) ───`, true);
				return { success: false, error: `approve-builds failed with exit code ${exitCode}` };
			}

			log('approve', '─── Completed: approve-builds ───', false);
			return { success: true };
		} catch (err) {
			log('approve', `─── Failed: approve-builds (${err instanceof Error ? err.message : 'Unknown error'}) ───`, true);
			return { success: false, error: err instanceof Error ? err.message : 'approve-builds failed' };
		}
	}
}
