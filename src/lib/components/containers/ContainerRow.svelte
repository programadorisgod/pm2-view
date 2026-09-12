<script lang="ts">
	import type { ContainerAction, ContainerSummary } from '$lib/types';
	import { runAction, setHighlight, errorMessage } from '$lib/containers/client/api';
	import { pushToast } from '$lib/containers/client/toasts.svelte';
	import { confirmAction } from '$lib/containers/client/dialog.svelte';
	import { Star, Play, Square, RotateCcw, Trash2, Loader2 } from '@lucide/svelte';
	import EngineBadge from './EngineBadge.svelte';

	interface Props {
		container: ContainerSummary;
		onRefresh?: () => void | Promise<void>;
	}

	let { container, onRefresh = () => {} }: Props = $props();

	let pending = $state<ContainerAction | null>(null);

	const actionLabels: Record<ContainerAction, { label: string; title: string }> = {
		start: { label: 'Iniciar', title: 'Iniciar contenedor' },
		stop: { label: 'Detener', title: 'Detener contenedor' },
		restart: { label: 'Reiniciar', title: 'Reiniciar contenedor' },
		remove: { label: 'Eliminar', title: 'Eliminar contenedor' }
	};

	function canStart(): boolean {
		return !container.running && container.state !== 'unknown';
	}

	async function run(action: ContainerAction) {
		if (pending) return;
		if (action === 'remove') {
			const ok = await confirmAction({
				title: `¿Eliminar "${container.name}"?`,
				message: `Se eliminará el contenedor "${container.name}" (${container.id.slice(0, 12)}). Esta acción no se puede deshacer.`,
				confirmLabel: 'Eliminar',
				danger: true
			});
			if (!ok) return;
		}
		pending = action;
		try {
			const result = await runAction('containers', container.id, action, { name: container.name });
			pushToast({ type: 'success', title: actionLabels[action].title, message: result.message });
			await onRefresh();
		} catch (err) {
			pushToast({ type: 'error', title: actionLabels[action].title, message: errorMessage(err) });
		} finally {
			pending = null;
		}
	}

	async function toggleHighlight() {
		try {
			const result = await setHighlight(container.id, container.name, !container.highlighted);
			pushToast({
				type: 'success',
				title: 'Destaque',
				message: result.message
			});
			await onRefresh();
		} catch (err) {
			pushToast({ type: 'error', title: 'Destaque', message: errorMessage(err) });
		}
	}
</script>

<div
	class:highlighted={container.highlighted}
	class="row"
	data-state={container.state}
	data-testid="container-row"
