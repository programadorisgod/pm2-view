import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

/** Environment map passed to spawned child processes (values may be undefined, like Node's process.env). */
export type EnvMap = Record<string, string | undefined>;

export type PackageManager = 'pnpm' | 'bun' | 'npm';

const LOCK_FILES: Record<string, PackageManager> = {
	'pnpm-lock.yaml': 'pnpm',
	'bun.lockb': 'bun',
	'bun.lock': 'bun'
};

/**
 * Runs a command with separated arguments (no shell), streaming output line by line.
 * Returns the exit code.
 */
export function runCommand(
	cwd: string,
	command: string,
	args: string[],
	onLine: (line: string, isError: boolean) => void,
	env?: EnvMap,
	timeoutMs?: number
): Promise<number> {
	return new Promise((resolve) => {
		const useShell = args.length === 0 ? true : process.platform === 'win32';
		const proc =
			args.length > 0
				? spawn(command, args, {
						cwd,
						shell: useShell,
						env: env ?? { ...process.env }
					})
				: spawn(command, {
						cwd,
						shell: true,
						env: env ?? { ...process.env }
					});

		const bufferOut: string[] = [];
		const bufferErr: string[] = [];
		let timedOut = false;

		const timer =
			timeoutMs && timeoutMs > 0
				? setTimeout(() => {
						timedOut = true;
						onLine(`Command timed out after ${timeoutMs}ms`, true);
						proc.kill('SIGKILL');
					}, timeoutMs)
				: null;

		proc.stdout.on('data', (chunk: Buffer) => {
			bufferOut.push(chunk.toString());
			flushBuffer(bufferOut, (l) => onLine(l, false));
		});

		proc.stderr.on('data', (chunk: Buffer) => {
			bufferErr.push(chunk.toString());
			flushBuffer(bufferErr, (l) => onLine(l, true));
		});

		proc.on('close', (code) => {
			if (timer) clearTimeout(timer);
			flushBuffer(bufferOut, (l) => onLine(l, false), true);
			flushBuffer(bufferErr, (l) => onLine(l, true), true);
			if (timedOut) {
				onLine('Command terminated due to timeout', true);
				resolve(124);
			} else {
				resolve(code ?? 1);
			}
		});

		proc.on('error', (err) => {
			if (timer) clearTimeout(timer);
			onLine(`Command failed to start: ${err.message}`, true);
			resolve(1);
		});
	});
}

function flushBuffer(buffer: string[], onLine: (line: string) => void, flushAll = false): void {
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
 * Detects the package manager for a directory via packageManager field or lockfiles.
 * Searches the target directory and up to 3 parent levels (handles monorepo workspaces).
 * Falls back to npm when nothing conclusive is found.
 */
export function detectPackageManagerOrDefault(dir: string): PackageManager {
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

	// Check current directory and up to 3 parent levels for lockfiles
	let current = dir;
	for (let level = 0; level <= 3; level++) {
		for (const [file, pm] of Object.entries(LOCK_FILES)) {
			if (existsSync(join(current, file))) return pm;
		}
		const parent = dirname(current);
		if (parent === current) break; // reached filesystem root
		current = parent;
	}

	return 'npm';
}

/**
 * Splits a configured command string into binary + args tokens.
 * Commands come exclusively from internal configuration (deploy_commands),
 * never from webhook payloads.
 *
 * Leading `KEY=VALUE` tokens are parsed as inline environment variables
 * (e.g. `ATLAS_DOCS_BASE=/atlas/docs pnpm build:docs`), so a post-deploy
 * command can carry its own env without shell interpolation.
 */
export function tokenizeCommand(command: string): { bin: string; args: string[]; env: Record<string, string> } {
	const tokens = command.trim().split(/\s+/).filter(Boolean);
	const env: Record<string, string> = {};

	let i = 0;
	for (; i < tokens.length; i++) {
		const match = tokens[i].match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) break;
		env[match[1]] = match[2];
	}

	const bin = tokens[i] ?? '';
	return { bin, args: tokens.slice(i + 1), env };
}
