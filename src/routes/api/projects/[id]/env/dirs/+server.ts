import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { getProjectRole } from '$lib/server/project-access';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { logger } from '$lib/logger';
import { existsSync, readdirSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

const MAX_DEPTH = 3;
const MAX_DIRS = 200;
const SKIPPED = new Set([
	'node_modules',
	'.git',
	'.svelte-kit',
	'dist',
	'build',
	'coverage',
	'.next',
	'.nuxt',
	'vendor',
	'__pycache__',
]);

function collectDirs(root: string): string[] {
	const dirs: string[] = ['.'];
	const queue: Array<{ abs: string; depth: number }> = [{ abs: root, depth: 0 }];

	while (queue.length > 0 && dirs.length < MAX_DIRS) {
		const current = queue.shift();
		if (!current || current.depth >= MAX_DEPTH) continue;

		let entries;
		try {
			entries = readdirSync(current.abs, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith('.')) continue;
			if (SKIPPED.has(entry.name)) continue;

			const abs = join(current.abs, entry.name);
			const rel = relative(root, abs).split(sep).join('/');
			dirs.push(rel);
			if (dirs.length >= MAX_DIRS) break;
			queue.push({ abs, depth: current.depth + 1 });
		}
	}

	return dirs;
}

export const GET: RequestHandler = async ({ params, request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	const user = session.user as any;
	if (user.banned) {
		return json({ error: 'Account is banned' }, { status: 403 });
	}

	const id = params.id;
	if (!id) {
		return json({ error: 'Process ID is required' }, { status: 400 });
	}

	try {
		// Get process info to find working directory
		const { PM2Service } = await import('$lib/pm2/pm2.service');
		const { PM2Repository } = await import('$lib/pm2/pm2-repository.impl');
		const pm2Service = new PM2Service(new PM2Repository());
		const process = await pm2Service.getProcessById(id);

		if (!process) {
			return json({ error: 'Process not found' }, { status: 404 });
		}

		if (user.role !== 'admin') {
			const projectRepo = new ProjectRepository();
			const allProjects = await projectRepo.getAll();
			const project = allProjects.find(
				(p) => p.id === id || p.pm2Name === process.name || (p.pm2Names && p.pm2Names.includes(process.name))
			);
			if (!project) {
				return json({ error: 'Access denied to this project' }, { status: 403 });
			}
			const role = await getProjectRole(user.id, project.id, user.role);
			if (!role) {
				return json({ error: 'Access denied to this project' }, { status: 403 });
			}
		}

		const cwd = pm2Service.resolveProjectDir(process);
		if (!cwd) {
			return json({ error: 'Process working directory not found' }, { status: 400 });
		}

		const projectRoot = resolve(cwd);
		if (!existsSync(projectRoot)) {
			return json({ error: 'Process working directory not found' }, { status: 400 });
		}

		return json({
			success: true,
			dirs: collectDirs(projectRoot),
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Failed to list project directories', { processId: id, errorMessage });
		return json({ error: `Failed to list directories: ${errorMessage}` }, { status: 500 });
	}
};
