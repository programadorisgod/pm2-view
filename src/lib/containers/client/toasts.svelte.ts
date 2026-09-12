export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
	id: number;
	type: ToastType;
	title: string;
	message?: string;
}

let toasts = $state<Toast[]>([]);
let nextId = 1;

export function pushToast(input: Omit<Toast, 'id'> & { durationMs?: number }): Toast {
	const id = nextId++;
	const toast: Toast = { id, type: input.type, title: input.title, message: input.message };
	toasts.push(toast);
	if (input.durationMs !== 0) {
		setTimeout(() => dismiss(id), input.durationMs ?? 5000);
	}
	return toast;
}

export function dismiss(id: number): void {
	toasts = toasts.filter((t) => t.id !== id);
}

export function resetToasts(): void {
	toasts = [];
}

export function getToasts(): Toast[] {
	return toasts;
}
