import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import type { IPM2Repository, PM2Process, PM2Log } from './pm2.types';

const execAsync = promisify(exec);

export class PM2Repository implements IPM2Repository {
	async list(): Promise<PM2Process[]> {
		try {
			const { stdout } = await execAsync('pm2 jlist');
			return JSON.parse(stdout) as PM2Process[];
		} catch {
			return [];
		}
	}

	async describe(name: string): Promise<PM2Process | null> {
		try {
			const { stdout } = await execAsync('pm2 jlist');
			const processes = JSON.parse(stdout) as PM2Process[];
			return processes.find(p => p.pm_id.toString() === name || p.name === name) ?? null;
		} catch {
			return null;
		}
	}

	async restart(name: string): Promise<void> {
		await execAsync(`pm2 restart ${name}`);
	}

	async stop(name: string): Promise<void> {
		await execAsync(`pm2 stop ${name}`);
	}

	async delete(name: string): Promise<void> {
		await execAsync(`pm2 delete ${name}`);
	}

	async getLogs(name: string, lines: number = 100): Promise<PM2Log[]> {
		// First get the process to find actual log paths from PM2
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
				result.push({ type: 'out', data: line, timestamp: new Date() });
			}
		}

		// Read error logs from actual PM2 path
		if (errLogPath && existsSync(errLogPath)) {
			const content = readFileSync(errLogPath, 'utf-8');
			const logLines = content.split('\n').filter(l => l.trim()).slice(-lines);
			for (const line of logLines) {
				result.push({ type: 'err', data: line, timestamp: new Date() });
			}
		}

		return result;
	}
}
