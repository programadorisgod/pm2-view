<script lang="ts">
	import { Card, StatusIndicator } from '$lib/ui/components';
	import { invalidate } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let processes = $derived(data.processes ?? []);
	let summary = $derived(data.summary);

	let intervalId = $state<ReturnType<typeof setInterval> | null>(null);

	// Auto-refresh every 10 seconds using SvelteKit invalidation
	$effect(() => {
		intervalId = setInterval(async () => {
			await invalidate('/metrics');
		}, 10000);

		return () => {
			if (intervalId) clearInterval(intervalId);
		};
	});

	function getStatusVariant(status: string) {
		switch (status) {
			case 'online': return 'online';
			case 'stopped': return 'stopped';
			case 'error': return 'error';
			default: return 'offline';
		}
	}

	function formatRam(bytes: number): string {
		const mb = Math.round(bytes / 1024 / 1024);
		return `${mb} MB`;
	}

	function getCpuBarColor(cpu: number): string {
		if (cpu >= 80) return 'bg-red-500';
		if (cpu >= 50) return 'bg-yellow-500';
		return 'bg-green-500';
	}

	function getRamBarColor(ramMB: number): string {
		// Assume 8GB system for percentage calculation
		const ramPercent = (ramMB / (8 * 1024)) * 100;
		if (ramPercent >= 80) return 'bg-red-500';
		if (ramPercent >= 50) return 'bg-yellow-500';
		return 'bg-green-500';
	}
</script>

<div class="max-w-6xl mx-auto">
	<div class="mb-xxl">
		<h1 class="text-hero-display tracking-negative-hero font-semibold text-ink mb-md">
			Metrics
		</h1>
		<p class="text-lead text-ink-muted-80">
			Real-time performance metrics for all PM2 processes.
		</p>
	</div>

	<!-- Summary Cards -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-lg mb-xxl">
		<Card variant="light" padding={true} rounded="lg">
			<div class="flex items-start justify-between mb-sm">
				<span class="text-caption-strong text-ink-muted-80 uppercase tracking-wider">
					Total CPU
				</span>
				<svg class="w-5 h-5 text-action-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
				</svg>
			</div>
			<p class="text-display-lg font-semibold text-ink">
				{summary?.totalCpu?.toFixed(1) ?? 0}%
			</p>
		</Card>

		<Card variant="light" padding={true} rounded="lg">
			<div class="flex items-start justify-between mb-sm">
				<span class="text-caption-strong text-ink-muted-80 uppercase tracking-wider">
					Total RAM
				</span>
				<svg class="w-5 h-5 text-action-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
				</svg>
			</div>
			<p class="text-display-lg font-semibold text-ink">
				{summary?.totalRam ? formatRam(summary.totalRam) : '0 MB'}
			</p>
		</Card>

		<Card variant="light" padding={true} rounded="lg">
			<div class="flex items-start justify-between mb-sm">
				<span class="text-caption-strong text-ink-muted-80 uppercase tracking-wider">
					Avg Uptime
				</span>
				<svg class="w-5 h-5 text-action-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			</div>
			<p class="text-display-lg font-semibold text-ink">
				{summary?.avgUptime ?? 'N/A'}
			</p>
		</Card>

		<Card variant="light" padding={true} rounded="lg">
			<div class="flex items-start justify-between mb-sm">
				<span class="text-caption-strong text-ink-muted-80 uppercase tracking-wider">
					Running
				</span>
				<StatusIndicator status="online" />
			</div>
			<p class="text-display-lg font-semibold text-ink">
				{summary?.processesRunning ?? 0}
				<span class="text-body text-ink-muted-80"> / {summary?.totalProcesses ?? 0}</span>
			</p>
		</Card>
	</div>

	<!-- Per-Process Metrics -->
	<Card variant="light" padding={true} rounded="lg">
		<h2 class="text-display-md font-semibold text-ink mb-lg">Process Metrics</h2>

		{#if !processes || processes.length === 0}
			<div class="text-body text-ink-muted-80 py-xl text-center">
				<p>No PM2 processes found.</p>
				<p class="text-caption mt-sm">Start a PM2 process to see metrics here.</p>
			</div>
		{:else}
			<div class="space-y-lg">
				{#each processes as process (process.pm_id)}
					<div class="border-b border-hairline last:border-b-0 pb-lg last:pb-0">
						<!-- Process Header -->
						<div class="flex items-center justify-between mb-md">
							<div class="flex items-center gap-md">
								<StatusIndicator status={getStatusVariant(process.status)} />
								<div>
									<p class="text-body-strong text-ink">{process.name}</p>
									<p class="text-caption text-ink-muted-80">PM2 ID: {process.pm_id}</p>
								</div>
							</div>
							<a href="/projects/{process.pm_id}">
								<span class="text-caption text-action-blue hover:underline">View Details</span>
							</a>
						</div>

						<!-- Metrics Grid -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-md">
							<!-- CPU Metric -->
							<div>
								<div class="flex justify-between text-caption mb-xs">
									<span class="text-ink-muted-80">CPU Usage</span>
									<span class="text-ink font-medium">{process.cpu}%</span>
								</div>
								<div class="w-full bg-canvas-parchment rounded-full h-2.5">
									<div
										class="h-2.5 rounded-full transition-all duration-500 {getCpuBarColor(process.cpu)}"
										style="width: {Math.min(process.cpu, 100)}%"
									></div>
								</div>
							</div>

							<!-- RAM Metric -->
							<div>
								<div class="flex justify-between text-caption mb-xs">
									<span class="text-ink-muted-80">RAM Usage</span>
									<span class="text-ink font-medium">{process.memoryMB} MB</span>
								</div>
								<div class="w-full bg-canvas-parchment rounded-full h-2.5">
									<div
										class="h-2.5 rounded-full transition-all duration-500 {getRamBarColor(process.memoryMB)}"
										style="width: {Math.min((process.memoryMB / (8 * 1024)) * 100, 100)}%"
									></div>
								</div>
							</div>

							<!-- Uptime -->
							<div>
								<div class="flex justify-between text-caption mb-xs">
									<span class="text-ink-muted-80">Uptime</span>
									<span class="text-ink font-medium">{process.uptimeFormatted}</span>
								</div>
							</div>

							<!-- Status -->
							<div>
								<div class="flex justify-between text-caption mb-xs">
									<span class="text-ink-muted-80">Status</span>
									<span class="text-ink font-medium capitalize">{process.status}</span>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card>

	<!-- Auto-refresh indicator -->
	<div class="mt-lg text-center">
		<p class="text-caption text-ink-muted-80">
			Auto-refreshing every 10 seconds
		</p>
	</div>
</div>
