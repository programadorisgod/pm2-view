<script lang="ts">
	import type { VolumeSummary } from '$lib/types';
	import { runAction, errorMessage } from '$lib/containers/client/api';
	import { pushToast } from '$lib/containers/client/toasts.svelte';
	import { confirmAction } from '$lib/containers/client/dialog.svelte';
	import { Trash2, Loader2 } from '@lucide/svelte';
	import { formatDate } from '$lib/containers/format';
	import EngineBadge from './EngineBadge.svelte';

	interface Props {
		volume: VolumeSummary;
		onRefresh?: () => void | Promise<void>;
	}

	let { volume, onRefresh = () => {} }: Props = $props();

	let pending = $state(false);

	async function remove() {
		if (pending) return;
		const ok = await confirmAction({
			title: `¿Eliminar el volumen "${volume.name}"?`,
			message: volume.used
				? 'Este volumen está en uso por un contenedor. La operación podría fallar.'
				: 'Esta acción no se puede deshacer.',
			confirmLabel: 'Eliminar',
			danger: true
		});
		if (!ok) return;
		pending = true;
		try {
			const result = await runAction('volumes', volume.name, 'remove');
			pushToast({ type: 'success', title: 'Volumen eliminado', message: result.message });
			await onRefresh();
		} catch (err) {
			pushToast({ type: 'error', title: 'No se pudo eliminar', message: errorMessage(err) });
		} finally {
			pending = false;
		}
	}
</script>

<div class="row" data-testid="volume-row">
	<div class="info">
		<p class="name mono">{volume.name}</p>
		<p class="meta">
			<EngineBadge engine={volume.engine} />
			<span class="pad"></span>
			{volume.driver}
			{#if volume.mountpoint}
				<span class="dot">·</span>
				<span class="mono" title={volume.mountpoint}>{volume.mountpoint}</span>
			{/if}
		</p>
	</div>
	{#if volume.used}
		<span class="badge">En uso</span>
	{/if}
	<span class="created text-muted">{formatDate(new Date(volume.createdAt).getTime())}</span>
	<button
		class="action danger"
		onclick={remove}
		disabled={pending}
		title="Eliminar volumen"
		aria-label={`Eliminar volumen ${volume.name}`}
	>
		{#if pending}<span class="spin"><Loader2 size={14} /></span>{:else}<Trash2 size={14} />{/if}
	</button>
</div>

<style>
	.row {
		display: grid;
		grid-template-columns: 1fr auto auto auto;
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
			background-color 0.15s ease;
	}
	.row:hover {
		border-color: var(--border-strong);
		box-shadow: var(--card-shadow-hover);
	}
	.info {
		min-width: 0;
	}
	.name {
		margin: 0;
		font-weight: 600;
		font-size: 13px;
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
	.badge {
		font-size: 11px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		color: var(--warning);
		background: var(--warning-bg);
	}
	.created {
		font-size: 12px;
		white-space: nowrap;
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
			grid-template-columns: 1fr auto;
			gap: 10px;
			padding: 12px;
		}
		.info {
			grid-column: 1;
			grid-row: 1;
		}
		.badge {
			grid-column: 2;
			grid-row: 1;
		}
		.created {
			grid-column: 1;
			grid-row: 2;
		}
		.action {
			grid-column: 2;
			grid-row: 1 / span 2;
		}
	}
</style>
