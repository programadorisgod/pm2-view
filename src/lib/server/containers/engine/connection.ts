import Docker from 'dockerode';
import * as http from 'node:http';
import * as fs from 'node:fs';
import path from 'node:path';
import type { EngineType } from '../../types';

export interface PingHeaders {
	server: string;
	apiVersion: string;
}

export interface ConnectedEngine {
	client: Docker;
	type: EngineType;
	socketPath: string | null;
	version: string;
	apiVersion: string;
}

function getUid(): number {
	try {
		return typeof process.getuid === 'function' ? process.getuid() : 1000;
	} catch {
		return 1000;
	}
}

import { getEnv } from '../env';

function candidateSocketPaths(): string[] {
	const runtime = getEnv('XDG_RUNTIME_DIR') || `/run/user/${getUid()}`;
	const home = getEnv('HOME') || getEnv('HOMEPATH');
	const candidates = [
		getEnv('CONTAINERS_SOCKET'),
		getEnv('DOCKER_SOCKET'),
		getEnv('PODMAN_SOCKET'),
		'/var/run/docker.sock',
		'/run/podman/podman.sock',
		path.join(runtime, 'podman', 'podman.sock'),
		path.join(runtime, 'docker.sock'),
		...(home
			? [path.join(home, '.local', 'share', 'containers', 'podman', 'machine', 'podman.sock')]
			: [])
	];
	return [...new Set(candidates.filter((c): c is string => Boolean(c)))];
}

export function envTransport(): {
	socketPath?: string;
	host?: string;
	port?: number;
	protocol?: string;
} | null {
	const dockerHost = getEnv('DOCKER_HOST');
	if (dockerHost?.startsWith('tcp://')) {
		const url = new URL(dockerHost);
		return {
			host: url.hostname,
			port: Number(url.port || 2375),
			protocol: url.protocol.replace(':', '') || 'http'
		};
	}
	if (dockerHost?.startsWith('unix://')) {
		return { socketPath: dockerHost.replace('unix://', '') };
	}
	return null;
}

function readPingHeaders(socketPath: string): Promise<PingHeaders> {
	return new Promise((resolve, reject) => {
		const req = http.request({ socketPath, path: '/_ping', method: 'GET' }, (res) => {
			res.resume();
			resolve({
				server: String(res.headers['server'] || ''),
				apiVersion: String(res.headers['api-version'] || '')
			});
		});
		req.setTimeout(3000, () => req.destroy(new Error('ping timeout') as Error));
		req.on('error', reject);
		req.end();
	});
}

export function detectEngineType(serverHeader: string): EngineType {
	return /libpod|podman/i.test(serverHeader) ? 'podman' : 'docker';
}

export function isConnectionError(err: unknown): boolean {
	const message = (err as Error).message || String(err);
	return /(socket|ECONNREFUSED|ECONNRESET|ENOENT|EPIPE|EHOSTUNREACH|bad gateway|502|404)/i.test(
		message
	);
}

async function resolveEngines(): Promise<ConnectedEngine[]> {
	const engines: ConnectedEngine[] = [];
	const errors: string[] = [];
	const seen = new Set<string>();

	const tcp = envTransport();
	if (tcp) {
		const key = `tcp:${tcp.host}:${tcp.port}`;
		try {
			const client = new Docker(tcp as never);
			await client.ping();
			const version = await client.version();
			seen.add(key);
			engines.push({
				client,
				type: detectEngineType(version.Platform?.Name ?? ''),
				socketPath: null,
				version: version.Version,
				apiVersion: version.ApiVersion
			});
		} catch (err) {
			errors.push(`DOCKER_HOST: ${(err as Error).message}`);
		}
	}

	for (const socketPath of candidateSocketPaths()) {
		if (!fs.existsSync(socketPath) || seen.has(socketPath)) continue;
		try {
			const headers = await readPingHeaders(socketPath);
			const client = new Docker({ socketPath });
			await client.ping();
			const version = await client.version();
			seen.add(socketPath);
			engines.push({
				client,
				type: detectEngineType(headers.server),
				socketPath,
				version: version.Version,
				apiVersion: version.ApiVersion
			});
		} catch (err) {
			errors.push(`${socketPath}: ${(err as Error).message}`);
		}
	}

	if (engines.length === 0) {
		throw new Error(
			`No container engine reachable. Tried: ${errors.length ? errors.join('; ') : 'no candidate sockets found'}. ` +
				'Start Podman/Docker, or set CONTAINERS_SOCKET / DOCKER_HOST.'
		);
	}
	return engines;
}

export class EngineConnection {
	private connected: ConnectedEngine[] | null = null;

	async connect(): Promise<ConnectedEngine[]> {
		if (this.connected) return this.connected;
		const engines = await resolveEngines();
		this.connected = engines;
		return engines;
	}

	clear(): void {
		this.connected = null;
	}
}
