export interface PM2Process {
	name: string;
	pm_id: number;
	monit: {
		cpu: number;
		memory: number;
	};
	pm2_env: {
		status: string;
		pm_uptime: number;
		restart_time: number;
		pm_cwd?: string;
		env?: Record<string, string>;
		pm_out_log_path?: string;
		pm_err_log_path?: string;
		cwd?: string;
		pm_exec_path?: string;
	};
}

export interface PM2Log {
	type: 'out' | 'err';
	data: string;
	timestamp: Date;
	/**
	 * False when the log line carried no embedded timestamp and `timestamp`
	 * is a placeholder (Unix epoch) used only for stable sorting.
	 */
	hasTimestamp: boolean;
	level: 'info' | 'warn' | 'error';
}

export interface ProcessWithStatus extends PM2Process {
	status: 'online' | 'stopped' | 'error' | 'offline';
	cpu: number;
	memoryMB: number;
	uptimeFormatted: string;
}

import type { PaginationParams, PaginatedResult } from '$lib/pagination';

export interface IPM2Repository {
	list(params?: PaginationParams): Promise<PM2Process[] | PaginatedResult<PM2Process>>;
	describe(name: string): Promise<PM2Process | null>;
	restart(name: string): Promise<void>;
	stop(name: string): Promise<void>;
	delete(name: string): Promise<void>;
	deleteFiles(cwd: string): Promise<void>;
	getLogs(name: string, lines?: number): Promise<PM2Log[]>;
	start(name: string): Promise<void>;
	clearLogs(name: string, stream?: 'out' | 'err'): Promise<void>;
}
