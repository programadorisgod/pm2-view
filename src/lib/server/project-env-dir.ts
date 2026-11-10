import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import type { PM2Service } from '$lib/pm2/pm2.service';
import type { PM2Process } from '$lib/pm2/pm2.types';

function matchesProjectProcess(
	project: { id: string; pm2Name: string; pm2Names: string | null },
	paramId: string,
	processName: string
): boolean {
	if (project.id === paramId || project.pm2Name === processName) {
		return true;
	}
	if (!project.pm2Names) return false;
	try {
		const names = JSON.parse(project.pm2Names) as unknown;
		if (Array.isArray(names)) {
			return names.includes(processName);
		}
	} catch {
		return project.pm2Names.includes(processName);
	}
	return false;
}

/**
 * Resolves the effective project directory for env management endpoints.
 * Uses PM2Service.resolveProjectDir first, falling back to the registered
 * project's targetPath in SQLite if PM2 metadata yields an empty path.
 */
export async function resolveEffectiveProjectDir(
	pm2Service: PM2Service,
	process: PM2Process,
	paramId: string
): Promise<string> {
	const resolved = pm2Service.resolveProjectDir(process);
	if (resolved) {
		return resolved;
	}

	try {
		const projectRepo = new ProjectRepository();
		const allProjects = await projectRepo.getAll();
		const project = allProjects.find((p) => matchesProjectProcess(p, paramId, process.name));
		if (project?.targetPath) {
			const trimmed = project.targetPath.trim();
			if (/^[\\/]+$/.test(trimmed)) return trimmed[0];
			if (/^[A-Za-z]:[\\/]+$/.test(trimmed)) return trimmed.slice(0, 3);
			return trimmed.replace(/[\\/]+$/, '');
		}
	} catch {
		// Non-critical: return empty string when DB fallback is unavailable
	}

	return '';
}
