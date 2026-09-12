<script lang="ts">
	import type { ContainerSummary } from '$lib/types';
	import ContainerRow from './ContainerRow.svelte';
	import EmptyState from './EmptyState.svelte';

	interface Props {
		containers: ContainerSummary[];
		onRefresh: () => void | Promise<void>;
	}

	let { containers, onRefresh }: Props = $props();

	type Filter = 'all' | 'running' | 'stopped' | 'highlighted';

	let filter = $state<Filter>('all');
	let query = $state('');

	const counts = $derived({
		all: containers.length,
		running: containers.filter((c) => c.running).length,
		stopped: containers.filter((c) => !c.running).length,
		highlighted: containers.filter((c) => c.highlighted).length
	});

	const filters: { id: Filter; label: string }[] = [
		{ id: 'all', label: 'Todos' },
		{ id: 'running', label: 'En ejecución' },
		{ id: 'stopped', label: 'Detenidos' },
		{ id: 'highlighted', label: 'Destacados' }
	];

	const visible = $derived(
		containers.filter((c) => {
			if (filter === 'running' && !c.running) return false;
			if (filter === 'stopped' && c.running) return false;
			if (filter === 'highlighted' && !c.highlighted) return false;
			if (query) {
				const q = query.toLowerCase();
				if (!c.name.toLowerCase().includes(q) && !c.image.toLowerCase().includes(q)) return false;
			}
			return true;
		})
	);
</script>

<div class="toolbar" data-testid="containers-toolbar">
	<div class="chips" role="group" aria-label="Filtrar contenedores por estado">
		{#each filters as f (f.id)}
			<button
				class:active={filter === f.id}
				onclick={() => (filter = f.id)}
				aria-pressed={filter === f.id}
				data-testid="container-filter"
				data-filter={f.id}
			>
				{f.label}
				<span class="count">{counts[f.id]}</span>
			</button>
		{/each}
	</div>
	<input
		class="search"
		type="search"
		placeholder="Buscar por nombre o imagen…"
		aria-label="Buscar contenedores"
		bind:value={query}
	/>
</div>

{#if containers.length === 0}
	<EmptyState
		title="No hay contenedores"
		message="Crea contenedores con Podman o Docker y aparecerán aquí."
	/>
{:else if visible.length === 0}
	<EmptyState
		title="Sin resultados"
		message="Ningún contenedor coincide con el filtro o la búsqueda."
	/>
{:else}
	<div class="list">
		{#each visible as container (container.id)}
			<ContainerRow {container} {onRefresh} />
		{/each}
	</div>
{/if}

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		margin-bottom: 14px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chips button {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 6px 14px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border);
		background: var(--bg-surface);
		color: var(--text-muted);
		font-size: 13px;
		font-weight: 500;
		box-shadow: var(--card-shadow);
		transition:
			border-color 0.15s ease,
			color 0.15s ease,
			background-color 0.15s ease,
			transform 0.15s ease;
	}
	.chips button:hover {
		color: var(--text);
		border-color: var(--border-strong);
		background: var(--bg-raised);
	}
	.chips button:active {
		transform: scale(0.97);
	}
	.chips button.active {
		color: #ffffff;
		background: #0070f3;
		border-color: #0070f3;
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.08),
			0 2px 4px rgba(0, 0, 0, 0.08);
	}
	.chips button.active .count {
		background: rgba(255, 255, 255, 0.22);
		color: #ffffff;
	}
	.count {
		background: var(--bg-raised);
		border-radius: var(--radius-pill);
		padding: 0 7px;
		font-size: 11px;
		line-height: 17px;
		color: var(--text-muted);
	}
	.search {
		flex: 1;
		min-width: 180px;
		padding: 7px 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text);
		font-size: 13px;
		box-shadow: var(--card-shadow);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}
	.search:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--info-bg);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
</style>
