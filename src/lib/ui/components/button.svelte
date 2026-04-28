<script lang="ts">
	import { cn } from '$lib/motion-core/utils/cn';

	let {
		variant = 'primary',
		size = 'md',
		disabled = false,
		class: className = '',
		children,
		onclick,
		...restProps
	}: {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'xs' | 'sm' | 'md';
		disabled?: boolean;
		class?: string;
		children?: import('svelte').Snippet;
		onclick?: (event: MouseEvent) => void;
		[key: string]: unknown;
	} = $props();

	const sizeClasses = {
		xs: 'px-3 py-1 text-caption-sm',
		sm: 'px-4 py-1.5 text-caption',
		md: 'px-5 py-2 text-body-sm'
	};
</script>

<button
	{disabled}
	class={cn(
		'btn-' + variant,
		sizeClasses[size],
		disabled && 'opacity-40 cursor-not-allowed',
		className
	)}
	{onclick}
	{...restProps}
>
	{@render children?.()}
</button>
