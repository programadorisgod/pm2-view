import type { LogEvent, MetricsEvent, ProcessStatusEvent, DeployLogEvent } from './types';

type EventCallback<T> = (data: T) => void;

export interface SSEClient {
	onLog: (cb: EventCallback<LogEvent>) => void;
	onMetrics: (cb: EventCallback<MetricsEvent>) => void;
	onStatus: (cb: EventCallback<ProcessStatusEvent>) => void;
	onDeployLog: (cb: EventCallback<DeployLogEvent>) => void;
	close: () => void;
}

export function createSSEClient(url: string): SSEClient {
	const es = new EventSource(url);
	const listeners: Array<{ type: string; listener: (e: MessageEvent) => void }> = [];

	const addListener = (type: string, listener: (e: MessageEvent) => void) => {
		es.addEventListener(type, listener as EventListener);
		listeners.push({ type, listener });
	};

	const parseEvent = <T>(e: MessageEvent): T | null => {
		try {
			const parsed = JSON.parse(e.data);
			return parsed.data as T;
		} catch {
			return null;
		}
	};

	return {
		onLog: (cb: EventCallback<LogEvent>) => {
			addListener('log', (e) => {
				const data = parseEvent<LogEvent>(e);
				if (data) cb(data);
			});
		},
		onMetrics: (cb: EventCallback<MetricsEvent>) => {
			addListener('metrics', (e) => {
				const data = parseEvent<MetricsEvent>(e);
				if (data) cb(data);
			});
		},
		onStatus: (cb: EventCallback<ProcessStatusEvent>) => {
			addListener('process-status', (e) => {
				const data = parseEvent<ProcessStatusEvent>(e);
				if (data) cb(data);
			});
		},
		onDeployLog: (cb: EventCallback<DeployLogEvent>) => {
			addListener('deploy-log', (e) => {
				const data = parseEvent<DeployLogEvent>(e);
				if (data) cb(data);
			});
		},
		close: () => {
			for (const { type, listener } of listeners) {
				es.removeEventListener(type, listener as EventListener);
			}
			listeners.length = 0;
			es.close();
		},
	};
}
