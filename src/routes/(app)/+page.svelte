<script lang="ts">
	import { Card, Button, StatusIndicator, Badge } from '$lib/ui/components';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let { processes, summary } = $derived(data);

	let stats = $derived([
		{ label: 'Total Projects', value: summary?.total ?? 0, status: 'online' as const },
		{ label: 'Running', value: summary?.running ?? 0, status: 'online' as const },
		{ label: 'Stopped', value: summary?.stopped ?? 0, status: 'stopped' as const },
		{ label: 'Errors', value: summary?.errored ?? 0, status: 'error' as const }
	]);

	let quickLinks = [
		{ label: 'View All Projects', href: '/projects' },
		{ label: 'View Metrics', href: '/metrics' },
		{ label: 'Add New Project', href: '#', disabled: true }
	];

	function getStatusVariant(status: string) {
		switch (status) {
			case 'online': return 'online';
			case 'stopped': return 'stopped';
			case 'error': return 'error';
			default: return 'offline';
		}
	}
</script>

<div class="max-w-6xl mx-auto">
	<div class="mb-xxl">
		<h1 class="text-hero-display tracking-negative-hero font-semibold text-ink mb-md">
			Welcome Back
		</h1>
		<p class="text-lead text-ink-muted-80">
			Monitor and manage your PM2 processes with ease.
		</p>
	</div>

	<!-- Summary Cards -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-lg mb-xxl">
		{#each stats as stat}
			<Card variant="light" padding={true} rounded="lg">
				<div class="flex items-start justify-between mb-sm">
					<span class="text-caption-strong text-ink-muted-80 uppercase tracking-wider">
						{stat.label}
					</span>
					<StatusIndicator status={stat.status} />
				</div>
				<p class="text-display-lg font-semibold text-ink">
					{stat.value}
				</p>
			</Card>
		{/each}
	</div>

	<!-- Process List -->
	<Card variant="light" padding={true} rounded="lg" class="mb-xxl">
		<h2 class="text-display-md font-semibold text-ink mb-lg">Processes</h2>

		{#if !processes || processes.length === 0}
			<div class="text-body text-ink-muted-80 py-xl text-center">
				<p>No PM2 processes found.</p>
				<p class="text-caption mt-sm">Start a PM2 process to see it here.</p>
			</div>
		{:else}
			<div class="space-y-md">
				{#each processes as process (process.pm_id)}
					<div class="flex items-center justify-between p-md border-b border-hairline last:border-b-0">
						<div class="flex items-center gap-md">
							<StatusIndicator status={getStatusVariant(process.status)} />
							<div>
								<p class="text-body-strong text-ink">{process.name}</p>
								<p class="text-caption text-ink-muted-80">
									CPU: {process.cpu}% | RAM: {process.memoryMB}MB | Uptime: {process.uptimeFormatted}
								</p>
							</div>
						</div>
						<a href="/projects/{process.pm_id}">
							<Button variant="secondary" size="sm">View</Button>
						</a>
					</div>
				{/each}
			</div>
		{/if}
	</Card>

	<!-- Quick Links -->
	<Card variant="parchment" padding={true} rounded="lg" class="mb-xxl">
		<h2 class="text-display-md font-semibold text-ink mb-lg">Quick Links</h2>
		<div class="flex flex-wrap gap-md">
			{#each quickLinks as link}
				{#if link.disabled}
					<Button variant="primary" disabled>{link.label}</Button>
				{:else}
					<a href={link.href}>
						<Button variant="primary">{link.label}</Button>
					</a>
				{/if}
			{/each}
		</div>
	</Card>
</div>
