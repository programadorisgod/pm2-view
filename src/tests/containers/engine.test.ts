import { describe, expect, it, vi } from 'vitest';
import { EngineService } from '$lib/server/containers/engine/engine';
import type { EngineConnection } from '$lib/server/containers/engine/connection';

function container(id: string) {
	return {
		Id: id,
		Names: [`/c-${id}`],
		Image: 'repo/app:latest',
		ImageID: `sha256:${id}`,
		State: 'running',
		Status: 'Up',
		Created: 100,
		Ports: []
	};
}

function fakeClient(containerIds: string[], overrides: { startFails?: boolean } = {}) {
	return {
		ping: vi.fn(async () => {}),
		listContainers: vi.fn(async () => containerIds.map(container)),
		listImages: vi.fn(async () => []),
		listVolumes: vi.fn(async () => ({ Volumes: [] })),
		listNetworks: vi.fn(async () => []),
		getContainer: vi.fn((id: string) => ({
			start: vi.fn(async () => {
				if (overrides.startFails || !containerIds.includes(id))
					throw new Error(`no such container ${id}`);
			})
		}))
	};
}

function fakeConnection(engines: ReturnType<typeof fakeClient>[]): EngineConnection {
	const connected = engines.map((client, idx) => ({
		client,
		type: idx === 0 ? 'docker' : ('podman' as const),
		socketPath: idx === 0 ? '/var/run/docker.sock' : '/run/user/1000/podman/podman.sock',
		version: '1',
		apiVersion: '1'
	}));
	return {
		connect: vi.fn(async () => connected),
		clear: vi.fn()
	} as unknown as EngineConnection;
}

describe('EngineService multi-engine', () => {
	it('mezcla los contenedores de todos los motores etiquetando cada uno', async () => {
		const docker = fakeClient(['aaa']);
		const podman = fakeClient(['bbb']);
		const svc = new EngineService(fakeConnection([docker, podman]));

		const list = await svc.listContainers();

		expect(list).toHaveLength(2);
		expect(list.find((c) => c.id === 'aaa')?.engine).toBe('docker');
		expect(list.find((c) => c.id === 'bbb')?.engine).toBe('podman');
		expect(docker.listContainers).toHaveBeenCalledOnce();
		expect(podman.listContainers).toHaveBeenCalledOnce();
	});

	it('getStatus reporta un estado por motor', async () => {
		const svc = new EngineService(fakeConnection([fakeClient([]), fakeClient([])]));
		const statuses = await svc.getStatus();
		expect(statuses.map((s) => s.engine)).toEqual(['docker', 'podman']);
		expect(statuses.every((s) => s.running)).toBe(true);
	});

	it('startContainer prueba cada motor y usa el que posee el contenedor', async () => {
		const docker = fakeClient([]);
		const podman = fakeClient(['bbb']);
		const svc = new EngineService(fakeConnection([docker, podman]));

		await svc.startContainer('bbb');

		expect(docker.getContainer).toHaveBeenCalledWith('bbb');
		expect(podman.getContainer).toHaveBeenCalledWith('bbb');
	});

	it('rechaza la acción si ningún motor reconoce el contenedor', async () => {
		const docker = fakeClient([]);
		const podman = fakeClient([]);
		const svc = new EngineService(fakeConnection([docker, podman]));

		await expect(svc.startContainer('nope')).rejects.toThrow('no such container nope');
	});
});
