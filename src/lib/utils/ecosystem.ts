import { readdir } from 'fs/promises';
import { readFileSync } from 'fs';
import { join } from 'path';

const ECOSYSTEM_FILES = [
	'ecosystem.cjs',
	'ecosystem.config.js',
	'ecosystem.config.cjs',
	'ecosystem.config.ts',
	'pm2.config.js',
	'pm2.config.cjs',
	'ecosystem.json',
] as const;

export type EcosystemFile = (typeof ECOSYSTEM_FILES)[number];

export async function findEcosystemFiles(dir: string): Promise<string[]> {
	const found: string[] = [];

	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile()) {
				const name = entry.name.toLowerCase();
				if (ECOSYSTEM_FILES.some((ef) => name === ef)) {
					found.push(entry.name);
				}
			}
		}
	} catch {
		// Directory read error - return empty
	}

	return found;
}

/**
 * Parse ecosystem file and extract app names.
 * Uses regex to safely extract names without executing the file.
 */
export function parseEcosystemAppNames(dir: string, ecosystemFiles: string[]): string[] {
	const names: string[] = [];

	for (const file of ecosystemFiles) {
		try {
			const content = readFileSync(join(dir, file), 'utf-8');

			if (file.endsWith('.json')) {
				// JSON format: { apps: [{ name: "..." }] }
				const parsed = JSON.parse(content);
				if (parsed.apps && Array.isArray(parsed.apps)) {
					for (const app of parsed.apps) {
						if (app.name && typeof app.name === 'string') {
							names.push(app.name);
						}
					}
				}
			} else {
				// JS/CJS format: module.exports = { apps: [{ name: "..." }] }
				// Extract name fields using regex (safe, no code execution)
				const nameRegex = /name\s*:\s*['"]([^'"]+)['"]/g;
				let match;
				while ((match = nameRegex.exec(content)) !== null) {
					names.push(match[1]);
				}
			}
		} catch {
			// Skip files that can't be read/parsed
		}
	}

	return [...new Set(names)]; // Deduplicate
}
