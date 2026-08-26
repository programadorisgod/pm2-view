import { json } from '@sveltejs/kit';
import { adminHandler } from '$lib/server/admin-handler';
import { createServices } from '$lib/services/factory';
import { ProjectRepository } from '$lib/db/repositories/project-repository.impl';
import { existsSync, readFileSync } from 'fs';
import { join, basename, dirname } from 'path';

interface UnregisteredProcess {
	name: string;
	pm_id: number;
	status: string;
	cwd: string;
}

interface ProcessGroup {
	cwd: string;
	processes: UnregisteredProcess[];
}

const WORKSPACE_INDICATORS = [
	'pnpm-workspace.yaml',
	'lerna.json',
	'nx.json',
	'turbo.json',
	'rush.json',
	'.yarnrc.yml',
];

function normalizeCwd(cwd: string): string {
	return cwd.replace(/\/+$/, '');
}

function findWorkspaceRoot(startDir: string): string | null {
	let dir = normalizeCwd(startDir);
	// Search up to 4 levels (enough for apps/backend -> apps -> ATLAS -> projects)
	for (let i = 0; i < 4; i++) {
		for (const file of WORKSPACE_INDICATORS) {
			if (existsSync(join(dir, file))) return dir;
		}
		// Also check package.json for "workspaces" field
		const pkgPath = join(dir, 'package.json');
		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
				if (pkg.workspaces) return dir;
			} catch { /* ignore */ }
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

export const GET = adminHandler(async () => {
	const { pm2Service } = createServices();
	const projectRepo = new ProjectRepository();

	const [pm2Processes, projects] = await Promise.all([
		pm2Service.getAllProcesses(),
		projectRepo.getAll(),
	]);

	// Build set of all registered names (pm2Name + pm2Names)
	const registeredNames = new Set<string>();
	for (const p of projects) {
		registeredNames.add(p.pm2Name);
		if (p.pm2Names) {
			try {
				const names = JSON.parse(p.pm2Names) as string[];
				for (const n of names) registeredNames.add(n);
			} catch {
				// ignore parse errors
			}
		}
	}

	const unregistered = pm2Processes
		.filter(p => !registeredNames.has(p.name))
		.map(p => ({
			name: p.name,
			pm_id: p.pm_id,
			status: p.pm2_env?.status ?? 'unknown',
			cwd: p.pm2_env?.pm_cwd
				?? p.pm2_env?.cwd
				?? '',
		}));

	// Group by normalized cwd
	const cwdMap = new Map<string, UnregisteredProcess[]>();
	for (const proc of unregistered) {
		const key = normalizeCwd(proc.cwd);
		if (!key) continue;
		const list = cwdMap.get(key) ?? [];
		list.push(proc);
		cwdMap.set(key, list);
	}

	// Separate initial groups (same cwd) and singles
	const tmpGroups: ProcessGroup[] = [];
	const singles: UnregisteredProcess[] = [];

	for (const [cwd, processes] of cwdMap) {
		if (processes.length > 1) {
			tmpGroups.push({ cwd, processes });
		} else {
			singles.push(processes[0]);
		}
	}

	// Detect monorepos: group singles that share a workspace root
	const workspaceMap = new Map<string, UnregisteredProcess[]>();
	const stillSingles: UnregisteredProcess[] = [];

	for (const proc of singles) {
		const root = findWorkspaceRoot(proc.cwd);
		if (root) {
			const list = workspaceMap.get(root) ?? [];
			list.push(proc);
			workspaceMap.set(root, list);
		} else {
			stillSingles.push(proc);
		}
	}

	// Merge workspace groups
	const groups: ProcessGroup[] = [...tmpGroups];
	for (const [root, processes] of workspaceMap) {
		if (processes.length > 1) {
			groups.push({ cwd: root, processes });
		} else {
			stillSingles.push(processes[0]);
		}
	}

	return json({ groups, singles: stillSingles });
});
