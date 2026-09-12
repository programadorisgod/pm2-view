import { JsonStore } from './store';
import type { EngineService } from './engine/engine';
import type { SettingsService } from './settings';
import { ProviderFactory } from './notifications/provider-factory';
import type { HighlightTarget, WatchRunResult, WatchState } from '../types';
import type { NotificationMessage } from './notifications/types';

const DEFAULT_STATE: WatchState = {
	enabled: false,
	intervalMs: 30_000,
	lastRunAt: null,
	lastAlertAt: null,
	alertCount: 0,
	targets: []
};

export class WatcherService {
	private readonly store = new JsonStore<WatchState>('watcher.json', DEFAULT_STATE);
	private timer: NodeJS.Timeout | null = null;
	private pollInFlight = false;

	constructor(
		private readonly engine: EngineService,
		private readonly settings: SettingsService
	) {}

	get state(): WatchState {
		return this.store.get();
	}

	ensureRunning(): void {
		if (this.timer) return;
		if (!this.state.enabled) return;
		this.timer = setInterval(() => void this.pollOnce(), this.state.intervalMs);
		this.timer.unref();
		const first = setTimeout(() => void this.pollOnce(), 500);
		first.unref();
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	update(config: { enabled?: boolean; intervalMs?: number }): WatchState {
		const state = this.store.update((draft) => {
			if (config.enabled !== undefined) draft.enabled = config.enabled;
			if (config.intervalMs !== undefined && config.intervalMs >= 5000) {
				draft.intervalMs = config.intervalMs;
			}
		});
		this.stop();
		if (state.enabled) {
			this.ensureRunning();
		}
		return state;
	}

	async setHighlighted(id: string, name: string, highlighted: boolean): Promise<WatchState> {
		if (highlighted) {
			let running = false;
			try {
				const containers = await this.engine.listContainers();
				running = containers.some((c) => c.id === id && c.running);
			} catch {
				running = false;
			}
			return this.store.update((draft) => {
				const existing = draft.targets.find((t) => t.id === id);
				if (!existing) {
					draft.targets.push({
						id,
						name,
						lastKnownRunning: running,
						alertedAt: null,
						addedAt: Date.now()
					});
				} else {
					existing.name = name;
				}
			});
		}
		return this.store.update((draft) => {
			draft.targets = draft.targets.filter((t) => t.id !== id);
		});
	}

	async pollOnce(): Promise<WatchRunResult> {
		if (this.pollInFlight) {
			return {
				ran: false,
				checked: 0,
				down: [],
				notified: false,
				error: 'Ya hay una comprobación en curso.'
			};
		}
		this.pollInFlight = true;
		try {
			const state = this.store.get();
			if (state.targets.length === 0) {
				return { ran: true, checked: 0, down: [], notified: false, error: null };
			}

			const down: HighlightTarget[] = [];
			let error: string | null = null;
			let notified = false;

			try {
				const containers = await this.engine.listContainers();
				const byId = new Map(containers.map((c) => [c.id, c]));
				const updatedTargets = state.targets.map((target) => {
					const container = byId.get(target.id);
					const running = container?.running ?? false;
					if (target.lastKnownRunning && !running) {
						down.push({ ...target, lastKnownRunning: false });
					}
					return { ...target, lastKnownRunning: running };
				});

				if (down.length > 0) {
					const result = await this.notify(down);
					notified = result.ok;
					if (!result.ok) error = result.error ?? 'No se pudo enviar la notificación.';
					if (notified) {
						const alertedAt = Date.now();
						for (const target of updatedTargets) {
							if (down.some((d) => d.id === target.id)) target.alertedAt = alertedAt;
						}
					}
				}

				this.store.update((draft) => {
					draft.targets = updatedTargets;
					draft.lastRunAt = Date.now();
					if (notified) {
						draft.alertCount += 1;
						draft.lastAlertAt = Date.now();
					}
				});
			} catch (err) {
				error = (err as Error).message;
				this.store.update((draft) => {
					draft.lastRunAt = Date.now();
				});
			}

			return { ran: true, checked: state.targets.length, down, notified, error };
		} finally {
			this.pollInFlight = false;
		}
	}

	async sendTest(): Promise<{ ok: boolean; message: string }> {
		const settings = this.settings.get();
		const config = this.settings.providerConfig();
		const providers = ProviderFactory.createConfigured(settings.enabledChannels, config);
		if (providers.length === 0) {
			return { ok: false, message: 'No hay canales de notificación configurados.' };
		}
		const message: NotificationMessage = {
			subject: 'Prueba de notificación',
			text: 'Esta es una notificación de prueba del visor de contenedores.',
			html: '<p>Esta es una <strong>notificación de prueba</strong> del visor de contenedores.</p>',
			to: config.to || undefined
		};
		const errors: string[] = [];
		for (const provider of providers) {
			try {
				await provider.send(message);
			} catch (err) {
				errors.push(`${provider.label}: ${(err as Error).message}`);
			}
		}
		if (errors.length > 0) {
			return { ok: false, message: errors.join('; ') };
		}
		return {
			ok: true,
			message: `Notificación de prueba enviada por ${providers.map((p) => p.label).join(', ')}.`
		};
	}

	private async notify(down: HighlightTarget[]): Promise<{ ok: boolean; error?: string }> {
		const settings = this.settings.get();
		const config = this.settings.providerConfig();
		const providers = ProviderFactory.createConfigured(settings.enabledChannels, config);
		if (providers.length === 0) {
			return { ok: false, error: 'No hay canales de notificación configurados.' };
		}

		const names = down.map((t) => t.name).join(', ');
		const subject = `⚠️ ${down.length} contenedor(es) destacado(s) detenido(s): ${names}`;
		const text = [
			`El vigilante detectó que los siguientes contenedores destacados están detenidos:`,
			``,
			...down.map((t) => `- ${t.name}`),
			``,
			`Puedes revisar el estado en el visor de contenedores.`
		].join('\n');
		const html = [
			`<p>El vigilante detectó que los siguientes contenedores destacados están <strong>detenidos</strong>:</p>`,
			`<ul>${down.map((t) => `<li>${t.name}</li>`).join('')}</ul>`,
			`<p>Revisa el estado en el visor de contenedores.</p>`
		].join('');

		const message: NotificationMessage = { subject, text, html, to: config.to || undefined };
		const errors: string[] = [];
		for (const provider of providers) {
			try {
				await provider.send(message);
			} catch (err) {
				errors.push(`${provider.label}: ${(err as Error).message}`);
			}
		}
		if (errors.length === providers.length) {
			return { ok: false, error: errors.join('; ') };
		}
		return { ok: true };
	}
}