>
	<button
		class="star"
		class:active={container.highlighted}
		onclick={toggleHighlight}
		aria-pressed={container.highlighted}
		aria-label={container.highlighted ? 'Quitar de destacados' : 'Destacar contenedor'}
		title={container.highlighted ? 'Quitar del vigilante' : 'Destacar (vigilar)'}
	>
		<Star size={16} fill={container.highlighted ? 'currentColor' : 'none'} />
	</button>

	<div class="info">
		<p class="name">{container.name}</p>
		<p class="meta mono">
			<EngineBadge engine={container.engine} />
			<span class="pad"></span>
			{container.image || container.imageId.slice(7, 19)}
			<span class="dot">·</span>
			{container.id.slice(0, 12)}
			{#if container.ports.length}
				<span class="dot">·</span>
				{container.ports
					.map((p) => `${p.hostPort ? `${p.hostPort}→` : ''}${p.containerPort}/${p.type}`)
					.join(', ')}
			{/if}
		</p>
	</div>

	<span class="status {container.state}" data-testid="container-status">
		<span class="led"></span>
		{container.state}
	</span>

	<div class="actions">
		<button
			class="action"
			disabled={!canStart() || pending !== null}
			onclick={() => run('start')}
			title={actionLabels.start.title}
			aria-label={actionLabels.start.title}
		>
			{#if pending === 'start'}<span class="spin"><Loader2 size={14} /></span>{:else}<Play
					size={14}
				/>{/if}
		</button>
		<button
			class="action"
			disabled={!container.running || pending !== null}
			onclick={() => run('stop')}
			title={actionLabels.stop.title}
			aria-label={actionLabels.stop.title}
		>
			{#if pending === 'stop'}<span class="spin"><Loader2 size={14} /></span>{:else}<Square
					size={14}
				/>{/if}
		</button>
		<button
			class="action"
			disabled={!container.running || pending !== null}
			onclick={() => run('restart')}
			title={actionLabels.restart.title}
			aria-label={actionLabels.restart.title}
		>
			{#if pending === 'restart'}<span class="spin"><Loader2 size={14} /></span>{:else}<RotateCcw
					size={14}
				/>{/if}
		</button>
		<button
			class="action danger"
			disabled={pending !== null}
			onclick={() => run('remove')}
			title={actionLabels.remove.title}
			aria-label={actionLabels.remove.title}
		>
			{#if pending === 'remove'}<span class="spin"><Loader2 size={14} /></span>{:else}<Trash2
					size={14}
				/>{/if}
		</button>
	</div>
</div>

<style>
	.row {
		display: grid;
		grid-template-columns: 32px 1fr auto auto;
		align-items: center;
		gap: 14px;
		padding: 12px 16px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--card-shadow);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease,
			background 0.15s ease;
	}
	.row:hover {
		border-color: var(--border-strong);
		box-shadow: var(--card-shadow-hover);
	}
	.row.highlighted {
		border-color: rgba(0, 112, 243, 0.35);
		background:
			linear-gradient(180deg, rgba(0, 112, 243, 0.08), rgba(0, 112, 243, 0.02) 40%),
			var(--bg-elevated);
		box-shadow:
			0 0 0 1px rgba(0, 112, 243, 0.2),
			var(--card-shadow);
	}
	.row.highlighted:hover {
		border-color: rgba(0, 112, 243, 0.5);
		box-shadow:
			0 0 0 1px rgba(0, 112, 243, 0.35),
			var(--card-shadow-hover);
	}

	.star {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		border-radius: var(--radius-pill);
		color: var(--text-faint);
		transition:
			color 0.15s ease,
			background-color 0.15s ease,
			transform 0.15s ease;
	}
	.star:hover {
		color: var(--accent);
		background: var(--info-bg);
	}
	.star:active {
		transform: scale(0.92);
	}
	.star.active {
		color: var(--accent);
	}

	.info {
		min-width: 0;
	}
	.name {
		margin: 0;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.meta {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--text-faint);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dot {
		margin: 0 6px;
		opacity: 0.5;
	}
	.pad {
		display: inline-block;
		width: 6px;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 12px;
		font-weight: 600;
		padding: 3px 10px;
		border-radius: var(--radius-pill);
		text-transform: capitalize;
		white-space: nowrap;
	}
	.led {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
	}
	.status.running {
		color: var(--success);
		background: var(--success-bg);
	}
	.status.created {
		color: var(--accent);
		background: var(--info-bg);
	}
	.status.exited,
	.status.dead,
	.status.unknown {
		color: var(--status-offline);
		background: var(--status-offline-bg);
	}
	.status.removing {
		color: var(--danger);
		background: var(--danger-bg);
	}
	.status.paused,
	.status.restarting {
		color: var(--status-paused);
		background: var(--status-paused-bg);
	}

	.actions {
		display: flex;
		gap: 6px;
	}
	.action {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border);
		background: var(--bg-raised);
		color: var(--text-muted);
		box-shadow: var(--card-shadow);
		transition:
			color 0.15s ease,
			border-color 0.15s ease,
			background-color 0.15s ease,
			transform 0.15s ease;
	}
	.action:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--border-strong);
	}
	.action:active:not(:disabled) {
		transform: scale(0.94);
	}
	.action.danger:hover:not(:disabled) {
		color: var(--danger);
		border-color: rgba(255, 91, 79, 0.4);
		background: var(--danger-bg);
	}
	.action:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.spin {
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 720px) {
		.row {
			grid-template-columns: 28px 1fr auto;
			gap: 10px;
			padding: 12px;
		}
		.star {
			grid-column: 1;
			grid-row: 1;
		}
		.info {
			grid-column: 2;
			grid-row: 1;
		}
		.status {
			grid-column: 3;
			grid-row: 1;
		}
		.actions {
			grid-column: 1 / -1;
			grid-row: 2;
			justify-content: flex-end;
			padding-top: 2px;
		}
	}
</style>
