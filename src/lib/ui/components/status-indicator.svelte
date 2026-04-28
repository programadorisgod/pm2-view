<script lang="ts">
	import { cn } from '$lib/motion-core/utils/cn';

	let {
		status = 'online',
		class: className = ''
	}: {
		status?: 'online' | 'offline' | 'stopped' | 'error';
		class?: string;
	} = $props();

	const statusConfig = {
		online: { dot: '#00E676', glow: 'rgba(0, 230, 118, 0.4)' },
		offline: { dot: '#5A6474', glow: 'transparent' },
		stopped: { dot: '#FFB74D', glow: 'rgba(255, 183, 77, 0.4)' },
		error: { dot: '#FF5252', glow: 'rgba(255, 82, 82, 0.4)' }
	};

	let config = $derived(statusConfig[status]);
</script>

<div class={cn('inline-flex items-center gap-2', className)}>
	<div class="relative">
		<span class="w-2.5 h-2.5 rounded-full block" style="background: {config.dot};"></span>
		{#if status === 'online'}
			<span
				class="w-2.5 h-2.5 rounded-full block absolute top-0 left-0"
				style="background: {config.dot}; opacity: 0.5; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"
			></span>
		{/if}
	</div>
	<span class="text-caption capitalize" style="color: {config.dot};">{status}</span>
</div>

<style>
	@keyframes ping {
		75%, 100% {
			transform: scale(2);
			opacity: 0;
		}
	}
</style>
