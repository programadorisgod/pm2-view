	<script lang="ts">
	import { Card, StatusIndicator } from '$lib/ui/components';
	import { base } from '$app/paths';
	import type { PageData } from './$types';
	import type { ProcessWithStatus } from '$lib/pm2/pm2.types';
	import { createSSEClient } from '$lib/sse';
	import type { MetricsEvent } from '$lib/sse/types';

	let { data }: { data: PageData } = $props();

	const initialProcesses = data.processes ?? [];
	let processes = $state<ProcessWithStatus[]>(initialProcesses);
	let summary = $derived(data.summary);

	let sseClient: ReturnType<typeof createSSEClient> | null = null;

	$effect(() => {
		sseClient = createSSEClient(`${base}/api/sse`);

		sseClient.onMetrics((event: MetricsEvent) => {
			// Update the specific process metrics in the list
			processes = processes.map((p) =>
				p.pm_id.toString() === event.processId
					? { ...p, cpu: event.cpu, memoryMB: event.memoryMB, status: event.status as ProcessWithStatus['status'] }
					: p
			);
		});

		return () => {
			sseClient?.close();
			sseClient = null;
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

	function getBarColor(value: number, max: number = 100): string {
		const pct = (value / max) * 100;
		if (pct >= 80) return '#FF5252';
		if (pct >= 50) return '#FFB74D';
		return '#00E676';
	}

	function getBarBg(value: number, max: number = 100): string {
		const pct = (value / max) * 100;
		if (pct >= 80) return 'rgba(255, 82, 82, 0.15)';
		if (pct >= 50) return 'rgba(255, 183, 77, 0.15)';
		return 'rgba(0, 230, 118, 0.15)';
	}
</script>

<div class="max-w-5xl mx-auto">
	<!-- Header -->
	<div class="mb-xl">
		<h1 class="text-hero font-bold mb-xs" style="view-transition-name: page-title; color: var(--text-primary);">Metrics</h1>
		<p class="text-body-sm" style="color: var(--text-secondary);">Real-time performance metrics</p>
	</div>

	<!-- Summary Cards -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-md mb-xl">
		<div class="stagger-item" style="--stagger-index: 0;"><Card>
			<div class="flex items-start justify-between">
				<div>
					<p class="text-caption font-medium mb-1" style="color: var(--text-muted);">Total CPU</p>
					<p class="text-h1 font-bold" style="color: var(--text-primary);">{summary?.totalCpu?.toFixed(1) ?? 0}%</p>
				</div>
				<div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background: rgba(56, 205, 255, 0.08);">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #38CDFF;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
					</svg>
				</div>
			</div>
		</Card></div>

		<div class="stagger-item" style="--stagger-index: 1;"><Card>
			<div class="flex items-start justify-between">
				<div>
					<p class="text-caption font-medium mb-1" style="color: var(--text-muted);">Total RAM</p>
					<p class="text-h1 font-bold" style="color: var(--text-primary);">{summary?.totalRam ? Math.round(summary.totalRam / 1024 / 1024) + ' MB' : '0 MB'}</p>
				</div>
				<div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background: rgba(56, 205, 255, 0.08);">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #38CDFF;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/>
					</svg>
				</div>
			</div>
		</Card></div>

		<div class="stagger-item" style="--stagger-index: 2;"><Card>
			<div class="flex items-start justify-between">
				<div>
					<p class="text-caption font-medium mb-1" style="color: var(--text-muted);">Avg Uptime</p>
					<p class="text-h1 font-bold" style="color: var(--text-primary);">{summary?.avgUptime ?? 'N/A'}</p>
				</div>
				<div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background: rgba(56, 205, 255, 0.08);">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #38CDFF;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				</div>
			</div>
		</Card></div>

		<div class="stagger-item" style="--stagger-index: 3;"><Card>
			<div class="flex items-start justify-between">
				<div>
					<p class="text-caption font-medium mb-1" style="color: var(--text-muted);">Running</p>
					<p class="text-h1 font-bold" style="color: var(--text-primary);">{summary?.processesRunning ?? 0}<span class="text-body-sm" style="color: var(--text-muted);"> / {summary?.totalProcesses ?? 0}</span></p>
				</div>
				<StatusIndicator status="online" />
			</div>
		</Card></div>
	</div>

	<!-- Per-Process Metrics -->
	<Card>
		<h2 class="text-h3 font-semibold mb-md" style="color: var(--text-primary);">Process Metrics</h2>

		{#if !processes || processes.length === 0}
			<div class="text-center py-2xl">
				<p class="text-body" style="color: var(--text-secondary);">No PM2 processes found</p>
				<p class="text-caption mt-xs" style="color: var(--text-muted);">Start a PM2 process to see metrics here</p>
			</div>
		{:else}
			<div class="space-y-md">
				{#each processes as process, i (process.pm_id)}
					<div class="p-md rounded-lg stagger-item" style="--stagger-index: {i + 4}; background: var(--bg-surface); border: 1px solid var(--border-color);">
						<!-- Header -->
						<div class="flex items-center justify-between mb-md">
							<div class="flex items-center gap-md">
								<StatusIndicator status={getStatusVariant(process.status)} />
								<div>
									<p class="text-body-sm font-semibold" style="color: var(--text-primary);">{process.name}</p>
									<p class="text-caption" style="color: var(--text-muted);">PM2 ID: {process.pm_id}</p>
								</div>
							</div>
							<a href="{base}/projects/{process.pm_id}" class="text-caption font-medium" style="color: #38CDFF;">View Details</a>
						</div>

						<!-- Metrics -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-md">
							<!-- CPU -->
							<div>
								<div class="flex justify-between text-caption mb-xs">
									<span style="color: var(--text-muted);">CPU</span>
									<span class="font-medium" style="color: var(--text-primary);">{process.cpu}%</span>
								</div>
								<div class="w-full rounded-full h-2" style="background: var(--bg-base);">
									<div class="h-2 rounded-full transition-all duration-500" style="width: {Math.min(process.cpu, 100)}%; background: {getBarColor(process.cpu)};"></div>
								</div>
							</div>

							<!-- RAM -->
							<div>
								<div class="flex justify-between text-caption mb-xs">
									<span style="color: var(--text-muted);">RAM</span>
									<span class="font-medium" style="color: var(--text-primary);">{process.memoryMB} MB</span>
								</div>
								<div class="w-full rounded-full h-2" style="background: var(--bg-base);">
									<div class="h-2 rounded-full transition-all duration-500" style="width: {Math.min((process.memoryMB / (8 * 1024)) * 100, 100)}%; background: {getBarColor(process.memoryMB, 8 * 1024)};"></div>
								</div>
							</div>

							<!-- Uptime -->
							<div>
								<div class="flex justify-between text-caption">
									<span style="color: var(--text-muted);">Uptime</span>
									<span class="font-medium" style="color: var(--text-primary);">{process.uptimeFormatted}</span>
								</div>
							</div>

							<!-- Status -->
							<div>
								<div class="flex justify-between text-caption">
									<span style="color: var(--text-muted);">Status</span>
									<span class="font-medium capitalize" style="color: var(--text-primary);">{process.status}</span>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card>
</div>
