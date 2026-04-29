export type SSEEventType = 'log' | 'metrics' | 'process-status' | 'ping';

export interface SSEEvent<T = unknown> {
	type: SSEEventType;
	data: T;
	timestamp: string;
}

export interface LogEvent {
	processId: string;
	processName: string;
	line: string;
	logType: 'out' | 'err';
}

export interface MetricsEvent {
	processId: string;
	processName: string;
	cpu: number;
	memoryMB: number;
	status: 'online' | 'stopped' | 'error' | 'offline';
}

export interface ProcessStatusEvent {
	processId: string;
	processName: string;
	status: 'online' | 'stopped' | 'error' | 'offline';
	previousStatus?: string;
}
