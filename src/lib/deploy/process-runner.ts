import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

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
		const proc = spawn(command, args, {
			cwd,
			shell: false,
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

	for (const [file, pm] of Object.entries(LOCK_FILES)) {
		if (existsSync(join(dir, file))) return pm;
	}

	return 'npm';
}

/**
 * Splits a configured command string into binary + args tokens.
 * Commands come exclusively from internal configuration (deploy_commands),
 * never from webhook payloads.
 */
export function tokenizeCommand(command: string): { bin: string; args: string[] } {
	const tokens = command.trim().split(/\s+/).filter(Boolean);
	return { bin: tokens[0], args: tokens.slice(1) };
}
