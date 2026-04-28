<script lang="ts">
	import { Card, StatusIndicator } from '$lib/ui/components';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let { processes, summary } = $derived(data);

	let stats = $derived([
		{ label: 'Total', value: summary?.total ?? 0, status: 'online' as const, icon: 'M4 6a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z' },
		{ label: 'Running', value: summary?.running ?? 0, status: 'online' as const, icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
		{ label: 'Stopped', value: summary?.stopped ?? 0, status: 'stopped' as const, icon: 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z' },
		{ label: 'Errors', value: summary?.errored ?? 0, status: 'error' as const, icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' }
	]);

	function getStatusVariant(status: string) {
		switch (status) {
			case 'online': return 'online';
			case 'stopped': return 'stopped';
			case 'error': return 'error';
			default: return 'offline';
		}
	}
</script>

<div class="max-w-5xl mx-auto">
	<!-- Header -->
	<div class="mb-xl">
		<h1 class="text-hero font-bold mb-xs" style="view-transition-name: page-title; color: var(--text-primary);">Dashboard</h1>
		<p class="text-body-sm" style="color: var(--text-secondary);">Monitor and manage your PM2 processes</p>
	</div>

	<!-- Summary Cards -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-md mb-xl">
		{#each stats as stat, i}
			<div class="stagger-item" style="--stagger-index: {i};">
				<Card>
					<div class="flex items-start justify-between">
					<div>
						<p class="text-caption font-medium mb-1" style="color: var(--text-muted);">{stat.label}</p>
						<p class="text-h1 font-bold" style="color: var(--text-primary);">{stat.value}</p>
					</div>
					<div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background: rgba(56, 205, 255, 0.08);">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #38CDFF;">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={stat.icon}/>
						</svg>
					</div>
				</div>
			</Card>
			</div>
		{/each}
	</div>

	<!-- Process List -->
	<Card>
		<h2 class="text-h3 font-semibold mb-md" style="color: var(--text-primary);">Processes</h2>

		{#if !processes || processes.length === 0}
			<div class="text-center py-2xl">
				<p class="text-body" style="color: var(--text-secondary);">No PM2 processes found</p>
				<p class="text-caption mt-xs" style="color: var(--text-muted);">Start a PM2 process to see it here</p>
			</div>
		{:else}
			<div class="space-y-xs">
				{#each processes as process, i (process.pm_id)}
					<a href="/projects/{process.pm_id}" class="flex items-center justify-between py-sm px-md rounded-md transition-colors hover:bg-[var(--bg-surface)] cursor-pointer group stagger-item" style="--stagger-index: {i + 4};">
						<div class="flex items-center gap-md">
							<StatusIndicator status={getStatusVariant(process.status)} />
							<div>
								<p class="text-body-sm font-medium process-name group-hover:text-[#38CDFF] transition-colors" style="color: var(--text-primary);">{process.name}</p>
								<p class="text-caption" style="color: var(--text-muted);">
									CPU: {process.cpu}% · RAM: {process.memoryMB}MB · {process.uptimeFormatted}
								</p>
							</div>
						</div>
						<span class="btn-secondary px-3 py-1 text-caption opacity-0 group-hover:opacity-100 transition-opacity">
							View →
						</span>
					</a>
				{/each}
			</div>
		{/if}
	</Card>

	<!-- Quick Links -->
	<div class="flex flex-wrap gap-sm mt-xl">
		<a href="/projects" class="btn-primary px-4 py-2 text-body-sm">View All Projects</a>
		<a href="/metrics" class="btn-secondary px-4 py-2 text-body-sm">View Metrics</a>
	</div>
</div>
