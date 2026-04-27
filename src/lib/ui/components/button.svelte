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
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		class?: string;
		children?: import('svelte').Snippet;
		onclick?: (event: MouseEvent) => void;
		[key: string]: unknown;
	} = $props();

	const variantClasses = {
		primary: 'bg-action-blue text-on-primary hover:bg-action-blue-focus focus:outline-2 focus:outline-action-blue-focus focus:outline-offset-2',
		secondary: 'bg-transparent text-action-blue border border-action-blue hover:bg-action-blue/10',
		ghost: 'bg-transparent text-action-blue hover:bg-action-blue/10',
		danger: 'bg-red-500 text-white hover:bg-red-600 focus:outline-2 focus:outline-red-500 focus:outline-offset-2'
	};

	const sizeClasses = {
		sm: 'px-[15px] py-2 text-button-utility',
		md: 'px-[22px] py-[11px] text-body',
		lg: 'px-[28px] py-[14px] text-button-large'
	};
</script>

<button
	{disabled}
	class={cn(
		'rounded-pill transition-transform active:scale-[0.95] font-medium',
		variantClasses[variant],
		sizeClasses[size],
		disabled && 'opacity-48 cursor-not-allowed',
		className
	)}
	{onclick}
	{...restProps}
>
	{@render children?.()}
</button>
