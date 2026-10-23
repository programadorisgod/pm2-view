import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

export const WORKSPACE_INDICATORS = [
	'pnpm-workspace.yaml',
	'lerna.json',
	'nx.json',
	'turbo.json',
	'rush.json',
	'.yarnrc.yml',
] as const;

export class WorkspaceDetector {
	private static cache = new Map<string, { root: string | null; timestamp: number }>();
	private static readonly TTL_MS = 30000;
	private static readonly MAX_CACHE_SIZE = 500;

	/**
	 * Detects workspace root directory for a given start directory.
	 * Ascends up to maxLevels parent directories looking for workspace manifests.
	 */
	static getWorkspaceRoot(startDir: string, maxLevels = 4): string | null {
		if (!startDir) return null;
		const dir = startDir.replace(/[/\\]+$/, '');
		const now = Date.now();

		const cached = WorkspaceDetector.cache.get(dir);
		if (cached && now - cached.timestamp < WorkspaceDetector.TTL_MS) {
			return cached.root;
		}

		let current = dir;
		let wsRoot: string | null = null;

		for (let i = 0; i < maxLevels; i++) {
			for (const file of WORKSPACE_INDICATORS) {
				if (existsSync(join(current, file))) {
					wsRoot = current;
					break;
				}
			}

			if (!wsRoot) {
				const pkgPath = join(current, 'package.json');
				if (existsSync(pkgPath)) {
					try {
						const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
						if (pkg.workspaces) {
							wsRoot = current;
						}
					} catch {
						// Ignore unparsable package.json
					}
				}
			}

			if (wsRoot) break;

			const parent = dirname(current);
			if (parent === current) break;
			current = parent;
		}

		WorkspaceDetector.setBoundedCache(dir, { root: wsRoot, timestamp: now });
		return wsRoot;
	}

	private static setBoundedCache(key: string, value: { root: string | null; timestamp: number }): void {
		if (WorkspaceDetector.cache.size >= WorkspaceDetector.MAX_CACHE_SIZE) {
			const firstKey = WorkspaceDetector.cache.keys().next().value;
			if (firstKey !== undefined) {
				WorkspaceDetector.cache.delete(firstKey);
			}
		}
		WorkspaceDetector.cache.set(key, value);
	}

	static clearCache(): void {
		WorkspaceDetector.cache.clear();
	}
}
