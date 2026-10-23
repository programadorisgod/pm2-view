import type { PM2Process, ProcessWithStatus } from '$lib/pm2/pm2.types';
import type { Project } from '$lib/projects/project.types';

export class ProjectGrouper {
	private static pm2NamesCache = new Map<string, string[]>();
	private static readonly MAX_CACHE_SIZE = 500;

	static parsePm2Names(dbProject: Project): string[] | undefined {
		if (!dbProject.pm2Names) return undefined;
		const cached = ProjectGrouper.pm2NamesCache.get(dbProject.pm2Names);
		if (cached) return cached;

		try {
			const parsed = JSON.parse(dbProject.pm2Names) as unknown;
			if (Array.isArray(parsed) && parsed.length > 0) {
				const names = parsed as string[];
				if (ProjectGrouper.pm2NamesCache.size >= ProjectGrouper.MAX_CACHE_SIZE) {
					const firstKey = ProjectGrouper.pm2NamesCache.keys().next().value;
					if (firstKey !== undefined) ProjectGrouper.pm2NamesCache.delete(firstKey);
				}
				ProjectGrouper.pm2NamesCache.set(dbProject.pm2Names, names);
				return names;
			}
		} catch {
			// Ignore JSON parse errors
		}
		return undefined;
	}

	static toProcessWithStatus(proc: PM2Process): ProcessWithStatus {
		return {
			...proc,
			status: ProjectGrouper.mapStatus(proc.pm2_env?.status, proc.pm2_env?.exit_code, proc.pm2_env?.autorestart),
			cpu: proc.monit?.cpu ?? 0,
			memoryMB: Math.round((proc.monit?.memory ?? 0) / 1024 / 1024),
			uptimeFormatted: ProjectGrouper.formatUptime(proc.pm2_env?.pm_uptime),
		};
	}

	static mapStatus(pm2Status: string | undefined, exitCode?: number, autorestart?: boolean): ProcessWithStatus['status'] {
		if (!pm2Status) return 'offline';
		switch (pm2Status) {
			case 'online':
			case 'launching':
				return 'online';
			case 'stopped':
			case 'stopping':
			case 'one-launch-only':
			case 'waiting restart':
				return 'stopped';
			case 'errored':
			case 'error':
				if (exitCode === 0 || autorestart === false) {
					return 'stopped';
				}
				return 'error';
			default:
				return 'offline';
		}
	}

	static getWorstStatus(processes: ProcessWithStatus[]): 'online' | 'stopped' | 'error' | 'offline' {
		if (processes.some((p) => p.status === 'error')) return 'error';
		if (processes.some((p) => p.status === 'stopped')) return 'stopped';
		if (processes.every((p) => p.status === 'online')) return 'online';
		return 'offline';
	}

	static formatUptime(uptimeMs?: number): string {
		if (!uptimeMs) return 'Unknown';
		const seconds = Math.floor((Date.now() - uptimeMs) / 1000);
		if (seconds < 0) return 'Just started';
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		if (days > 0) return `${days}d ${hours}h`;
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	static determineAccessType(
		dbProject: Project | undefined,
		userId: string
	): 'personal' | 'team' | 'shared' {
		if (!dbProject) return 'personal';
		if (dbProject.teamId) return 'team';
		if (dbProject.userId === userId) return 'personal';
		return 'shared';
	}
}
