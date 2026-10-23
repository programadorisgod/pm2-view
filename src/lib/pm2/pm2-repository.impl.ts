import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { rm, truncate, open, stat } from 'fs/promises';
import type { IPM2Repository, PM2Process, PM2Log } from './pm2.types';
import { normalizePagination, type PaginationParams, type PaginatedResult } from '$lib/pagination';
import { escapeShellArg } from '$lib/utils/shell';
import { logger } from '$lib/logger';
import { parseTimestamp, classifyLogLevel } from './pm2-log-parser';

export { parseTimestamp, classifyLogLevel };

const execAsync = promisify(exec);

/**
 * Safely parses the JSON output from `pm2 jlist`.
 * PM2 CLI commands frequently output banners, module notices, or warnings
 * before or after the JSON payload (e.g. "[PM2] ...", "[PM2][WARN] ...", "Module: ...").
 */
export function parsePM2JList(stdout: string): any[] {
	const trimmed = stdout.trim();
	if (!trimmed) return [];

	// Fast path: clean JSON output
	try {
		const parsed = JSON.parse(trimmed);
		if (Array.isArray(parsed)) return parsed;
	} catch {
		// Output contains non-JSON noise (banners, warnings, etc.)
	}

	// Linear scanner looking for candidate balanced JSON arrays
	let start = trimmed.indexOf('[');
	while (start !== -1) {
		const tag = trimmed.slice(start, start + 5);
		// Ignore banners like [PM2] and tags like [WARN]
		if (tag !== '[PM2]' && !/^\[[A-Z0-9_-]+\]/i.test(trimmed.slice(start, start + 15))) {
			let depth = 0;
			let inString = false;
			let escape = false;

			for (let i = start; i < trimmed.length; i++) {
				const char = trimmed[i];
				if (escape) {
					escape = false;
					continue;
				}
				if (char === '\\') {
					escape = true;
					continue;
				}
				if (char === '"') {
					inString = !inString;
					continue;
				}
				if (!inString) {
					if (char === '[') depth++;
					else if (char === ']') {
						depth--;
						if (depth === 0) {
							const candidate = trimmed.slice(start, i + 1);
							try {
								const parsed = JSON.parse(candidate);
								if (Array.isArray(parsed)) return parsed;
							} catch {
								// continue outer search
							}
							break;
						}
					}
				}
			}
		}
		start = trimmed.indexOf('[', start + 1);
	}

	// Fallback to searching backwards from closing bracket
	let fallbackStart = trimmed.indexOf('[');
	while (fallbackStart !== -1) {
		const tag = trimmed.slice(fallbackStart, fallbackStart + 5);
		if (tag !== '[PM2]') {
			let end = trimmed.lastIndexOf(']');
			while (end !== -1 && end > fallbackStart) {
				try {
					const candidate = trimmed.slice(fallbackStart, end + 1);
					const parsed = JSON.parse(candidate);
					if (Array.isArray(parsed)) {
						return parsed;
					}
				} catch {
					// Try previous ']'
				}
				end = trimmed.lastIndexOf(']', end - 1);
			}
		}
		fallbackStart = trimmed.indexOf('[', fallbackStart + 1);
	}

	throw new Error(`Failed to parse PM2 jlist output: ${trimmed.slice(0, 150)}`);
}

/**
 * Checks if a PM2 process is an internal PM2 module (e.g. pm2-logrotate).
 */
export function isPM2Module(p: any): boolean {
	return Boolean(
		p?.pm2_env?.pmx_module === true ||
		p?.pm2_env?.axm_options?.isModule === true ||
		p?.pmx_module === true
	);
}

export class PM2Repository implements IPM2Repository {
	private static readonly MAX_LOG_PATH_CACHE = 500;
	private logPathCache = new Map<string, { out: string | null; err: string | null }>();
	private listCache: { data: PM2Process[]; timestamp: number } | null = null;
	private readonly CACHE_TTL_MS = 4000; // 4s TTL for snappy navigation between pages

	private setLogPathCache(name: string, paths: { out: string | null; err: string | null }): void {
		if (this.logPathCache.size >= PM2Repository.MAX_LOG_PATH_CACHE) {
			const firstKey = this.logPathCache.keys().next().value;
			if (firstKey !== undefined) this.logPathCache.delete(firstKey);
		}
		this.logPathCache.set(name, paths);
	}

