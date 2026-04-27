<script lang="ts">
	import { cn } from '$lib/motion-core/utils/cn';

	let {
		variant = 'light',
		padding = true,
		rounded = false,
		class: className = '',
		children
	}: {
		variant?: 'light' | 'dark' | 'parchment';
		padding?: boolean;
		rounded?: boolean | 'sm' | 'md' | 'lg' | 'pill';
		class?: string;
		children?: import('svelte').Snippet;
	} = $props();

	const variantClasses = {
		light: 'bg-canvas text-ink',
		dark: 'bg-surface-tile-1 text-on-dark',
		parchment: 'bg-canvas-parchment text-ink'
	};

	const roundedClasses = {
		true: 'rounded-lg',
		false: '',
		sm: 'rounded-sm',
		md: 'rounded-md',
		lg: 'rounded-lg',
		pill: 'rounded-pill'
	};

	let computedRounded = $derived(
		typeof rounded === 'boolean' ? (rounded ? 'rounded-lg' : '') : roundedClasses[rounded] || ''
	);
</script>

<div
	class={cn(
		'border border-hairline',
		variantClasses[variant],
		computedRounded,
		padding ? 'p-lg' : '',
		className
	)}
>
	{@render children?.()}
</div>
