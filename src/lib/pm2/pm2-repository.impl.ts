import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { truncate } from 'fs/promises';
import type { IPM2Repository, PM2Process, PM2Log } from './pm2.types';
import { normalizePagination, type PaginationParams, type PaginatedResult } from '$lib/pagination';
import { escapeShellArg } from '$lib/utils/shell';
import { logger } from '$lib/logger';

const execAsync = promisify(exec);

export class PM2Repository implements IPM2Repository {
	private logPathCache = new Map<string, { out: string | null; err: string | null }>();

	async list(params?: PaginationParams): Promise<PM2Process[] | PaginatedResult<PM2Process>> {
		try {
			const { stdout } = await execAsync('pm2 jlist');
			const processes = JSON.parse(stdout) as PM2Process[];

			if (!params) return processes;

			const { limit, offset } = normalizePagination(params);
			const paginated = processes.slice(offset, offset + limit);
			return {
				data: paginated,
				total: processes.length,
				limit,
				offset,
				hasMore: offset + paginated.length < processes.length
			};
		} catch (error) {
			logger.error('Failed to list PM2 processes', { error: String(error) });
			return params ? { data: [], total: 0, limit: 50, offset: 0, hasMore: false } : [];
		}
	}

	async describe(name: string): Promise<PM2Process | null> {
		try {
			const { stdout } = await execAsync('pm2 jlist');
			const processes = JSON.parse(stdout) as PM2Process[];
			return processes.find(p => p.pm_id.toString() === name || p.name === name) ?? null;
		} catch (error) {
			logger.error('Failed to describe PM2 process', { name, error: String(error) });
			return null;
		}
	}

  async restart(name: string): Promise<void> {
    const safeName = escapeShellArg(name);
    await execAsync(`pm2 restart ${safeName}`);
    this.logPathCache.delete(name);
  }

  async start(name: string): Promise<void> {
    const safeName = escapeShellArg(name);
    await execAsync(`pm2 start ${safeName}`);
    this.logPathCache.delete(name);
  }

	async stop(name: string): Promise<void> {
		const safeName = escapeShellArg(name);
		await execAsync(`pm2 stop ${safeName}`);
		this.logPathCache.delete(name);
	}

	async delete(name: string): Promise<void> {
		const safeName = escapeShellArg(name);
		await execAsync(`pm2 delete ${safeName}`);
		this.logPathCache.delete(name);
	}

	async deleteFiles(cwd: string): Promise<void> {
		if (!existsSync(cwd)) return;
		await rm(cwd, { recursive: true, force: true });
	}

	async getLogs(name: string, lines: number = 100): Promise<PM2Log[]> {
		let paths = this.logPathCache.get(name);
		if (!paths) {
			const proc = await this.describe(name);
			if (!proc) return [];
			paths = {
				out: proc.pm2_env.pm_out_log_path ?? null,
				err: proc.pm2_env.pm_err_log_path ?? null,
			};
			this.logPathCache.set(name, paths);
		}

		const result: PM2Log[] = [];

		if (paths.out && existsSync(paths.out)) {
			const logLines = await this.readLogFile(paths.out, lines);
			for (const line of logLines) {
				const ts = parseTimestamp(line);
				result.push({ type: 'out', data: line, timestamp: ts ?? new Date(0), hasTimestamp: ts !== null, level: classifyLogLevel(line, 'out') });
			}
		}

		if (paths.err && existsSync(paths.err)) {
			const logLines = await this.readLogFile(paths.err, lines);
			for (const line of logLines) {
				const ts = parseTimestamp(line);
				result.push({ type: 'err', data: line, timestamp: ts ?? new Date(0), hasTimestamp: ts !== null, level: classifyLogLevel(line, 'err') });
			}
		}

		return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	}

	private async readLogFile(path: string, lines: number): Promise<string[]> {
		try {
			const safePath = escapeShellArg(path);
			const { stdout } = await execAsync(`tail -n ${lines} ${safePath}`);
			return stdout.split('\n').filter(l => l.trim());
		} catch (error) {
			logger.warn('Failed to read log file', { path, error: String(error) });
			return [];
		}
	}

