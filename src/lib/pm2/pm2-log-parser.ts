const TIMESTAMP_REGEX = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/;

// Explicit warning tags (brackets, tags, or emojis in Spanish & English)
const EXPLICIT_WARN_REGEX =
	/\[\s*(alerta|alert|warn|warning|advertencia|aviso|caution|atenci[oó]n)\s*\]/i;
const EXPLICIT_WARN_WORD_REGEX = /\b(alerta|alert|warn|warning|advertencia|aviso|caution)\b[:\s]/i;
const WARN_EMOJI_REGEX = /⚠️/u;

// Explicit error tags
const EXPLICIT_ERROR_REGEX =
	/\[\s*(error|err|fatal|panic|crit|critical)\s*\]/i;
const EXPLICIT_ERROR_WORD_REGEX = /\b(err(o[r]?)?|fatal|panic|critical)\b[:\s]/i;
const ERROR_EMOJI_REGEX = /❌|🛑/u;

// Explicit info tags
const EXPLICIT_INFO_REGEX =
	/\[\s*(info|information|debug|diagnostic|diag|trace)\s*\]/i;
const EXPLICIT_INFO_WORD_REGEX = /\b(info|debug|diagnostic)\b[:\s]/i;
const INFO_EMOJI_REGEX = /ℹ️/u;

// True fatal/hard error patterns (override stream-based default when found in stdout)
const HARD_ERROR_REGEX =
	/\b(FATAL|panic|uncaught exception|unhandled rejection|segmentation fault|core dumped|out of memory|cannot (read|find|open|access|connect|resolve)|errno|stack trace|EADDRINUSE|EACCES|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|address already in use)\b|^Trace\s*\(|^\s+at\s+/i;
const PORT_ERROR_REGEX = /\bport\b.{0,20}\b(in use|already|conflict|error|fail)\b/i;

// True warning patterns (retries, business alerts, deadlocks, desbalances, deprecations)
const WARN_PATTERN_REGEX =
	/\b(warn(ing)?|alerta|advertencia|aviso|caution|retry(ing)?|reintento|reintentando|attempt\s*\d+|deadlock.*retry|desbalance|umbral|deprecat(ed|ion))\b/i;

// False positives: stderr lines that are NOT errors (startup messages on stderr)
const FALSE_POSITIVE_STDERR_REGEX =
	/\b(next|nuxt|vite|astro|sveltekit|react|vue|angular|nest|express|fastapi|uvicorn)\b.*start|\b(pm2|node|npm|yarn|pnpm|python)\b.{0,40}(start|running|installed|version|listening|ready|init|exit|loaded|boot|compil)|\b(LISTENING|listening on|started on|ready)\b|\bcompil(e|ing|ed|er)\b|\b(build|building|built)\b|\b(hot[- ]?module|hmr|module reload)\b|\b(deploy|deploying|deployed)\b|\b(watching|watch)\b|\b(discount|discountinued)\b|\b(node_modules|\.next|\.nuxt)\b.*\b(start|running|loaded|ready)\b|^node:\s.*not found$/i;

/**
 * Extracts timestamp from a PM2 log line.
 * PM2 format: "2026-04-28 15:02:14: message..." or "[out] 2026-04-28 15:02:14: ..."
 * Returns null if no timestamp is found.
 */
export function parseTimestamp(line: string): Date | null {
	const match = line.match(TIMESTAMP_REGEX);
	if (match) {
		const parsed = new Date(match[1]);
		if (!isNaN(parsed.getTime())) {
			return parsed;
		}
	}
	return null;
}

/**
 * Content-based log level classification with pre-compiled regexes.
 * PM2 routes stdout -> out file, stderr -> err file, but many apps write
 * informational startup messages or warnings to stderr. This function overrides the
 * stream-based default when the content clearly indicates a different level.
 */
export function classifyLogLevel(line: string, streamType: 'out' | 'err'): 'info' | 'warn' | 'error' {
	if (!line || !line.trim()) {
		return streamType === 'err' ? 'info' : 'info';
	}

	// 1. Explicit warning tags (brackets, tags, or emojis in Spanish & English)
	if (
		WARN_EMOJI_REGEX.test(line) ||
		EXPLICIT_WARN_REGEX.test(line) ||
		EXPLICIT_WARN_WORD_REGEX.test(line)
	) {
		return 'warn';
	}

	// 2. Explicit error tags
	if (
		ERROR_EMOJI_REGEX.test(line) ||
		EXPLICIT_ERROR_REGEX.test(line) ||
		EXPLICIT_ERROR_WORD_REGEX.test(line)
	) {
		return 'error';
	}

	// 3. Explicit info tags
	if (
		INFO_EMOJI_REGEX.test(line) ||
		EXPLICIT_INFO_REGEX.test(line) ||
		EXPLICIT_INFO_WORD_REGEX.test(line)
	) {
		return 'info';
	}

	// 4. True fatal/hard error patterns (override stream-based default when found in stdout)
	if (HARD_ERROR_REGEX.test(line) || PORT_ERROR_REGEX.test(line)) {
		return 'error';
	}

	// 5. True warning patterns (retries, business alerts, deadlocks, desbalances, deprecations)
	if (WARN_PATTERN_REGEX.test(line)) {
		return 'warn';
	}

	// 6. False positives: stderr lines that are NOT errors
	if (streamType === 'err' && FALSE_POSITIVE_STDERR_REGEX.test(line)) {
		return 'info';
	}

	// 7. Default: match the stream
	return streamType === 'err' ? 'error' : 'info';
}
