<script lang="ts">
	import type { ImageSummary } from '$lib/types';
	import ImageRow from './ImageRow.svelte';
	import EmptyState from './EmptyState.svelte';
	import { ArrowDownWideNarrow, ArrowUpNarrowWide } from '@lucide/svelte';

	interface Props {
		images: ImageSummary[];
		onRefresh: () => void | Promise<void>;
	}

	let { images, onRefresh }: Props = $props();

	let order = $state<'desc' | 'asc'>('desc');

	const sorted = $derived(
		[...images].sort((a, b) => (order === 'desc' ? b.created - a.created : a.created - b.created))
	);
</script>

<div class="toolbar">
	<p class="count text-muted" data-testid="image-count">
		{images.length} imagen{images.length === 1 ? '' : 'es'} · ordenadas por creación
	</p>
	<button
		class="sort"
		onclick={() => (order = order === 'desc' ? 'asc' : 'desc')}
		title={order === 'desc'
			? 'Ordenar de más antigua a más reciente'
			: 'Ordenar de más reciente a más antigua'}
		aria-label="Cambiar orden de las imágenes por fecha de creación"
	>
		{#if order === 'desc'}<ArrowDownWideNarrow size={15} />{:else}<ArrowUpNarrowWide
				size={15}
			/>{/if}
		{order === 'desc' ? 'Recientes primero' : 'Antiguas primero'}
	</button>
</div>

{#if images.length === 0}
	<EmptyState
		title="No hay imágenes"
		message="Las imágenes que existan en el motor de contenedores aparecerán aquí."
	/>
{:else}
	<div class="list">
		{#each sorted as image (image.id)}
			<ImageRow {image} {onRefresh} />
		{/each}
	</div>
{/if}

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 14px;
	}
	.count {
		margin: 0;
		font-size: 13px;
	}
	.sort {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 6px 14px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border);
		background: var(--bg-surface);
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 500;
		box-shadow: var(--card-shadow);
		transition:
			transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94),
			border-color 0.15s ease,
			color 0.15s ease,
			background-color 0.15s ease;
	}
	.sort:hover {
		color: var(--text);
		border-color: var(--border-strong);
		background: var(--bg-raised);
	}
	.sort:active {
		transform: scale(0.97);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
</style>
