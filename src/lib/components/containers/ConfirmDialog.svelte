<script lang="ts">
	import { getRequest, resolveConfirm } from '$lib/containers/client/dialog.svelte';
	import { AlertTriangle } from '@lucide/svelte';

	let request = $derived(getRequest());

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') resolveConfirm(false);
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if request}
	<div
		class="overlay"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && resolveConfirm(false)}
	>
		<div class="dialog" role="alertdialog" aria-modal="true" aria-label={request.title}>
			<div class="heading">
				{#if request.danger}
					<span class="warn"><AlertTriangle size={20} /></span>
				{/if}
				<h3>{request.title}</h3>
			</div>
			{#if request.message}<p class="message">{request.message}</p>{/if}
			<div class="actions">
				<button class="ghost" onclick={() => resolveConfirm(false)}>Cancelar</button>
				<button class:danger={request.danger} class="confirm" onclick={() => resolveConfirm(true)}>
					{request.confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		padding: 16px;
	}

	.dialog {
		width: 100%;
		max-width: 420px;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 24px;
		box-shadow: var(--modal-shadow);
		animation: dialog-in 0.16s ease-out;
	}

	@keyframes dialog-in {
		from {
			opacity: 0;
			transform: scale(0.97);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.heading {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.warn {
		color: var(--warning);
		display: flex;
	}

	.message {
		color: var(--text-muted);
		margin: 10px 0 20px;
		white-space: pre-line;
		line-height: 1.5;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}

	button {
		border-radius: var(--radius-pill);
		padding: 8px 16px;
		font-size: 13px;
		font-weight: 500;
		border: 1px solid var(--border);
		background: var(--bg-raised);
		color: var(--text);
		box-shadow: var(--card-shadow);
		transition:
			transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94),
			background-color 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease;
	}
	button:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}
	button:active {
		transform: scale(0.97);
	}

	.ghost {
		background: transparent;
		box-shadow: none;
	}
	.ghost:hover {
		background: var(--bg-raised);
	}

	.confirm {
		background: #0070f3;
		border-color: #0070f3;
		color: #ffffff;
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.08),
			0 2px 4px rgba(0, 0, 0, 0.08);
	}
	.confirm:hover {
		background: #0060df;
		border-color: #0060df;
		color: #ffffff;
	}
	.confirm.danger {
		background: var(--danger-bg);
		border-color: rgba(255, 91, 79, 0.3);
		color: var(--danger);
		box-shadow: none;
	}
	.confirm.danger:hover {
		background: rgba(255, 91, 79, 0.2);
		border-color: rgba(255, 91, 79, 0.5);
		color: var(--danger);
	}
</style>
