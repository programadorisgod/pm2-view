export interface EnvRow {
	key: string;
	value: string;
}

export interface DeleteEnvModalState {
	open: boolean;
	index: number;
	keyName: string;
}

export const CLOSED_DELETE_ENV_MODAL: DeleteEnvModalState = {
	open: false,
	index: -1,
	keyName: '',
};

export type EnvRemovalAction =
	| { kind: 'noop' }
	| { kind: 'remove-blank'; nextRows: EnvRow[] }
	| { kind: 'confirm'; modal: DeleteEnvModalState };

/**
 * Determines whether clicking remove on an environment row should discard a blank
 * unsaved row immediately or open the confirmation modal for a named key.
 */
export function getEnvRemovalAction(rows: readonly EnvRow[], index: number): EnvRemovalAction {
	const target = rows[index];
	if (!target) {
		return { kind: 'noop' };
	}

	const keyName = target.key.trim();
	if (!keyName) {
		return {
			kind: 'remove-blank',
			nextRows: rows.filter((_, i) => i !== index),
		};
	}

	return {
		kind: 'confirm',
		modal: { open: true, index, keyName },
	};
}

/**
 * Executes a confirmed row deletion and rolls back rows/dirty state if persistence fails.
 */
export async function executeEnvRowDelete(
	rows: readonly EnvRow[],
	index: number,
	currentDirty: boolean,
	save: (nextRows: EnvRow[]) => Promise<boolean>,
): Promise<{ rows: EnvRow[]; dirty: boolean; deleted: boolean }> {
	if (index < 0 || index >= rows.length) {
		return { rows: [...rows], dirty: currentDirty, deleted: false };
	}

	const previousRows = [...rows];
	const nextRows = rows.filter((_, i) => i !== index);
	const saved = await save(nextRows);

	if (!saved) {
		return { rows: previousRows, dirty: currentDirty, deleted: false };
	}

	return { rows: nextRows, dirty: false, deleted: true };
}
