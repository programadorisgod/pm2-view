import { describe, it, expect } from 'vitest';
import { PortScannerService } from '$lib/ports/port-scanner.service';
import type { PortInfo } from '$lib/ports/types';

describe('PortScannerService', () => {
	it('should calculate summary accurately in a single pass', () => {
		const service = new PortScannerService();
		const ports: PortInfo[] = [
			{ port: 80, protocol: 'tcp', address: '0.0.0.0', pid: 123, processName: 'nginx', user: null, state: 'LISTEN' },
			{ port: 443, protocol: 'tcp', address: '0.0.0.0', pid: 123, processName: 'nginx', user: null, state: 'LISTEN' },
			{ port: 53, protocol: 'udp', address: '127.0.0.1', pid: 456, processName: 'systemd-resolved', user: null, state: 'UNCONN' },
		];

		const summary = service.getSummary(ports);
		expect(summary).toEqual({
			total: 3,
			tcpCount: 2,
			udpCount: 1,
			listeningCount: 2,
		});
	});
});
