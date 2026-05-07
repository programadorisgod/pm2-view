import type { SSEEventType, LogEvent, MetricsEvent, ProcessStatusEvent, DeployLogEvent } from './types';

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
			es.addEventListener('log', (e) => {
				const data = parseEvent<LogEvent>(e);
				if (data) cb(data);
			});
		},
		onMetrics: (cb: EventCallback<MetricsEvent>) => {
			es.addEventListener('metrics', (e) => {
				const data = parseEvent<MetricsEvent>(e);
				if (data) cb(data);
			});
		},
		onStatus: (cb: EventCallback<ProcessStatusEvent>) => {
			es.addEventListener('process-status', (e) => {
				const data = parseEvent<ProcessStatusEvent>(e);
				if (data) cb(data);
			});
		},
		onDeployLog: (cb: EventCallback<DeployLogEvent>) => {
			es.addEventListener('deploy-log', (e) => {
				const data = parseEvent<DeployLogEvent>(e);
				if (data) cb(data);
			});
		},
		close: () => es.close(),
	};
}
