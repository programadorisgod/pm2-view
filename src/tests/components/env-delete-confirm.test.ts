import { describe, it, expect, vi } from 'vitest';
import {
	CLOSED_DELETE_ENV_MODAL,
	executeEnvRowDelete,
	getEnvRemovalAction,
	type EnvRow,
} from '$lib/utils/env-row-delete';

describe('env-row-delete', () => {
	describe('getEnvRemovalAction', () => {
		it('returns noop when index is out of bounds', () => {
			const rows: EnvRow[] = [{ key: 'API_KEY', value: '123' }];
			expect(getEnvRemovalAction(rows, -1)).toEqual({ kind: 'noop' });
			expect(getEnvRemovalAction(rows, 1)).toEqual({ kind: 'noop' });
		});

		it('removes blank or whitespace-only rows immediately without confirmation', () => {
			const rows: EnvRow[] = [
				{ key: 'API_KEY', value: '123' },
				{ key: '   ', value: '' },
			];
			const action = getEnvRemovalAction(rows, 1);
			expect(action).toEqual({
				kind: 'remove-blank',
				nextRows: [{ key: 'API_KEY', value: '123' }],
			});
		});

		it('opens confirmation modal with trimmed keyName for keyed rows', () => {
			const rows: EnvRow[] = [
				{ key: '  DATABASE_URL ', value: 'postgres://localhost/db' },
				{ key: 'PORT', value: '3000' },
			];
			const action = getEnvRemovalAction(rows, 0);
			expect(action).toEqual({
				kind: 'confirm',
				modal: {
					open: true,
					index: 0,
					keyName: 'DATABASE_URL',
				},
			});
		});

		it('exposes a closed default modal state', () => {
			expect(CLOSED_DELETE_ENV_MODAL).toEqual({
				open: false,
				index: -1,
				keyName: '',
			});
		});
	});

	describe('executeEnvRowDelete', () => {
		it('persists remaining rows and clears dirty state on successful save', async () => {
			const rows: EnvRow[] = [
				{ key: 'API_KEY', value: 'secret' },
				{ key: 'PORT', value: '3000' },
			];
			const save = vi.fn().mockResolvedValue(true);

			const result = await executeEnvRowDelete(rows, 0, false, save);

			expect(save).toHaveBeenCalledWith([{ key: 'PORT', value: '3000' }]);
			expect(result).toEqual({
				rows: [{ key: 'PORT', value: '3000' }],
				dirty: false,
				deleted: true,
			});
		});

		it('rolls back rows and preserves dirty flag when save fails', async () => {
			const rows: EnvRow[] = [
				{ key: 'API_KEY', value: 'secret' },
				{ key: 'PORT', value: '3000' },
			];
			const save = vi.fn().mockResolvedValue(false);

			const result = await executeEnvRowDelete(rows, 0, true, save);

			expect(save).toHaveBeenCalledWith([{ key: 'PORT', value: '3000' }]);
			expect(result).toEqual({
				rows: [
					{ key: 'API_KEY', value: 'secret' },
					{ key: 'PORT', value: '3000' },
				],
				dirty: true,
				deleted: false,
			});
		});

		it('does not invoke save when index is invalid', async () => {
			const rows: EnvRow[] = [{ key: 'PORT', value: '3000' }];
			const save = vi.fn();

			const result = await executeEnvRowDelete(rows, 5, false, save);

			expect(save).not.toHaveBeenCalled();
			expect(result).toEqual({
				rows: [{ key: 'PORT', value: '3000' }],
				dirty: false,
				deleted: false,
			});
		});
	});
});
