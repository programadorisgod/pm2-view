import { describe, it, expect } from 'vitest';
import type { SSEEventType, SSEEvent, LogEvent, MetricsEvent, ProcessStatusEvent } from '$lib/sse/types';

describe('SSE Types', () => {
	it('should define SSEEventType correctly', () => {
		// Type-level test: verify the type allows only specific string values
		const eventType: SSEEventType = 'log';
		expect(eventType).toBe('log');
	});

	it('should allow all valid SSEEventTypes', () => {
		const types: SSEEventType[] = ['log', 'metrics', 'process-status', 'ping'];
		expect(types).toHaveLength(4);
		expect(types[0]).toBe('log');
		expect(types[1]).toBe('metrics');
		expect(types[2]).toBe('process-status');
		expect(types[3]).toBe('ping');
	});

	it('should define SSEEvent with generic data', () => {
		const event: SSEEvent<string> = {
			type: 'log',
			data: 'test data',
			timestamp: '2026-04-29T12:00:00.000Z'
		};
		expect(event.type).toBe('log');
		expect(event.data).toBe('test data');
		expect(event.timestamp).toBe('2026-04-29T12:00:00.000Z');
	});

	it('should define LogEvent correctly', () => {
		const logEvent: LogEvent = {
			processId: 'process-123',
			processName: 'app-name',
			line: 'Log line content',
			logType: 'out'
		};
		expect(logEvent.processId).toBe('process-123');
		expect(logEvent.logType).toBe('out');
	});

	it('should define LogEvent with err logType', () => {
		const logEvent: LogEvent = {
			processId: 'process-456',
			processName: 'api-service',
			line: 'Error: something failed',
			logType: 'err'
		};
		expect(logEvent.logType).toBe('err');
	});

	it('should define MetricsEvent correctly', () => {
		const metricsEvent: MetricsEvent = {
			processId: 'process-123',
			processName: 'app-name',
			cpu: 25.5,
			memoryMB: 128.5,
			status: 'online'
		};
		expect(metricsEvent.cpu).toBe(25.5);
		expect(metricsEvent.memoryMB).toBe(128.5);
		expect(metricsEvent.status).toBe('online');
	});

	it('should define ProcessStatusEvent correctly', () => {
		const statusEvent: ProcessStatusEvent = {
			processId: 'process-123',
			processName: 'app-name',
			status: 'online',
			previousStatus: 'stopped'
		};
		expect(statusEvent.status).toBe('online');
		expect(statusEvent.previousStatus).toBe('stopped');
	});

	it('should define ProcessStatusEvent without previousStatus', () => {
		const statusEvent: ProcessStatusEvent = {
			processId: 'process-123',
			processName: 'app-name',
			status: 'error'
		};
		expect(statusEvent.status).toBe('error');
		expect(statusEvent.previousStatus).toBeUndefined();
	});

	it('should allow all valid ProcessStatusEvent statuses', () => {
		const statuses: ProcessStatusEvent['status'][] = ['online', 'stopped', 'error', 'offline'];
		expect(statuses).toHaveLength(4);
	});
});
