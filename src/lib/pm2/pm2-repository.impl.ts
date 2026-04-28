import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import type { IPM2Repository, PM2Process, PM2Log } from './pm2.types';
import { escapeShellArg, isValidPm2Name } from '$lib/utils/shell';
import { logger } from '$lib/logger';

	const execAsync = promisify(exec);

export class PM2Repository implements IPM2Repository {
	async list(): Promise<PM2Process[]> {
		try {
			const { stdout } = await execAsync('pm2 jlist');
			return JSON.parse(stdout) as PM2Process[];
		} catch (error) {
			logger.error('Failed to list PM2 processes', { error: String(error) });
			return [];
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

		// Read stdout logs from actual PM2 path
		if (outLogPath && existsSync(outLogPath)) {
			const content = readFileSync(outLogPath, 'utf-8');
			const logLines = content.split('\n').filter(l => l.trim()).slice(-lines);
			for (const line of logLines) {
				result.push({ type: 'out', data: line, timestamp: parseTimestamp(line) });
			}
		}

		// Read error logs from actual PM2 path
		if (errLogPath && existsSync(errLogPath)) {
			const content = readFileSync(errLogPath, 'utf-8');
			const logLines = content.split('\n').filter(l => l.trim()).slice(-lines);
			for (const line of logLines) {
				result.push({ type: 'err', data: line, timestamp: parseTimestamp(line) });
			}
		}

		// Sort chronologically: oldest first
		return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
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
