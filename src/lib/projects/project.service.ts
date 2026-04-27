import type { PM2Process } from '../pm2/pm2.types';
import type { ProcessWithStatus } from '../pm2/pm2.types';
import type { Project } from './project.types';
import { PM2Service } from '../pm2/pm2.service';
import type { IPM2Repository } from '../pm2/pm2.types';

export interface ProjectWithStatus extends Project {
	pm2Status?: 'online' | 'stopped' | 'error' | 'offline';
	cpu?: number;
	memoryMB?: number;
	uptimeFormatted?: string;
	pm2Name: string;
}

export class ProjectService {
	private pm2Service: PM2Service;

	constructor(pm2Repository: IPM2Repository) {
		this.pm2Service = new PM2Service(pm2Repository);
	}

	async getAllProjects(): Promise<ProjectWithStatus[]> {
		const processes = await this.pm2Service.getAllProcesses();
		return processes.map((p) => this.mapPm2ToProject(p));
	}

	async getProjectById(id: string): Promise<ProjectWithStatus | null> {
		const process = await this.pm2Service.getProcessById(id);
		if (!process) return null;
		return this.mapPm2ToProject(process);
	}

	mapPm2ToProject(pm2Process: ProcessWithStatus): ProjectWithStatus {
		// Create a Project-like object from PM2 process
		// In a real scenario, we might have a database of projects
		// For now, we derive project data from PM2 process
		return {
			id: pm2Process.pm_id.toString(),
			name: pm2Process.name,
			description: `PM2 process: ${pm2Process.name}`,
			userId: '', // Not available from PM2 directly
			createdAt: new Date(),
			pm2Status: pm2Process.status,
			cpu: pm2Process.cpu,
			memoryMB: pm2Process.memoryMB,
			uptimeFormatted: pm2Process.uptimeFormatted,
			pm2Name: pm2Process.name
		};
	}

	async getProjectActions() {
		return {
			restart: async (id: string) => await this.pm2Service.restartProcess(id),
			stop: async (id: string) => await this.pm2Service.stopProcess(id),
			delete: async (id: string) => await this.pm2Service.deleteProcess(id)
		};
	}
}