	async clearLogs(name: string, stream: 'out' | 'err' = 'err'): Promise<void> {
		const proc = await this.describe(name);
		if (!proc) return;
		this.logPathCache.delete(name);

		const logPath = stream === 'out' ? proc.pm2_env.pm_out_log_path : proc.pm2_env.pm_err_log_path;
		if (!logPath || !existsSync(logPath)) return;

		try {
			await truncate(logPath, 0);
		} catch (error) {
			logger.warn('Failed to clear log file', { path: logPath, error: String(error) });
			throw error;
		}
	}
}

/**
 * Extracts timestamp from a PM2 log line.
 * PM2 format: "2026-04-28 15:02:14: message..." or "[out] 2026-04-28 15:02:14: ..."
 * Returns null if no timestamp is found (PM2 only prefixes timestamps when
 * the process is started with the `--time` option).
 */
function parseTimestamp(line: string): Date | null {
	// Match YYYY-MM-DD HH:MM:SS pattern (with optional leading prefix like "[out] ")
	const match = line.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
	if (match) {
		const parsed = new Date(match[1]);
		if (!isNaN(parsed.getTime())) {
			return parsed;
		}
	}
	return null;
}

/**
 * Content-based log level classification.
 * PM2 routes stdout → out file, stderr → err file, but many apps write
 * informational startup messages to stderr. This function overrides the
 * stream-based default when the content clearly indicates a different level.
 */
function classifyLogLevel(line: string, streamType: 'out' | 'err'): 'info' | 'warn' | 'error' {
	const lower = line.toLowerCase();

	// False positives: stderr lines that are NOT errors
	// Common in Node.js apps that write startup info to stderr
	const isFalsePositive =
		/\b(next|nuxt|vite|astro|sveltekit|react|vue|angular|nest|express)\b.*start/i.test(line) ||
		/\b(pm2|node|npm|yarn|pnpm)\b.{0,40}(start|running|installed|version|listening|ready|init|exit|loaded|boot|compil)/i.test(line) ||
		/\b(LISTENING|listening on|started on|ready|port)\b/i.test(line) ||
		/\bcompil(e|ing|ed|er)\b/i.test(line) ||
		/\b(build|building|built)\b/i.test(line) ||
		/\b(hot[- ]?module|hmr|module reload)\b/i.test(line) ||
		/\b(deploy|deploying|deployed)\b/i.test(line) ||
		/\b(watching|watch)\b/i.test(line) ||
		/\b(discount|discountinued)\b/i.test(line) ||
		/\b(node_modules|\.next|\.nuxt|dist|build)\b/i.test(line) ||
		/^\s*$/.test(line);

	// True error patterns (override stream-based default when found in stdout)
	const hasErrorPattern =
		/\b(FATAL|panic|uncaught exception|unhandled rejection)\b/i.test(line) ||
		/\bsegmentation fault|core dumped\b/i.test(line) ||
		/\bout of memory\b/i.test(line) ||
		/\bcannot (read|find|open|access|connect|resolve)\b/i.test(line) ||
		/\berrno\b.*\b(coded|=\s*\d+)\b/i.test(line) ||
		/\bstack trace\b/i.test(line) ||
		/^Trace\s*\(/.test(line) || // Node.js stack trace start
		/^\s+at\s+/.test(line); // Node.js stack trace frame

	// True warning patterns
	const hasWarnPattern =
		/\bwarn(ing)?\b/i.test(line) &&
		!/\b(deprecat|deprecated)\b/i.test(line); // deprecation is warn
	const hasDeprecation =
		/\bdeprecat(ed|ion)\b/i.test(line);

	// Explicit level tags in the line
	const hasExplicitError = /\bERR(O[R]?)?\b[:\s]/i.test(line) || /\berror[:\s]/i.test(line);
	const hasExplicitWarn = /\bWARN(ING)?[:\s]/i.test(line);
	const hasExplicitInfo = /\bINFO[:\s]/i.test(line);

	// Resolve level: explicit tags > content patterns > stream default
	if (hasExplicitError || hasErrorPattern) return 'error';
	if (hasExplicitWarn || hasWarnPattern || hasDeprecation) return 'warn';
	if (hasExplicitInfo) return 'info';

	// If it's stderr but looks like a false positive, demote to info
	if (streamType === 'err' && isFalsePositive) return 'info';

	// Default: match the stream
	return streamType === 'err' ? 'error' : 'info';
}
