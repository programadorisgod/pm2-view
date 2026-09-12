<script lang="ts">
	import { Boxes } from '@lucide/svelte';

	interface Props {
		title?: string;
		message?: string;
	}

	let { title = 'Sin elementos', message = 'No hay recursos que mostrar aquí.' }: Props = $props();
</script>

<div class="empty" data-testid="empty-state">
	<span class="icon"><Boxes size={26} /></span>
	<p class="title">{title}</p>
	<p class="message">{message}</p>
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 56px 20px;
		text-align: center;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
	}
	.icon {
		color: var(--text-faint);
	}
	.title {
		margin: 0;
		font-weight: 600;
	}
	.message {
		margin: 0;
		color: var(--text-muted);
		font-size: 13px;
		max-width: 380px;
	}
</style>
