<script lang="ts">
	import type { VolumeSummary } from '$lib/types';
	import VolumeRow from './VolumeRow.svelte';
	import EmptyState from './EmptyState.svelte';

	interface Props {
		volumes: VolumeSummary[];
		onRefresh: () => void | Promise<void>;
	}

	let { volumes, onRefresh }: Props = $props();

	const sorted = $derived(
		[...volumes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
	);
</script>

<p class="count text-muted" data-testid="volume-count">
	{volumes.length} volumen{volumes.length === 1 ? '' : 'es'} · ordenados por fecha de creación
</p>

{#if volumes.length === 0}
	<EmptyState
		title="No hay volúmenes"
		message="Los volúmenes que existan en el motor de contenedores aparecerán aquí."
	/>
{:else}
	<div class="list">
		{#each sorted as volume (volume.name)}
			<VolumeRow {volume} {onRefresh} />
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
