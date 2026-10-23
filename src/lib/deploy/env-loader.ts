import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

const ENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local'] as const;

/**
 * Loads the project's `.env*` files from the working directory.
 * Order (later wins): .env → .env.local → .env.production → .env.production.local
 */
export function loadProjectEnv(dir: string): Record<string, string> {
	const env: Record<string, string> = {};

	for (const file of ENV_FILES) {
		const path = join(dir, file);
		if (!existsSync(path)) continue;
		try {
			const parsed = dotenv.parse(readFileSync(path, 'utf-8'));
			Object.assign(env, parsed);
		} catch {
			// Ignore unparsable env files
		}
	}

	return env;
}
