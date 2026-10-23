import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PackageManager } from './deploy.types';

export const LOCK_FILES: Record<string, PackageManager> = {
	'pnpm-lock.yaml': 'pnpm',
	'bun.lockb': 'bun',
	'bun.lock': 'bun',
} as const;

/**
 * Detects the package manager (pnpm or bun) from package.json or lockfiles.
 */
export function detectPackageManager(dir: string): PackageManager {
	const pkgPath = join(dir, 'package.json');
	if (existsSync(pkgPath)) {
		try {
			const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
			if (pkg.packageManager) {
				const [pm] = pkg.packageManager.split('@');
				if (pm === 'pnpm' || pm === 'bun') return pm;
			}
		} catch {
			// ignore parse errors
		}
	}

	for (const [file, pm] of Object.entries(LOCK_FILES)) {
		if (existsSync(join(dir, file))) return pm;
	}

	throw new Error(
		`No pnpm or bun lockfile found in ${dir}. Cannot determine package manager.`
	);
}

/**
 * Reads npm scripts from package.json in the specified directory.
 */
export function readPackageScripts(dir: string): Record<string, string> | null {
	const pkgPath = join(dir, 'package.json');
	if (!existsSync(pkgPath)) return null;
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
		return pkg.scripts ?? null;
	} catch {
		return null;
	}
}
