export interface EnvVars {
	TURSO_DATABASE_URL: string;
	TURSO_AUTH_TOKEN: string;
	BETTER_AUTH_URL: string;
	BETTER_AUTH_SECRET: string;
}

let cached: EnvVars | null = null;

export function getEnv(): EnvVars {
	if (cached) return cached;

	let TURSO_DATABASE_URL = '';
	let TURSO_AUTH_TOKEN = '';
	let BETTER_AUTH_URL = '';
	let BETTER_AUTH_SECRET = '';

	// Try SvelteKit's $env/dynamic/private first (works in server runtime)
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { env } = require('$env/dynamic/private');
		TURSO_DATABASE_URL = env.TURSO_DATABASE_URL || '';
		TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN || '';
		BETTER_AUTH_URL = env.BETTER_AUTH_URL || '';
		BETTER_AUTH_SECRET = env.BETTER_AUTH_SECRET || '';
	} catch {
		// Fallback for tests and non-SvelteKit contexts
		TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || '';
		TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || '';
		BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || '';
		BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || '';
	}

	cached = {
		TURSO_DATABASE_URL,
		TURSO_AUTH_TOKEN,
		BETTER_AUTH_URL,
		BETTER_AUTH_SECRET
	};

	return cached;
}
