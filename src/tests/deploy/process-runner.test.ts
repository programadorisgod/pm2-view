import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokenizeCommand, hasPackageDependencies } from '../../../src/lib/deploy/process-runner';

describe('tokenizeCommand', () => {
	it('splits a plain command into bin and args', () => {
		expect(tokenizeCommand('pnpm run build')).toEqual({
			bin: 'pnpm',
			args: ['run', 'build'],
			env: {}
		});
	});

	it('parses leading KEY=VALUE tokens as inline environment', () => {
		expect(tokenizeCommand('ATLAS_DOCS_BASE=/atlas/docs pnpm build:docs')).toEqual({
			bin: 'pnpm',
			args: ['build:docs'],
			env: { ATLAS_DOCS_BASE: '/atlas/docs' }
		});
	});

	it('parses multiple env assignments', () => {
		expect(tokenizeCommand('FOO=1 BAR=two pnpm install')).toEqual({
			bin: 'pnpm',
			args: ['install'],
			env: { FOO: '1', BAR: 'two' }
		});
	});

	it('leaves env empty when the command has no assignments', () => {
		expect(tokenizeCommand('node -e process.exit(0)').env).toEqual({});
	});

	it('auto-resolves bare script names to package manager run command', () => {
		expect(tokenizeCommand('build:backend')).toEqual({
			bin: 'pnpm',
			args: ['run', 'build:backend'],
			env: {}
		});
	});

	it('handles shell operators with script names', () => {
		expect(tokenizeCommand('build:deps && build:backend')).toEqual({
			bin: 'pnpm run build:deps && pnpm run build:backend',
			args: [],
			env: {}
		});
	});
});

describe('hasPackageDependencies', () => {
	it('returns false when package.json does not exist', () => {
		expect(hasPackageDependencies('/nonexistent-dir-12345')).toBe(false);
	});

	it('returns false when package.json has no dependencies or devDependencies (e.g. token-validator)', () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'pkg-test-'));
		try {
			writeFileSync(
				join(tempDir, 'package.json'),
				JSON.stringify({
					name: 'token-validator',
					version: '1.0.0',
					type: 'module',
					scripts: { start: 'node src/server.js' }
				})
			);
			expect(hasPackageDependencies(tempDir)).toBe(false);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('returns true when package.json has dependencies or devDependencies', () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'pkg-test-'));
		try {
			writeFileSync(
				join(tempDir, 'package.json'),
				JSON.stringify({
					name: 'my-app',
					dependencies: { express: '^4.18.0' }
				})
			);
			expect(hasPackageDependencies(tempDir)).toBe(true);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
