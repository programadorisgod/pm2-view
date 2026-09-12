<script lang="ts">
	import type { NetworkSummary } from '$lib/types';
	import { runAction, errorMessage } from '$lib/containers/client/api';
	import { pushToast } from '$lib/containers/client/toasts.svelte';
	import { confirmAction } from '$lib/containers/client/dialog.svelte';
	import { Trash2, Loader2, Lock, Link } from '@lucide/svelte';
	import { formatDate } from '$lib/containers/format';
	import EngineBadge from './EngineBadge.svelte';

	interface Props {
		network: NetworkSummary;
		onRefresh?: () => void | Promise<void>;
	}

	let { network, onRefresh = () => {} }: Props = $props();

	let pending = $state(false);

	async function remove() {
		if (pending) return;
		const ok = await confirmAction({
			title: `¿Eliminar la red "${network.name}"?`,
			message:
				network.containers > 0
					? 'Esta red tiene contenedores conectados. La operación podría fallar.'
					: 'Esta acción no se puede deshacer.',
			confirmLabel: 'Eliminar',
			danger: true
		});
		if (!ok) return;
		pending = true;
		try {
			const result = await runAction('networks', network.id, 'remove');
			pushToast({ type: 'success', title: 'Red eliminada', message: result.message });
			await onRefresh();
		} catch (err) {
			pushToast({ type: 'error', title: 'No se pudo eliminar', message: errorMessage(err) });
		} finally {
			pending = false;
		}
	}
</script>

<div class="row" data-testid="network-row">
	<div class="info">
		<p class="name mono">
			{network.name}
			{#if network.internal}
				<span class="icon" title="Red interna"><Lock size={12} /></span>
			{/if}
		</p>
		<p class="meta">
			<EngineBadge engine={network.engine} />
			<span class="pad"></span>
			{network.driver} · {network.scope}
			{#if network.subnet}
				<span class="dot">·</span>
				<span class="mono">{network.subnet}</span>
			{/if}
			{#if network.containers > 0}
				<span class="dot">·</span>
				<span><Link size={11} /> {network.containers} contenedor(es)</span>
			{/if}
		</p>
	</div>
	<span class="created text-muted">{formatDate(network.created)}</span>
	<button
		class="action danger"
		onclick={remove}
		disabled={pending}
		title="Eliminar red"
		aria-label={`Eliminar red ${network.name}`}
	>
		{#if pending}<span class="spin"><Loader2 size={14} /></span>{:else}<Trash2 size={14} />{/if}
	</button>
</div>

<style>
	.row {
		display: grid;
		grid-template-columns: 1fr auto auto;
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
		display: flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name .icon {
		color: var(--text-faint);
		flex-shrink: 0;
	}
	.meta {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--text-faint);
		display: flex;
		align-items: center;
		gap: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dot {
		margin: 0 5px;
		opacity: 0.5;
	}
	.pad {
		display: inline-block;
		width: 6px;
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
