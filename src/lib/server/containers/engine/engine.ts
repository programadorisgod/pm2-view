import type Docker from 'dockerode';
import { EngineConnection, isConnectionError } from './connection';
import type { ConnectedEngine } from './connection';
import type {
	ContainerAction,
	ContainerSummary,
	EngineStatus,
	ImageSummary,
	NetworkSummary,
	VolumeSummary
} from '../../types';

export type { ContainerAction };

function normalizeContainer(c: Docker.ContainerInfo): Omit<ContainerSummary, 'engine'> {
	const names = (c.Names ?? []).map((n) => n.replace(/^\//, ''));
	return {
		id: c.Id,
		name: names[0] ?? c.Id.slice(0, 12),
		names,
		image: c.Image ?? '',
		imageId: c.ImageID ?? '',
		state: (c.State as ContainerSummary['state']) ?? 'unknown',
		running: c.State === 'running',
		status: c.Status ?? '',
		created: (c.Created ?? 0) * 1000,
		ports: (c.Ports ?? []).map((p) => ({
			hostIp: p.IP ?? '',
			hostPort: p.PublicPort != null ? String(p.PublicPort) : '',
			containerPort: p.PrivatePort != null ? String(p.PrivatePort) : '',
			type: p.Type ?? ''
		})),
		highlighted: false
	};
}

function normalizeImage(i: Docker.ImageInfo): Omit<ImageSummary, 'engine'> {
	const tags = i.RepoTags?.filter(Boolean) ?? [];
	return {
		id: i.Id,
		repoTags: tags,
		repoDigests: i.RepoDigests ?? [],
		created: (i.Created ?? 0) * 1000,
		size: i.Size ?? 0,
		sharedSize: i.SharedSize ?? 0,
		containers: i.Containers ?? 0,
		labels: i.Labels ?? {},
		reference: tags[0] ?? i.RepoDigests?.[0]?.split('@')[0] ?? i.Id.slice(7, 19)
	};
}

function normalizeVolume(v: {
	Name?: string;
	Driver?: string;
	Mountpoint?: string;
	CreatedAt?: string;
	Scope?: string;
	Labels?: Record<string, string>;
}): Omit<VolumeSummary, 'engine'> {
	return {
		name: v.Name ?? '',
		driver: v.Driver ?? '',
		mountpoint: v.Mountpoint ?? '',
		createdAt: v.CreatedAt ?? '',
		scope: v.Scope ?? 'local',
		labels: v.Labels ?? {},
		used: false
	};
}

function normalizeNetwork(n: Docker.NetworkInspectInfo): Omit<NetworkSummary, 'engine'> {
	const subnet = n.IPAM?.Config?.[0]?.Subnet ?? undefined;
	const createdMs =
		typeof n.Created === 'number' ? n.Created * 1000 : new Date(n.Created ?? 0).getTime();
	return {
		id: n.Id ?? '',
		name: n.Name ?? '',
		driver: n.Driver ?? '',
		scope: n.Scope ?? 'local',
		internal: Boolean(n.Internal),
		attachable: Boolean(n.Attachable),
		created: Number.isNaN(createdMs) ? 0 : createdMs,
		containers: Object.keys(n.Containers ?? {}).length,
		subnet
	};
}

export class EngineService {
	private readonly connection = new EngineConnection();

	constructor(connection?: EngineConnection) {
		if (connection) this.connection = connection;
	}

	private async engines(): Promise<ConnectedEngine[]> {
		try {
			return await this.connection.connect();
		} catch (err) {
			if (isConnectionError(err)) {
				this.connection.clear();
				return await this.connection.connect();
			}
			throw err;
		}
	}

	async getStatus(): Promise<EngineStatus[]> {
		try {
			const engines = await this.engines();
			return await Promise.all(
				engines.map(async (engine): Promise<EngineStatus> => {
					try {
						await engine.client.ping();
						return {
							running: true,
							engine: engine.type,
							version: engine.version,
							apiVersion: engine.apiVersion,
							socketPath: engine.socketPath,
							error: null,
							checkedAt: Date.now()
						};
					} catch (err) {
						return {
							running: false,
							engine: engine.type,
							version: null,
							apiVersion: null,
							socketPath: engine.socketPath,
							error: (err as Error).message,
							checkedAt: Date.now()
						};
					}
				})
			);
		} catch (err) {
			this.connection.clear();
			return [
				{
					running: false,
					engine: null,
					version: null,
					apiVersion: null,
					socketPath: null,
					error: (err as Error).message,
					checkedAt: Date.now()
				}
			];
		}
	}

	private async withAnyEngine<T>(fn: (client: Docker) => Promise<T>): Promise<T> {
		const engines = await this.engines();
		let lastError: unknown;
		for (const engine of engines) {
			try {
				return await fn(engine.client);
			} catch (err) {
				lastError = err;
			}
		}
		throw lastError;
	}

	async listContainers(): Promise<ContainerSummary[]> {
		const out: ContainerSummary[] = [];
		const seen = new Set<string>();
		for (const engine of await this.engines()) {
			const list = await engine.client.listContainers({ all: true });
			for (const c of list) {
				if (!seen.has(c.Id)) {
					seen.add(c.Id);
					out.push({ ...normalizeContainer(c), engine: engine.type });
				}
			}
		}
		return out;
	}

	async listImages(): Promise<ImageSummary[]> {
		const out: ImageSummary[] = [];
		const seen = new Set<string>();
		for (const engine of await this.engines()) {
			const list = await engine.client.listImages({ all: false });
			for (const i of list) {
				if (!seen.has(i.Id)) {
					seen.add(i.Id);
					out.push({ ...normalizeImage(i), engine: engine.type });
				}
			}
		}
		return out;
	}

	async listVolumes(): Promise<VolumeSummary[]> {
		const out: VolumeSummary[] = [];
		const seen = new Set<string>();
		for (const engine of await this.engines()) {
			const data = await engine.client.listVolumes();
			const used = new Set<string>();
			const containers = await engine.client.listContainers({ all: true });
			for (const c of containers) {
				for (const m of c.Mounts ?? []) if (m.Name) used.add(m.Name);
			}
			for (const v of data.Volumes ?? []) {
				if (!seen.has(v.Name ?? '')) {
					seen.add(v.Name ?? '');
					out.push({ ...normalizeVolume(v), engine: engine.type, used: used.has(v.Name ?? '') });
				}
			}
		}
		return out;
	}

	async listNetworks(): Promise<NetworkSummary[]> {
		const out: NetworkSummary[] = [];
		const seen = new Set<string>();
		for (const engine of await this.engines()) {
			const list = await engine.client.listNetworks();
			for (const n of list) {
				if (!seen.has(n.Id)) {
					seen.add(n.Id);
					out.push({ ...normalizeNetwork(n), engine: engine.type });
				}
			}
		}
		return out;
	}

	async startContainer(id: string): Promise<void> {
		return this.withAnyEngine(async (client) => {
			await client.getContainer(id).start();
		});
	}

	async stopContainer(id: string): Promise<void> {
		return this.withAnyEngine(async (client) => {
			await client.getContainer(id).stop({ t: 10 });
		});
	}

	async restartContainer(id: string): Promise<void> {
		return this.withAnyEngine(async (client) => {
			await client.getContainer(id).restart({ t: 10 });
		});
	}

	async removeContainer(id: string): Promise<void> {
		return this.withAnyEngine(async (client) => {
			await client.getContainer(id).remove({ force: true, v: true });
		});
	}

	async removeImage(id: string): Promise<void> {
		return this.withAnyEngine(async (client) => {
			await client.getImage(id).remove({ force: true });
		});
	}

	async removeVolume(name: string): Promise<void> {
		return this.withAnyEngine(async (client) => {
			await client.getVolume(name).remove();
		});
	}

	async removeNetwork(id: string): Promise<void> {
		return this.withAnyEngine(async (client) => {
			await client.getNetwork(id).remove();
		});
	}
}

export const engine = new EngineService();
