import type { IPM2Repository, PM2Process, PM2Log, ProcessWithStatus } from './pm2.types';
import { logger } from '$lib/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import { dirname } from 'path';

const execAsync = promisify(exec);

export interface ProcessSummary {
	total: number;
	running: number;
	stopped: number;
	errored: number;
}

export class PM2Service {
	private repository: IPM2Repository;

	constructor(repository: IPM2Repository) {
		this.repository = repository;
	}

	async getAllProcesses(): Promise<ProcessWithStatus[]> {
		try {
			const result = await this.repository.list();
			const processes = Array.isArray(result) ? result : result.data;
			return processes.map((p) => this.enrichProcess(p));
		} catch (error) {
			// Graceful degradation when PM2 is not running
			logger.error('PM2 is not running or not accessible:', { error: String(error) });
			return [];
		}
	}

	async getProcessById(id: string): Promise<ProcessWithStatus | null> {
		try {
			const process = await this.repository.describe(id);
			if (!process) return null;
			return this.enrichProcess(process);
		} catch (error) {
			logger.error(`Failed to get process ${id}:`, { error: String(error) });
			return null;
		}
	}

  async restartProcess(id: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.repository.restart(id);
      return { success: true, message: `Process ${id} restarted successfully` };
    } catch (restartError) {
      // PM2 can't restart processes in errored/waiting-restart state.
      // Fallback: delete then start with the original config.
      try {
        const proc = await this.repository.describe(id);
        if (!proc) {
          return { success: false, message: `Process ${id} not found` };
        }
        const { name } = proc;
        const scriptPath = proc.pm2_env.pm_exec_path;
        // pm2 has no reliable --cwd start flag: cd inside the shell so the
        // daemon snapshots the project dir as pm_cwd and the app loads its own .env
        const dir = this.resolveProjectDir(proc);
        await this.repository.delete(id);
        const cdPrefix = dir ? `cd ${JSON.stringify(dir)} && ` : '';
        await execAsync(`${cdPrefix}pm2 start ${JSON.stringify(scriptPath)} --name ${JSON.stringify(name)}`);
        return { success: true, message: `Process ${name} restarted successfully (recreated)` };
      } catch (fallbackError) {
        logger.error(`Restart fallback failed for ${id}`, { error: String(fallbackError) });
        return {
          success: false,
          message: restartError instanceof Error ? restartError.message : 'Failed to restart process'
        };
      }
    }
  }

  async startProcess(id: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.repository.start(id);
      return { success: true, message: `Process ${id} started successfully` };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to start process'
      };
    }
  }

	async stopProcess(id: string): Promise<{ success: boolean; message: string }> {
		try {
			await this.repository.stop(id);
			return { success: true, message: `Process ${id} stopped successfully` };
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : 'Failed to stop process'
			};
		}
	}

	async deleteProcess(id: string, deleteFiles = false): Promise<{ success: boolean; message: string }> {
		try {
			const process = await this.repository.describe(id);

			// Try PM2 delete — don't fail if the process isn't registered
			let pm2Deleted = false;
			if (process) {
				try {
					await this.repository.delete(id);
					pm2Deleted = true;
				} catch {
					// Process was in describe but delete failed — proceed with cleanup
				}
			}

			// Resolve the name for DB and file lookup
			const processName = process?.name ?? id;

			// Look up DB record for targetPath and group handling
			let targetPath: string | null = null;
			let projectDeleted = false;
			try {
				const { db } = await import('$lib/db');
				const { projects } = await import('$lib/db/schema');
				const { eq, like } = await import('drizzle-orm');

				// Try direct pm2Name match first
				let row = await db.select().from(projects).where(eq(projects.pm2Name, processName)).get();

				// If not found, check if this name is inside a pm2Names JSON array (grouped project)
				if (!row) {
					const allProjects = await db.select().from(projects).where(
						like(projects.pm2Names, `%${processName}%`)
					).all();
					row = allProjects.find(p => {
						try {
							const names = JSON.parse(p.pm2Names!) as string[];
							return names.includes(processName);
						} catch { return false; }
					}) ?? null;
				}

				if (row) {
					targetPath = row.targetPath;

					// Check if this process is a member of a group (in pm2Names but not the primary)
					const isGroupMember = (() => {
						if (!row.pm2Names || row.pm2Name === processName) return false;
						try {
							const names = JSON.parse(row.pm2Names) as string[];
							return names.includes(processName);
						} catch { return false; }
					})();

					if (isGroupMember) {
						// Remove this process from the group, keep the project
						const names = JSON.parse(row.pm2Names!) as string[];
						const updatedNames = names.filter(n => n !== processName);
						if (updatedNames.length === 0) {
							// Last member removed — delete the project
							await db.delete(projects).where(eq(projects.id, row.id));
							projectDeleted = true;
						} else {
							// Still members remaining — update the array
							await db.update(projects)
								.set({ pm2Names: JSON.stringify(updatedNames) })
								.where(eq(projects.id, row.id));
						}
					} else {
						// Primary match or single project — delete the entire project
						await db.delete(projects).where(eq(projects.id, row.id));
						projectDeleted = true;
					}
				}
			} catch {
				// Non-critical: DB cleanup failure
			}

			// Use PM2 pm_cwd as fallback for targetPath
			if (!targetPath && process?.pm2_env?.pm_cwd) {
				targetPath = process.pm2_env.pm_cwd;
			}

			// Delete project files if requested
			if (deleteFiles && targetPath) {
				await this.repository.deleteFiles(targetPath);
				return {
					success: true,
					message: pm2Deleted
						? `Process ${id} and project files deleted successfully`
						: `Project files deleted (process was not in PM2)`
				};
			}

			if (pm2Deleted) {
				return { success: true, message: `Process ${id} deleted successfully` };
			}

			// Process wasn't in PM2 and no files to delete — still a success
			return { success: true, message: `Process ${id} removed (was not running in PM2)` };
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : 'Failed to delete process'
			};
		}
	}

	async getProcessLogs(id: string, lines: number = 100): Promise<PM2Log[]> {
		try {
			return await this.repository.getLogs(id, lines);
		} catch (error) {
			logger.error(`Failed to get logs for process ${id}:`, { error: String(error) });
			return [];
		}
	}

	async clearProcessLogs(
		id: string,
		stream: 'out' | 'err' = 'err'
	): Promise<{ success: boolean; message: string }> {
		try {
			await this.repository.clearLogs(id, stream);
			return {
				success: true,
				message: stream === 'err' ? 'Error logs cleared' : 'Output logs cleared'
			};
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : 'Failed to clear logs'
			};
		}
	}

	/**
	 * Resolves the directory where the process's .env lives.
	 * Trusts pm_cwd only when it contains the executed script; otherwise falls
	 * back to the script's directory (fixes processes started from a wrong folder).
	 */
	resolveProjectDir(process: PM2Process): string {
		const cwd = process.pm2_env?.pm_cwd || (process.pm2_env as { cwd?: string } | undefined)?.cwd || '';
		const scriptPath = process.pm2_env?.pm_exec_path || '';
		if (cwd && scriptPath && scriptPath.startsWith(`${cwd}/`)) {
			return cwd;
		}
		if (scriptPath) {
			return dirname(scriptPath);
		}
		return cwd;
	}

	getSummary(processes: ProcessWithStatus[]): ProcessSummary {
		return {
			total: processes.length,
			running: processes.filter((p) => p.status === 'online').length,
			stopped: processes.filter((p) => p.status === 'stopped').length,
			errored: processes.filter((p) => p.status === 'error').length
		};
	}

	private enrichProcess(process: PM2Process): ProcessWithStatus {
		const status = this.mapStatus(process.pm2_env.status);
		return {
			...process,
			status,
			cpu: process.monit.cpu,
			memoryMB: Math.round(process.monit.memory / 1024 / 1024),
			uptimeFormatted: this.formatUptime(process.pm2_env.pm_uptime)
		};
	}

	private mapStatus(pm2Status: string): 'online' | 'stopped' | 'error' | 'offline' {
		switch (pm2Status) {
			case 'online':
			case 'launching':
				return 'online';
			case 'stopped':
			case 'stopping':
				return 'stopped';
			case 'errored':
			case 'error':
			case 'waiting restart':
				return 'error';
			default:
				return 'offline';
		}
	}

	private formatUptime(uptimeMs: number): string {
		if (!uptimeMs || uptimeMs <= 0) return 'N/A';

		// pm_uptime is a Unix timestamp, calculate elapsed time
		const elapsedMs = Date.now() - uptimeMs;
		const seconds = Math.floor(elapsedMs / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ${hours % 24}h`;
		if (hours > 0) return `${hours}h ${minutes % 60}m`;
		if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
		return `${seconds}s`;
	}
}
