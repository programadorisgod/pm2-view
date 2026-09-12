<script lang="ts">
	import type { NetworkSummary } from '$lib/types';
	import NetworkRow from './NetworkRow.svelte';
	import EmptyState from './EmptyState.svelte';

	interface Props {
		networks: NetworkSummary[];
		onRefresh: () => void | Promise<void>;
	}

	let { networks, onRefresh }: Props = $props();

	const sorted = $derived([...networks].sort((a, b) => b.created - a.created));
</script>

<p class="count text-muted" data-testid="network-count">
	{networks.length} red{networks.length === 1 ? '' : 'es'} · ordenadas por fecha de creación
</p>

{#if networks.length === 0}
	<EmptyState
		title="No hay redes"
		message="Las redes que existan en el motor de contenedores aparecerán aquí."
	/>
{:else}
	<div class="list">
		{#each sorted as network (network.id)}
			<NetworkRow {network} {onRefresh} />
		{/each}
	</div>
{/if}

<style>
	.count {
		margin: 0 0 14px;
		font-size: 13px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
</style>
