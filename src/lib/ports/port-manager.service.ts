import { exec } from 'child_process';
import { promisify } from 'util';
import { PortScannerService } from './port-scanner.service';
import { AuditLogRepository } from '$lib/db/repositories/audit-log-repository.impl';
import { logger } from '$lib/logger';
import type { PortInfo } from './types';

const execAsync = promisify(exec);

export interface KillResult {
	success: boolean;
	message: string;
	port: number;
	pid: number | null;
	processName: string | null;
}

export class PortManagerService {
	private scanner = new PortScannerService();
	private auditRepo = new AuditLogRepository();

	async getPorts(): Promise<{ ports: PortInfo[]; summary: ReturnType<PortScannerService['getSummary']> }> {
		const ports = await this.scanner.scan();
		const summary = this.scanner.getSummary(ports);
		return { ports, summary };
	}

	async killByPid(pid: number, actorId: string): Promise<KillResult> {
		if (!Number.isInteger(pid) || pid <= 0) {
			return { success: false, message: 'Invalid PID', port: 0, pid, processName: null };
		}

		try {
			await execAsync(`kill -9 ${pid}`);
			await this.logAction(actorId, 'port.kill_pid', pid, null);
			return {
				success: true,
				message: `Process ${pid} killed successfully`,
				port: 0,
				pid,
				processName: null
			};
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'Failed to kill process';
			logger.error(`Failed to kill PID ${pid}`, { error: msg });
			return { success: false, message: msg, port: 0, pid, processName: null };
		}
	}

	async killByPort(port: number, actorId: string): Promise<KillResult> {
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			return { success: false, message: 'Invalid port number', port, pid: null, processName: null };
		}

		try {
			await execAsync(`fuser -k ${port}/tcp 2>/dev/null; fuser -k ${port}/udp 2>/dev/null`);
			await this.logAction(actorId, 'port.kill_port', null, port);
			return {
				success: true,
				message: `Port ${port} freed successfully`,
				port,
				pid: null,
				processName: null
			};
		} catch (error) {
			// fuser exits non-zero when no process found — that's ok
			const msg = error instanceof Error ? error.message : '';
			if (msg.includes('No such process') || msg.includes('not found')) {
				await this.logAction(actorId, 'port.kill_port', null, port);
				return {
					success: true,
					message: `Port ${port} is now free`,
					port,
					pid: null,
					processName: null
				};
			}
			logger.error(`Failed to free port ${port}`, { error: msg });
			return { success: false, message: msg || 'Failed to free port', port, pid: null, processName: null };
		}
	}

	private async logAction(actorId: string, action: string, pid: number | null, port: number | null) {
		try {
			await this.auditRepo.create({
				action,
				actorId,
				resourceType: 'port',
				resourceId: port ? String(port) : pid ? `pid:${pid}` : undefined,
				details: { port, pid, timestamp: new Date().toISOString() }
			});
		} catch (error) {
			logger.warn('Failed to write audit log for port action', { error: String(error) });
		}
	}
}
