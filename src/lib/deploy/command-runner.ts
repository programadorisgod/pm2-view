import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';

export const APPROVAL_INDICATORS = /requires approval|needs to be built|approve-builds/i;
export const PACKAGE_LINE = /^\s*-\s+(.+)$/;

/** Environment map passed to spawned child processes (values may be undefined, like Node's process.env). */
export type EnvMap = Record<string, string | undefined>;

export function resolveProjectRoot(execPath: string, maxUpward = 10): string | null {
	let dir = dirname(execPath);
	for (let i = 0; i < maxUpward; i++) {
		if (existsSync(join(dir, 'package.json'))) return dir;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

export function extractPendingPackages(output: string[]): string[] {
	const packages: string[] = [];
	let inApprovalSection = false;

	for (const line of output) {
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

export function flushBuffer(
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

export const STDERR_NON_FATAL_REGEX =
	/^\(node:\d+\)\s+\[DEP\d+\]|\b(deprecat(ed|ion)|experimentalwarning)\b|^\(Use `node --trace-deprecation/i;

export function isStderrFatal(line: string): boolean {
	if (STDERR_NON_FATAL_REGEX.test(line.trim())) {
		return false;
	}
	return true;
}

export function runCommand(
	cwd: string,
	command: string,
	args: string[],
	onLine: (line: string, isError: boolean) => void,
	env?: EnvMap,
): Promise<number> {
	return new Promise((resolve) => {
		const proc = spawn(command, args, {
			cwd,
			shell: true,
			stdio: ['ignore', 'pipe', 'pipe'],
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
			flushBuffer(bufferErr, (l) => onLine(l, isStderrFatal(l)));
		});

		proc.on('close', (code) => {
			flushBuffer(bufferOut, (l) => onLine(l, false), true);
			flushBuffer(bufferErr, (l) => onLine(l, isStderrFatal(l)), true);
			resolve(code ?? 1);
		});

		proc.on('error', (err) => {
			onLine(`Command failed to start: ${err.message}`, true);
			resolve(1);
		});
	});
}
