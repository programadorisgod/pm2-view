<script lang="ts">
	import { cn } from '$lib/motion-core/utils/cn';

	let {
		variant = 'online',
		class: className = '',
		children
	}: {
		variant?: 'online' | 'offline' | 'stopped' | 'error' | 'warning';
		class?: string;
		children?: import('svelte').Snippet;
	} = $props();

	const variantConfig = {
		online: {
			dot: 'bg-green-500',
			text: 'text-green-700',
			bg: 'bg-green-50'
		},
		offline: {
			dot: 'bg-gray-400',
			text: 'text-gray-600',
			bg: 'bg-gray-50'
		},
		stopped: {
			dot: 'bg-orange-500',
			text: 'text-orange-700',
			bg: 'bg-orange-50'
		},
		error: {
			dot: 'bg-red-500',
			text: 'text-red-700',
			bg: 'bg-red-50'
		},
		warning: {
			dot: 'bg-yellow-500',
			text: 'text-yellow-700',
			bg: 'bg-yellow-50'
		}
	};

	let config = $derived(variantConfig[variant]);
</script>

<span
	class={cn(
		'inline-flex items-center gap-2 px-3 py-1 rounded-pill text-caption-strong',
		config.bg,
		config.text,
		className
	)}
>
	<span class={cn('w-2 h-2 rounded-full', config.dot)}></span>
	{@render children?.()}
</span>
