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
		online: { bg: 'rgba(0, 230, 118, 0.1)', text: '#00E676', dot: '#00E676' },
		offline: { bg: 'rgba(90, 100, 116, 0.15)', text: '#8B95A5', dot: '#5A6474' },
		stopped: { bg: 'rgba(255, 183, 77, 0.1)', text: '#FFB74D', dot: '#FFB74D' },
		error: { bg: 'rgba(255, 82, 82, 0.1)', text: '#FF5252', dot: '#FF5252' },
		warning: { bg: 'rgba(255, 215, 64, 0.1)', text: '#FFD740', dot: '#FFD740' }
	};

	let config = $derived(variantConfig[variant]);
</script>

<span
	class={cn(
		'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-caption font-medium',
		className
	)}
	style="background: {config.bg}; color: {config.text};"
>
	<span class="w-1.5 h-1.5 rounded-full" style="background: {config.dot}"></span>
	{@render children?.()}
</span>
