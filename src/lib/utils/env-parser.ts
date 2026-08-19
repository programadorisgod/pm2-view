/**
 * Parse a .env file string into a key-value object.
 * Handles: comments, blank lines, quoted values, escaped characters.
 */
export function parseEnv(content: string): Record<string, string> {
	const env: Record<string, string> = {};

	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();

		// Skip empty lines and comments
		if (!line || line.startsWith('#')) continue;

		const eqIndex = line.indexOf('=');
		if (eqIndex === -1) continue;

		const key = line.slice(0, eqIndex).trim();
		if (!key) continue;

		let value = line.slice(eqIndex + 1).trim();

		// Remove surrounding quotes (single or double)
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		// Unescape common sequences
		value = value
			.replace(/\\n/g, '\n')
			.replace(/\\t/g, '\t')
			.replace(/\\r/g, '\r')
			.replace(/\\"/g, '"')
			.replace(/\\'/g, "'");

		env[key] = value;
	}

	return env;
}

/**
 * Convert a key-value object into a .env file string.
 */
export function stringifyEnv(env: Record<string, string>): string {
	return Object.entries(env)
		.filter(([key]) => key.trim())
		.map(([key, value]) => {
			// Quote values that contain spaces, special chars, or are empty
			const needsQuotes = value.includes(' ') || value.includes('#') || value.includes('=') || value.includes('\n');
			const escaped = value
				.replace(/\\/g, '\\\\')
				.replace(/"/g, '\\"')
				.replace(/\n/g, '\\n');
			return needsQuotes ? `${key}="${escaped}"` : `${key}=${escaped}`;
		})
		.join('\n');
}
