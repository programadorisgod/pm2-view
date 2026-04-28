<script lang="ts">
	import { cn } from '$lib/motion-core/utils/cn';

	let {
		variant = 'default',
		padding = true,
		class: className = '',
		children
	}: {
		variant?: 'default' | 'elevated' | 'ghost';
		padding?: boolean;
		class?: string;
		children?: import('svelte').Snippet;
	} = $props();
</script>

<div
	class={cn(
		'card-base rounded-lg',
		variant === 'elevated' ? 'glow-sm' : '',
		variant === 'ghost' ? '!bg-transparent !border-transparent !shadow-none hover:!bg-transparent' : '',
		padding ? 'p-lg' : '',
		className
	)}
>
	{@render children?.()}
</div>
