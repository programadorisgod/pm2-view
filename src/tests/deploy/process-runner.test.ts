import { describe, it, expect } from 'vitest';
import { tokenizeCommand } from '../../../src/lib/deploy/process-runner';

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
});
