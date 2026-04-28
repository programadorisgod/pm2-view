/**
 * Escape a string for safe use in shell commands.
 * Prevents command injection by wrapping in single quotes
 * and escaping any existing single quotes.
 */
export function escapeShellArg(arg: string): string {
  if (!arg || typeof arg !== 'string') {
    throw new Error('Invalid shell argument: must be a non-empty string');
  }
  // Wrap in single quotes, escape any existing single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Validate that a process name/id is safe for PM2 commands.
 * PM2 process names should only contain alphanumeric chars, hyphens, underscores, and dots.
 */
export function isValidPm2Name(name: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(name);
}
