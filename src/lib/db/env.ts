export interface EnvVars {
	TURSO_DATABASE_URL: string;
	TURSO_AUTH_TOKEN: string;
	BETTER_AUTH_URL: string;
	BETTER_AUTH_SECRET: string;
	GITHUB_APP_ID: string;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	GITHUB_PRIVATE_KEY: string;
	GITHUB_WEBHOOK_SECRET: string;
	GITHUB_APP_SLUG: string;
	APP_BASE_PATH: string;
	REPOS_PATH: string;
}

let cached: EnvVars | null = null;

export function getEnv(): EnvVars {
	if (cached) return cached;

	let TURSO_DATABASE_URL = '';
	let TURSO_AUTH_TOKEN = '';
	let BETTER_AUTH_URL = '';
	let BETTER_AUTH_SECRET = '';
	let GITHUB_APP_ID = '';
	let GITHUB_CLIENT_ID = '';
	let GITHUB_CLIENT_SECRET = '';
	let GITHUB_PRIVATE_KEY = '';
	let GITHUB_WEBHOOK_SECRET = '';
	let GITHUB_APP_SLUG = '';
	let APP_BASE_PATH = '';
	let REPOS_PATH = '/opt/repos';

	// Try SvelteKit's $env/dynamic/private first (works in server runtime)
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { env } = require('$env/dynamic/private');
		TURSO_DATABASE_URL = env.TURSO_DATABASE_URL || '';
		TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN || '';
		BETTER_AUTH_URL = env.BETTER_AUTH_URL || '';
		BETTER_AUTH_SECRET = env.BETTER_AUTH_SECRET || '';
		GITHUB_APP_ID = env.GITHUB_APP_ID || '';
		GITHUB_CLIENT_ID = env.GITHUB_CLIENT_ID || '';
		GITHUB_CLIENT_SECRET = env.GITHUB_CLIENT_SECRET || '';
		GITHUB_PRIVATE_KEY = env.GITHUB_PRIVATE_KEY || '';
		GITHUB_WEBHOOK_SECRET = env.GITHUB_WEBHOOK_SECRET || '';
		GITHUB_APP_SLUG = env.GITHUB_APP_SLUG || '';
		APP_BASE_PATH = env.APP_BASE_PATH || '';
		REPOS_PATH = env.REPOS_PATH || '/opt/repos';
	} catch {
		// Fallback for tests and non-SvelteKit contexts
		TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || '';
		TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || '';
		BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || '';
		BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || '';
		GITHUB_APP_ID = process.env.GITHUB_APP_ID || '';
		GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
		GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
		GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY || '';
		GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
		GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG || '';
		APP_BASE_PATH = process.env.APP_BASE_PATH || '';
		REPOS_PATH = process.env.REPOS_PATH || '/opt/repos';
	}

	cached = {
		TURSO_DATABASE_URL,
		TURSO_AUTH_TOKEN,
		BETTER_AUTH_URL,
		BETTER_AUTH_SECRET,
		GITHUB_APP_ID,
		GITHUB_CLIENT_ID,
		GITHUB_CLIENT_SECRET,
		GITHUB_PRIVATE_KEY,
		GITHUB_WEBHOOK_SECRET,
		GITHUB_APP_SLUG,
		APP_BASE_PATH,
		REPOS_PATH
	};

	return cached;
}
