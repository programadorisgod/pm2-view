let dynamicEnv: Record<string, string | undefined> = {};
try {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { env } = require('$env/dynamic/private');
	dynamicEnv = env || {};
} catch {
	// Fallback for tests or non-SvelteKit contexts
}

export function getEnv(key: string, fallback = ''): string {
	const val = dynamicEnv[key] ?? process.env[key];
	return val !== undefined && val !== '' ? val : fallback;
}
