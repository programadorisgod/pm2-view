import type { SSEEventType, SSEEvent } from './types';
import { logger } from '$lib/logger';

export interface SSEWriter {
	write(chunk: Uint8Array): Promise<void>;
	releaseLock(): void;
}

interface SSEConnection {
	id: string;
	writable: SSEWriter;
}

class SSEManager {
	private connections = new Map<string, SSEConnection>();
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

	startHeartbeat(intervalMs: number = 15000): void {
		if (this.heartbeatInterval) return;
		this.heartbeatInterval = setInterval(() => {
			this.broadcast(':ping\n\n', 'ping');
		}, intervalMs);
	}

	stopHeartbeat(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
	}

	addConnection(id: string, writable: SSEWriter): void {
		this.connections.set(id, { id, writable });
		logger.info('SSE connection added', { connectionId: id, total: this.connections.size });
	}

	removeConnection(id: string): void {
		const conn = this.connections.get(id);
		if (conn) {
			this.connections.delete(id);
			logger.info('SSE connection removed', { connectionId: id, total: this.connections.size });
			try {
				conn.writable.releaseLock();
			} catch {
				// Ignore errors when releasing lock
			}
		}
	}

	emit(type: SSEEventType, data: unknown): void {
		const event: SSEEvent = {
			type,
			data,
			timestamp: new Date().toISOString()
		};
		const message = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
		this.broadcast(message, type);
	}

	private broadcast(message: string, _type: SSEEventType): void {
		if (this.connections.size === 0) return;

		const encoder = new TextEncoder();
		const chunk = encoder.encode(message);

		for (const [id, conn] of this.connections) {
			conn.writable.write(chunk).catch(() => {
				logger.warn('Failed to write SSE, removing connection', { connectionId: id });
				this.removeConnection(id);
			});
		}
	}

	getConnectionCount(): number {
		return this.connections.size;
	}

	_clearAllConnections(): void {
		this.connections.clear();
	}
}

export const sseManager = new SSEManager();
