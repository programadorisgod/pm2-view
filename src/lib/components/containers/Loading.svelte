<script lang="ts">
	import { Loader2 } from '@lucide/svelte';

	interface Props {
		label?: string;
	}

	let { label = 'Cargando…' }: Props = $props();
</script>

<div class="loading" data-testid="loading" role="status" aria-live="polite">
	<span class="spin"><Loader2 size={18} /></span>
	{label}
</div>

<style>
	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 48px 0;
		color: var(--text-muted);
		font-size: 13px;
	}
	.spin {
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
