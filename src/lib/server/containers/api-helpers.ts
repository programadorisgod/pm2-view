import { json } from '@sveltejs/kit';

export function apiOk(message: string, extra: Record<string, unknown> = {}) {
	return json({ ok: true, message, ...extra });
}

export function apiError(status: number, message: string) {
	return json({ ok: false, error: message }, { status });
}

export function errorMessage(err: unknown): string {
	const message = (err as Error).message || String(err);
	return message.replace(/\n/g, ' ').slice(0, 300);
}
