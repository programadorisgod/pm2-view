import { exec } from 'child_process';
import { promisify } from 'util';
import type { PortInfo, PortSummary } from './types';
import { logger } from '$lib/logger';

const execAsync = promisify(exec);

export class PortScannerService {
	async scan(): Promise<PortInfo[]> {
		const [tcp, udp] = await Promise.all([this.scanProto('tcp'), this.scanProto('udp')]);
		return this.deduplicate([...tcp, ...udp]);
	}

	private deduplicate(ports: PortInfo[]): PortInfo[] {
		const seen = new Set<string>();
		return ports.filter((p) => {
			const key = `${p.port}-${p.protocol}-${p.address}-${p.pid}-${p.processName}-${p.state}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	getSummary(ports: PortInfo[]): PortSummary {
		const tcpCount = ports.filter((p) => p.protocol === 'tcp').length;
		const udpCount = ports.filter((p) => p.protocol === 'udp').length;
		const listeningCount = ports.filter((p) => p.state === 'LISTEN').length;
		return { total: ports.length, tcpCount, udpCount, listeningCount };
	}

	private async scanProto(proto: 'tcp' | 'udp'): Promise<PortInfo[]> {
		const flag = proto === 'tcp' ? '-tlnp' : '-ulnp';
		try {
			const { stdout } = await execAsync(`ss ${flag}`, { maxBuffer: 5 * 1024 * 1024 });
			return this.parseSsOutput(stdout, proto);
		} catch (error) {
			logger.warn(`ss ${flag} failed, trying lsof fallback`, { error: String(error) });
			return this.scanWithLsof(proto);
		}
	}

	private parseSsOutput(stdout: string, protocol: 'tcp' | 'udp'): PortInfo[] {
		const lines = stdout.split('\n').slice(1).filter((l) => l.trim());
		const ports: PortInfo[] = [];

		for (const line of lines) {
			const port = this.parseSsLine(line, protocol);
			if (port) ports.push(port);
		}

		return ports;
	}

	private parseSsLine(line: string, protocol: 'tcp' | 'udp'): PortInfo | null {
		const parts = line.split(/\s+/);
		if (parts.length < 5) return null;

		const state = parts[0];
		const localAddr = parts[3];
		const portMatch = localAddr.match(/:(\d+)$/);
		if (!portMatch) return null;

		const port = parseInt(portMatch[1], 10);
		if (isNaN(port)) return null;

		const address = localAddr.replace(/:\d+$/, '').replace(/^\*:/, '0.0.0.0:');
		const procInfo = this.extractProcessFromSs(line);

		return {
			port,
			protocol,
			address,
			pid: procInfo.pid,
			processName: procInfo.processName,
			user: null,
			state
		};
	}

	private extractProcessFromSs(line: string): { pid: number | null; processName: string | null } {
		const procMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
		if (!procMatch) return { pid: null, processName: null };
		return {
			processName: procMatch[1],
			pid: parseInt(procMatch[2], 10) || null
		};
	}

	private async scanWithLsof(proto: 'tcp' | 'udp'): Promise<PortInfo[]> {
		try {
			const flag = proto === 'tcp' ? '-iTCP' : '-iUDP';
			const { stdout } = await execAsync(
				`lsof ${flag} -sTCP:LISTEN -P -n 2>/dev/null || true`,
				{ maxBuffer: 5 * 1024 * 1024 }
			);
			return this.parseLsofOutput(stdout, proto);
		} catch (error) {
			logger.warn(`lsof fallback for ${proto} failed`, { error: String(error) });
			return [];
		}
	}

	private parseLsofOutput(stdout: string, protocol: 'tcp' | 'udp'): PortInfo[] {
		const lines = stdout.split('\n').slice(1).filter((l) => l.trim());
		const ports: PortInfo[] = [];

		for (const line of lines) {
			const parts = line.split(/\s+/);
			if (parts.length < 9) continue;

			const processName = parts[0];
			const pid = parseInt(parts[1], 10) || null;
			const user = parts[2] || null;
			const fd = parts[3];

			// lsof NAME column (index 8+) contains things like "TCP *:3000 (LISTEN)"
			const namePart = parts.slice(8).join(' ');
			const portMatch = namePart.match(/:(\d+)/);
			if (!portMatch) continue;

			const port = parseInt(portMatch[1], 10);
			if (isNaN(port)) continue;

			const address = parts[7]?.replace(/:\d+$/, '') || '*';

			ports.push({
				port,
				protocol,
				address,
				pid,
				processName,
				user,
				state: namePart.includes('LISTEN') ? 'LISTEN' : 'ESTABLISHED'
			});
		}

		return ports;
	}
}
