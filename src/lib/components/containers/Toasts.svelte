<script lang="ts">
	import { getToasts, dismiss, type ToastType } from '$lib/containers/client/toasts.svelte';
	import { CheckCircle2, AlertTriangle, XCircle, Info, X } from '@lucide/svelte';

	const icons: Record<ToastType, typeof Info> = {
		success: CheckCircle2,
		error: XCircle,
		warning: AlertTriangle,
		info: Info
	};

	let toasts = $derived(getToasts());
</script>

<div class="toasts" aria-live="polite" aria-atomic="false">
	{#each toasts as toast (toast.id)}
		{@const Icon = icons[toast.type]}
		<div class="toast {toast.type}" role="status">
			<span class="icon"><Icon size={18} /></span>
			<div class="body">
				<p class="title">{toast.title}</p>
				{#if toast.message}<p class="message">{toast.message}</p>{/if}
			</div>
			<button class="close" onclick={() => dismiss(toast.id)} aria-label="Cerrar notificación">
				<X size={14} />
			</button>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		z-index: 60;
		right: 16px;
		bottom: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		max-width: 380px;
		width: calc(100vw - 32px);
	}

	.toast {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 16px;
		border-radius: var(--radius-md);
		background: var(--bg-surface);
		border: 1px solid var(--border);
		box-shadow: var(--modal-shadow);
		animation: toast-in 0.18s ease-out;
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.toast.success {
		border-color: rgba(0, 230, 118, 0.4);
	}
	.toast.error {
		border-color: rgba(255, 91, 79, 0.45);
	}
	.toast.warning {
		border-color: rgba(255, 215, 64, 0.45);
	}

	.icon {
		margin-top: 1px;
		color: var(--text-muted);
	}
	.toast.success .icon {
		color: var(--success);
	}
	.toast.error .icon {
		color: var(--danger);
	}
	.toast.warning .icon {
		color: var(--warning);
	}

	.body {
		flex: 1;
		min-width: 0;
	}

	.title {
		margin: 0;
		font-weight: 600;
		font-size: 13px;
	}

	.message {
		margin: 2px 0 0;
		color: var(--text-muted);
		font-size: 12px;
		word-break: break-word;
	}

	.close {
		background: none;
		border: none;
		color: var(--text-faint);
		padding: 2px;
		display: flex;
		align-items: center;
		border-radius: 4px;
	}
	.close:hover {
		color: var(--text);
	}
</style>
