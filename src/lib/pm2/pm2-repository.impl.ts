import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, existsSync } from 'fs';
import type { IPM2Repository, PM2Process, PM2Log } from './pm2.types';
import { normalizePagination, type PaginationParams, type PaginatedResult } from '$lib/pagination';
import { escapeShellArg } from '$lib/utils/shell';
import { logger } from '$lib/logger';

const execAsync = promisify(exec);
const readFileAsync = promisify(readFile);

export class PM2Repository implements IPM2Repository {
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
	}

	async stop(name: string): Promise<void> {
		const safeName = escapeShellArg(name);
		await execAsync(`pm2 stop ${safeName}`);
	}

	async delete(name: string): Promise<void> {
		const safeName = escapeShellArg(name);
		await execAsync(`pm2 delete ${safeName}`);
	}

	async getLogs(name: string, lines: number = 100): Promise<PM2Log[]> {
		const proc = await this.describe(name);
		if (!proc) return [];

		const outLogPath = proc.pm2_env.pm_out_log_path;
		const errLogPath = proc.pm2_env.pm_err_log_path;

		const result: PM2Log[] = [];

		if (outLogPath && existsSync(outLogPath)) {
			const logLines = await this.readLogFile(outLogPath, lines);
			for (const line of logLines) {
				result.push({ type: 'out', data: line, timestamp: parseTimestamp(line) });
			}
		}

		if (errLogPath && existsSync(errLogPath)) {
			const logLines = await this.readLogFile(errLogPath, lines);
			for (const line of logLines) {
				result.push({ type: 'err', data: line, timestamp: parseTimestamp(line) });
			}
		}

		return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	}

	private async readLogFile(path: string, lines: number): Promise<string[]> {
		try {
			const content = await readFileAsync(path, 'utf-8');
			return content.split('\n').filter(l => l.trim()).slice(-lines);
		} catch (error) {
			logger.warn('Failed to read log file', { path, error: String(error) });
			return [];
		}
	}
}

/**
 * Extracts timestamp from a PM2 log line.
 * PM2 format: "2026-04-28 15:02:14: message..." or "[out] 2026-04-28 15:02:14: ..."
 * Falls back to Unix epoch if no timestamp is found.
 */
function parseTimestamp(line: string): Date {
	// Match YYYY-MM-DD HH:MM:SS pattern (with optional leading prefix like "[out] ")
	const match = line.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
	if (match) {
		const parsed = new Date(match[1]);
		if (!isNaN(parsed.getTime())) {
			return parsed;
		}
	}
	// Fallback: epoch (will sort before any real timestamp)
	return new Date(0);
}
