<script lang="ts">
	import type { EngineType } from '$lib/types';

	interface Props {
		engine: EngineType;
	}

	let { engine }: Props = $props();
</script>

<span class="badge {engine}" data-testid="engine-badge"
	>{engine === 'podman' ? 'Podman' : 'Docker'}</span
>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.badge.docker {
		color: var(--accent);
		background: var(--info-bg);
	}
	.badge.podman {
		color: #a78bfa;
		background: rgba(139, 92, 246, 0.14);
	}
</style>
