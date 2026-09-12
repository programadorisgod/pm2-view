import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WatcherService } from '$lib/server/containers/watcher';
import { buildProviderConfig } from '$lib/server/containers/notifications/config';
import type { EngineService } from '$lib/server/containers/engine/engine';
import type { SettingsService } from '$lib/server/containers/settings';
import type { ContainerSummary } from '$lib/containers/types';

const originalDataDir = process.env.CONTAINERS_VIEW_DATA;
let tmp: string;

beforeEach(() => {
	tmp = mkdtempSync(path.join(tmpdir(), 'cv-watcher-'));
	process.env.CONTAINERS_VIEW_DATA = tmp;
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
	if (originalDataDir) process.env.CONTAINERS_VIEW_DATA = originalDataDir;
	else delete process.env.CONTAINERS_VIEW_DATA;
});

function container(partial: Partial<ContainerSummary>): ContainerSummary {
	return {
		id: 'c1',
		engine: 'docker',
		name: 'app',
		names: ['app'],
		image: 'repo/app:latest',
		imageId: 'sha256:abc',
		state: 'exited',
		running: false,
		status: 'Exited (0)',
		created: 0,
		ports: [],
		highlighted: false,
		...partial
	};
}

async function build(containers: ContainerSummary[]) {
	const engine = {
		listContainers: vi.fn(async () => containers)
	} as unknown as EngineService;
	const settings = {
		get: () => ({ to: '', from: '', multiTo: false, enabledChannels: ['console'] }),
		providerConfig: () =>
			buildProviderConfig({ to: '', from: '', multiTo: false, enabledChannels: ['console'] })
	} as unknown as SettingsService;
	const watcher = new WatcherService(engine, settings);
	return { watcher, engine };
}

describe('WatcherService', () => {
	it('destaca un contenedor registrando su estado actual de ejecución', async () => {
		const running = container({ id: 'c1', name: 'app', running: true, state: 'running' });
		const { watcher } = await build([running]);

		await watcher.setHighlighted('c1', 'app', true);

		expect(watcher.state.targets).toEqual([
			expect.objectContaining({ id: 'c1', name: 'app', lastKnownRunning: true })
		]);
	});

	it('detecta la caída de un contenedor destacado y emite una alerta', async () => {
		const running = container({ id: 'c1', name: 'app', running: true, state: 'running' });
		const { watcher, engine } = await build([running]);
		await watcher.setHighlighted('c1', 'app', true);

		engine.listContainers = vi.fn(async () => [
			container({ id: 'c1', name: 'app', running: false })
		]) as unknown as EngineService['listContainers'];

		const result = await watcher.pollOnce();

		expect(result.down.map((t) => t.id)).toEqual(['c1']);
		expect(result.notified).toBe(true);
		expect(watcher.state.alertCount).toBe(1);
		expect(watcher.state.targets[0].lastKnownRunning).toBe(false);
		expect(watcher.state.targets[0].alertedAt).not.toBeNull();
	});

	it('no alarma si el contenedor destacado sigue en ejecución', async () => {
		const running = container({ id: 'c1', name: 'app', running: true, state: 'running' });
		const { watcher } = await build([running]);
		await watcher.setHighlighted('c1', 'app', true);

		const result = await watcher.pollOnce();

		expect(result.down).toHaveLength(0);
		expect(result.notified).toBe(false);
		expect(watcher.state.alertCount).toBe(0);
	});

	it('al quitar el destaque el contenedor deja de ser vigilado', async () => {
		const running = container({ id: 'c1', name: 'app', running: true, state: 'running' });
		const { watcher } = await build([running]);
		await watcher.setHighlighted('c1', 'app', true);
		await watcher.setHighlighted('c1', 'app', false);

		expect(watcher.state.targets).toHaveLength(0);
	});

	it('actualiza el intervalo solo si es válido', async () => {
		const { watcher } = await build([]);

		watcher.update({ intervalMs: 2000 });
		expect(watcher.state.intervalMs).toBe(30000);

		watcher.update({ intervalMs: 60_000 });
		expect(watcher.state.intervalMs).toBe(60_000);
	});
});
