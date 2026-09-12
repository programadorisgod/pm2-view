export interface ConfirmRequest {
	title: string;
	message?: string;
	confirmLabel: string;
	danger: boolean;
	resolve: (ok: boolean) => void;
}

let request = $state<ConfirmRequest | null>(null);

export function confirmAction(options: {
	title: string;
	message?: string;
	confirmLabel?: string;
	danger?: boolean;
}): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		request = {
			title: options.title,
			message: options.message,
			confirmLabel: options.confirmLabel ?? 'Confirmar',
			danger: options.danger ?? false,
			resolve
		};
	});
}

export function resolveConfirm(ok: boolean): void {
	const current = request;
	request = null;
	current?.resolve(ok);
}

export function resetDialog(): void {
	request = null;
}

export function getRequest(): ConfirmRequest | null {
	return request;
}