	private sanitizeProcess(p: any): PM2Process {
		// Strip giant process.env dictionaries and keep only necessary fields for UI
		return {
			name: p.name ?? 'unknown',
			pm_id: p.pm_id ?? -1,
			monit: {
				cpu: p.monit?.cpu ?? 0,
				memory: p.monit?.memory ?? 0
			},
			pm2_env: {
				status: p.pm2_env?.status ?? 'stopped',
				pm_uptime: p.pm2_env?.pm_uptime ?? 0,
				restart_time: p.pm2_env?.restart_time ?? 0,
				pm_cwd: p.pm2_env?.pm_cwd ?? p.pm2_env?.cwd ?? '',
				pm_exec_path: p.pm2_env?.pm_exec_path ?? '',
				pm_out_log_path: p.pm2_env?.pm_out_log_path,
				pm_err_log_path: p.pm2_env?.pm_err_log_path,
				exit_code: p.pm2_env?.exit_code,
				autorestart: p.pm2_env?.autorestart
			}
		};
	}

	async list(params?: PaginationParams, forceFresh = false): Promise<PM2Process[] | PaginatedResult<PM2Process>> {
		try {
			const now = Date.now();
			let processes: PM2Process[];

			if (!forceFresh && this.listCache && (now - this.listCache.timestamp < this.CACHE_TTL_MS)) {
				processes = this.listCache.data;
			} else {
				const { stdout } = await execAsync('pm2 jlist');
				const raw = parsePM2JList(stdout);
				processes = raw
					.filter(p => !isPM2Module(p))
					.map(p => this.sanitizeProcess(p));
				this.listCache = { data: processes, timestamp: now };
			}

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
			logger.error('Failed to list PM2 processes', { error: error instanceof Error ? error.message : String(error) });
			return params ? { data: [], total: 0, limit: 50, offset: 0, hasMore: false } : [];
		}
	}

	async describe(name: string): Promise<PM2Process | null> {
		try {
			const listResult = await this.list();
			const processes = Array.isArray(listResult) ? listResult : listResult.data;
			return processes.find(p => p.pm_id.toString() === name || p.name === name) ?? null;
		} catch (error) {
			logger.error('Failed to describe PM2 process', { name, error: error instanceof Error ? error.message : String(error) });
			return null;
		}
	}

	async restart(name: string): Promise<void> {
		const safeName = escapeShellArg(name);
		await execAsync(`pm2 restart ${safeName}`);
		this.logPathCache.delete(name);
		this.listCache = null;
	}

	async start(name: string): Promise<void> {
		const safeName = escapeShellArg(name);
		await execAsync(`pm2 start ${safeName}`);
		this.logPathCache.delete(name);
		this.listCache = null;
	}

	async stop(name: string): Promise<void> {
		const safeName = escapeShellArg(name);
		await execAsync(`pm2 stop ${safeName}`);
		this.logPathCache.delete(name);
		this.listCache = null;
	}

	async delete(name: string): Promise<void> {
		const safeName = escapeShellArg(name);
		await execAsync(`pm2 delete ${safeName}`);
		this.logPathCache.delete(name);
		this.listCache = null;
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
			this.setLogPathCache(name, paths);
		}

		const result: PM2Log[] = [];

		if (paths.out && existsSync(paths.out)) {
			const logLines = await this.readLogFile(paths.out, lines);
			for (let i = 0; i < logLines.length; i++) {
				const line = logLines[i];
				const ts = parseTimestamp(line);
				result.push({ type: 'out', data: line, timestamp: ts ?? new Date(0), hasTimestamp: ts !== null, level: classifyLogLevel(line, 'out') });
			}
		}

		if (paths.err && existsSync(paths.err)) {
			const logLines = await this.readLogFile(paths.err, lines);
			for (let i = 0; i < logLines.length; i++) {
				const line = logLines[i];
				const ts = parseTimestamp(line);
				result.push({ type: 'err', data: line, timestamp: ts ?? new Date(0), hasTimestamp: ts !== null, level: classifyLogLevel(line, 'err') });
			}
		}

		return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	}

	private async readLogFile(filePath: string, lines: number): Promise<string[]> {
		try {
			const fileStat = await stat(filePath).catch(() => null);
			if (!fileStat || fileStat.size === 0) return [];

			// PM2 log lines are typically 50-200 bytes. Read tail buffer (max 64KB or lines * 500 bytes)
			const readSize = Math.min(fileStat.size, Math.max(64 * 1024, lines * 500));
			const fd = await open(filePath, 'r');
			try {
				const buffer = Buffer.alloc(readSize);
				await fd.read(buffer, 0, readSize, fileStat.size - readSize);
				const content = buffer.toString('utf-8');
				const allLines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
				return allLines.slice(-lines);
			} finally {
				await fd.close();
			}
		} catch (error) {
			logger.warn('Failed to read log file', { path: filePath, error: error instanceof Error ? error.message : String(error) });
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
			logger.warn('Failed to clear log file', { path: logPath, error: error instanceof Error ? error.message : String(error) });
			throw error;
		}
	}
}
