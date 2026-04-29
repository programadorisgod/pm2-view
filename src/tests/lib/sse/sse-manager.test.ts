import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sseManager } from '$lib/sse/sse-manager';
import type { SSEEventType } from '$lib/sse/types';

describe('SSE Manager', () => {
	beforeEach(() => {
		sseManager.stopHeartbeat();
		sseManager._clearAllConnections();
	});

	afterEach(() => {
		sseManager.stopHeartbeat();
	});

	describe('Connection Management', () => {
		it('should start with zero connections', () => {
			expect(sseManager.getConnectionCount()).toBe(0);
		});

		it('should add a connection and increment count', () => {
			const mockWriter = createMockWriter();
			sseManager.addConnection('conn-1', mockWriter);
			expect(sseManager.getConnectionCount()).toBe(1);
		});

		it('should remove a connection and decrement count', () => {
			const mockWriter = createMockWriter();
			sseManager.addConnection('conn-1', mockWriter);
			expect(sseManager.getConnectionCount()).toBe(1);

			sseManager.removeConnection('conn-1');
			expect(sseManager.getConnectionCount()).toBe(0);
		});

		it('should handle removing non-existent connection gracefully', () => {
			sseManager.removeConnection('non-existent');
			expect(sseManager.getConnectionCount()).toBe(0);
		});

		it('should track multiple connections', () => {
			const mockWriter1 = createMockWriter();
			const mockWriter2 = createMockWriter();
			const mockWriter3 = createMockWriter();

			sseManager.addConnection('conn-1', mockWriter1);
			sseManager.addConnection('conn-2', mockWriter2);
			sseManager.addConnection('conn-3', mockWriter3);

			expect(sseManager.getConnectionCount()).toBe(3);
		});
	});

	describe('Event Emission', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should emit event to connected clients', async () => {
			const mockWriter = createMockWriter();
			const writeSpy = vi.spyOn(mockWriter, 'write');

			sseManager.addConnection('conn-1', mockWriter);
			sseManager.emit('log', { processId: '123', line: 'test' });

			await vi.advanceTimersByTimeAsync(10);

			expect(writeSpy).toHaveBeenCalled();
			const writtenData = writeSpy.mock.calls[0][0];
			const decoded = new TextDecoder().decode(writtenData);
			expect(decoded).toContain('event: log');
			expect(decoded).toContain('"processId":"123"');
		});

		it('should not emit when no connections exist', () => {
			expect(() => {
				sseManager.emit('log', { processId: '123', line: 'test' });
			}).not.toThrow();
		});

		it('should emit different event types correctly', async () => {
			const mockWriter = createMockWriter();
			const writeSpy = vi.spyOn(mockWriter, 'write');

			sseManager.addConnection('conn-1', mockWriter);

			const eventTypes: SSEEventType[] = ['log', 'metrics', 'process-status', 'ping'];
			for (const type of eventTypes) {
				writeSpy.mockClear();
				sseManager.emit(type, { data: 'test' });
				await vi.advanceTimersByTimeAsync(10);
				const decoded = new TextDecoder().decode(writeSpy.mock.calls[0][0]);
				expect(decoded).toContain(`event: ${type}`);
			}
		});

		it('should include timestamp in emitted events', async () => {
			const mockWriter = createMockWriter();
			const writeSpy = vi.spyOn(mockWriter, 'write');

			sseManager.addConnection('conn-1', mockWriter);
			sseManager.emit('log', { processId: '123' });

			await vi.advanceTimersByTimeAsync(10);

			const writtenData = writeSpy.mock.calls[0][0];
			const decoded = new TextDecoder().decode(writtenData);
			const parsed = JSON.parse(decoded.match(/data: ({.*})/)?.[1] || '{}');
			expect(parsed.timestamp).toBeDefined();
			expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
		});
	});

	describe('Heartbeat', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should start heartbeat interval', () => {
			const intervalSpy = vi.spyOn(global, 'setInterval');
			sseManager.startHeartbeat(15000);
			expect(intervalSpy).toHaveBeenCalled();
			sseManager.stopHeartbeat();
		});

		it('should not start multiple heartbeats', () => {
			sseManager.startHeartbeat(15000);
			const intervalSpy = vi.spyOn(global, 'setInterval');
			sseManager.startHeartbeat(15000); // Second call should be ignored
			expect(intervalSpy).not.toHaveBeenCalled();
			sseManager.stopHeartbeat();
		});

		it('should stop heartbeat interval', () => {
			sseManager.startHeartbeat(15000);
			const clearSpy = vi.spyOn(global, 'clearInterval');
			sseManager.stopHeartbeat();
			expect(clearSpy).toHaveBeenCalled();
		});

		it('should broadcast ping during heartbeat', async () => {
			const mockWriter = createMockWriter();
			const writeSpy = vi.spyOn(mockWriter, 'write');

			sseManager.addConnection('conn-1', mockWriter);
			sseManager.startHeartbeat(100); // Short interval for testing

			// Advance timer to trigger heartbeat
			await vi.advanceTimersByTimeAsync(150);

			sseManager.stopHeartbeat();

			expect(writeSpy).toHaveBeenCalled();
			// Check if any write contained ping
			const calls = writeSpy.mock.calls;
			const hasPing = calls.some((call) => {
				const decoded = new TextDecoder().decode(call[0]);
				return decoded.includes(':ping');
			});
			expect(hasPing).toBe(true);
		});
	});

	describe('Connection Cleanup', () => {
		it('should remove connection when write fails', async () => {
			const mockWriter = createMockWriter();
			// Make write fail
			vi.spyOn(mockWriter, 'write').mockRejectedValueOnce(new Error('Write failed'));

			sseManager.addConnection('conn-1', mockWriter);
			expect(sseManager.getConnectionCount()).toBe(1);

			// Trigger a write that fails
			sseManager.emit('log', { processId: '123' });
			await vi.waitFor(() => {
				expect(sseManager.getConnectionCount()).toBe(0);
			});
		});
	});
});

function createMockWriter(): WritableStreamDefaultWriter<Uint8Array> {
	const stream = new WritableStream<Uint8Array>({
		write() {
			return Promise.resolve();
		}
	});
	return stream.getWriter();
}
