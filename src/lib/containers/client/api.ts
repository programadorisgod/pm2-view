import { base } from '$app/paths';
import type { EngineStatus, NotificationChannelType, WatchRunResult, WatchState } from '$lib/types';

export class ApiError extends Error {
	constructor(
		message: string,
		public readonly status?: number
	) {
		super(message);
		this.name = 'ApiError';
	}
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const fullUrl = url.startsWith('/') ? `${base}${url}` : url;
	let response: Response;
	try {
		response = await fetch(fullUrl, init);
	} catch {
		throw new ApiError('No se pudo conectar con el servidor.');
	}
	let data: unknown = null;
	try {
		data = await response.json();
	} catch {
		/* empty body */
	}
	if (!response.ok) {
		const message =
			(data &&
			typeof data === 'object' &&
			'error' in data &&
			typeof (data as { error: unknown }).error === 'string'
				? (data as { error: string }).error
				: `Error HTTP ${response.status}`) ?? `Error HTTP ${response.status}`;
		throw new ApiError(message, response.status);
	}
	return data as T;
}

export function fetchStatus(): Promise<{
	status: EngineStatus[];
	watcher: {
		enabled: boolean;
		intervalMs: number;
		alertCount: number;
		lastAlertAt: number | null;
		targetCount: number;
	};
}> {
	return request('/api/status');
}

export function fetchList<T>(kind: 'containers' | 'images' | 'volumes' | 'networks'): Promise<T[]> {
	return request(`/api/${kind}`);
}

export interface ActionResult {
	ok: boolean;
	message: string;
}

export function runAction(
	kind: 'containers' | 'images' | 'volumes' | 'networks',
	id: string,
	action: string,
	payload: Record<string, unknown> = {}
): Promise<ActionResult> {
	return request(`/api/${kind}/${encodeURIComponent(id)}/${action}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
}

export function setHighlight(
	id: string,
	name: string,
	highlighted: boolean
): Promise<ActionResult> {
	return request(`/api/containers/${encodeURIComponent(id)}/highlight`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ highlighted, name })
	});
}

export function fetchWatcher(): Promise<WatchState> {
	return request('/api/watcher');
}

export function updateWatcher(patch: {
	enabled?: boolean;
	intervalMs?: number;
}): Promise<WatchState> {
	return request('/api/watcher', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(patch)
	});
}

export function runWatcherNow(): Promise<WatchRunResult> {
	return request('/api/watcher/run', { method: 'POST' });
}

export interface SettingsView {
	to: string;
	from: string;
	multiTo: boolean;
	channels: {
		type: NotificationChannelType;
		label: string;
		description: string;
		configured: boolean;
	}[];
}

export function fetchSettings(): Promise<SettingsView> {
	return request('/api/settings');
}

export function updateSettings(patch: {
	to?: string;
	from?: string;
	multiTo?: boolean;
	enabledChannels?: NotificationChannelType[];
}): Promise<SettingsView> {
	return request('/api/settings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(patch)
	});
}

export function sendTestNotification(): Promise<{ ok: boolean; message: string }> {
	return request('/api/settings/test', { method: 'POST' });
}

export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
