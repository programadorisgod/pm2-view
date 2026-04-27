<script lang="ts">
	import { cn } from '$lib/motion-core/utils/cn';
	import { fade } from 'svelte/transition';

	let {
		status = 'online',
		class: className = ''
	}: {
		status?: 'online' | 'offline' | 'stopped' | 'error';
		class?: string;
	} = $props();

	const statusConfig = {
		online: {
			dot: 'bg-green-500',
			text: 'text-green-700',
			pulse: true
		},
		offline: {
			dot: 'bg-gray-400',
			text: 'text-gray-600',
			pulse: false
		},
		stopped: {
			dot: 'bg-orange-500',
			text: 'text-orange-700',
			pulse: false
		},
		error: {
			dot: 'bg-red-500',
			text: 'text-red-700',
			pulse: false
		}
	};

	let config = $derived(statusConfig[status]);
</script>

<div class={cn('inline-flex items-center gap-2', className)} in:fade={{ duration: 200 }}>
	<div class="relative">
		<span class={cn('w-3 h-3 rounded-full block', config.dot)}></span>
		{#if config.pulse}
			<span
				class={cn(
					'w-3 h-3 rounded-full block absolute top-0 left-0 animate-ping',
					config.dot
				)}
				style="animation-duration: 1.5s;"
			></span>
		{/if}
	</div>
	<span class={cn('text-caption capitalize', config.text)}>{status}</span>
</div>
