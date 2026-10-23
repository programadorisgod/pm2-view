import { describe, it, expect } from 'vitest';
import { isStderrFatal, runCommand } from '../../lib/deploy/command-runner';

describe('command-runner', () => {
	describe('isStderrFatal', () => {
		it('returns false for Node deprecation warnings', () => {
			const line1 =
				'(node:4092188) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications.';
			const line2 = '(Use `node --trace-deprecation ...` to show where the warning was created)';
			const line3 =
				'(node:3016) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities';

			expect(isStderrFatal(line1)).toBe(false);
			expect(isStderrFatal(line2)).toBe(false);
			expect(isStderrFatal(line3)).toBe(false);
		});

		it('returns false for general deprecation and experimental notices', () => {
			expect(isStderrFatal('Warning: deprecated package found')).toBe(false);
			expect(isStderrFatal('ExperimentalWarning: VM Modules is an experimental feature')).toBe(false);
		});

		it('returns true for real errors on stderr', () => {
			expect(isStderrFatal('Error: Cannot find module ./server.js')).toBe(true);
			expect(isStderrFatal('FATAL: failed to compile native addon')).toBe(true);
			expect(isStderrFatal('SyntaxError: Unexpected token <')).toBe(true);
		});
	});

	describe('runCommand stderr classification', () => {
		it('classifies deprecation warnings as isError=false when emitted on stderr', async () => {
			const lines: { text: string; isError: boolean }[] = [];

			const code = await runCommand(
				process.cwd(),
				'node',
				['-e', '"process.stderr.write(\'(node:1234) [DEP0169] DeprecationWarning: url.parse() is deprecated\\n\'); process.exit(0);"'],
				(line, isError) => {
					lines.push({ text: line, isError });
				}
			);

			expect(code).toBe(0);
			expect(lines.length).toBeGreaterThan(0);
			const depLine = lines.find((l) => l.text.includes('DEP0169'));
			expect(depLine).toBeDefined();
			expect(depLine?.isError).toBe(false);
		});

		it('classifies hard errors on stderr as isError=true', async () => {
			const lines: { text: string; isError: boolean }[] = [];

			const code = await runCommand(
				process.cwd(),
				'node',
				['-e', '"process.stderr.write(\'FatalError: command failed\\n\'); process.exit(1);"'],
				(line, isError) => {
					lines.push({ text: line, isError });
				}
			);

			expect(code).toBe(1);
			expect(lines.length).toBeGreaterThan(0);
			const errLine = lines.find((l) => l.text.includes('FatalError'));
			expect(errLine).toBeDefined();
			expect(errLine?.isError).toBe(true);
		});
	});
});
