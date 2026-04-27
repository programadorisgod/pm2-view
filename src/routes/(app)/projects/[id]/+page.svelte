<script lang="ts">
	import { Card, Button, Badge, StatusIndicator } from '$lib/ui/components';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let { process, logs } = $derived(data);

	let activeTab = $state('overview');

	function getStatusVariant(status: string) {
		switch (status) {
			case 'online': return 'online';
			case 'stopped': return 'stopped';
			case 'error': return 'error';
			default: return 'offline';
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	function handleAction(action: 'restart' | 'stop' | 'delete') {
		return () => {
			const form = document.createElement('form');
			form.method = 'POST';
			form.action = '/projects?/' + action;

			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = 'pm_id';
			input.value = process.pm_id.toString();
			form.appendChild(input);

			document.body.appendChild(form);
			form.submit();
		};
	}
</script>

<div class="max-w-6xl mx-auto">
	<!-- Back Button -->
	<div class="mb-lg">
		<a href="/projects">
			<Button variant="ghost" size="sm">← Back to Projects</Button>
		</a>
	</div>

	<!-- Project Header -->
	<div class="mb-xxl">
		<div class="flex items-center gap-md mb-md">
			<h1 class="text-hero-display tracking-negative-hero font-semibold text-ink">
				{process.name}
			</h1>
			<Badge variant={getStatusVariant(process.status)}>
				{process.status}
			</Badge>
		</div>
		<div class="flex items-center gap-lg text-caption text-ink-muted-80">
			<div class="flex items-center gap-2">
				<StatusIndicator status={getStatusVariant(process.status)} />
				<span class="capitalize">{process.status}</span>
			</div>
			<span>|</span>
			<span>PM2 ID: {process.pm_id}</span>
			<span>|</span>
			<span>Uptime: {process.uptimeFormatted}</span>
		</div>
	</div>

	<!-- Tabs -->
	<div class="border-b border-hairline mb-lg">
		<div class="flex gap-xl">
			<button
				class="py-md px-sm border-b-2 transition-colors {activeTab === 'overview' ? 'border-action-blue text-ink' : 'border-transparent text-ink-muted-80 hover:text-ink'}"
				onclick={() => (activeTab = 'overview')}
			>
				Overview
			</button>
			<button
				class="py-md px-sm border-b-2 transition-colors {activeTab === 'logs' ? 'border-action-blue text-ink' : 'border-transparent text-ink-muted-80 hover:text-ink'}"
				onclick={() => (activeTab = 'logs')}
			>
				Logs
			</button>
			<button
				class="py-md px-sm border-b-2 transition-colors {activeTab === 'env' ? 'border-action-blue text-ink' : 'border-transparent text-ink-muted-80 hover:text-ink'}"
				onclick={() => (activeTab = 'env')}
			>
				Environment
			</button>
		</div>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'overview'}
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-lg mb-xxl">
			<!-- Stats Cards -->
			<Card variant="light" padding={true} rounded="lg">
				<h3 class="text-caption-strong text-ink-muted-80 uppercase tracking-wider mb-sm">CPU Usage</h3>
				<p class="text-display-lg font-semibold text-ink">{process.cpu}%</p>
			</Card>

			<Card variant="light" padding={true} rounded="lg">
				<h3 class="text-caption-strong text-ink-muted-80 uppercase tracking-wider mb-sm">Memory</h3>
				<p class="text-display-lg font-semibold text-ink">{process.memoryMB} MB</p>
			</Card>

			<Card variant="light" padding={true} rounded="lg">
				<h3 class="text-caption-strong text-ink-muted-80 uppercase tracking-wider mb-sm">Restarts</h3>
				<p class="text-display-lg font-semibold text-ink">{process.pm2_env.restart_time}</p>
			</Card>
		</div>

		<!-- Detailed Info -->
		<Card variant="light" padding={true} rounded="lg" class="mb-xxl">
			<h2 class="text-display-md font-semibold text-ink mb-lg">Process Details</h2>
			<div class="space-y-md">
				<div class="flex justify-between py-sm border-b border-hairline">
					<span class="text-body text-ink-muted-80">Process Name</span>
					<span class="text-body-strong text-ink">{process.name}</span>
				</div>
				<div class="flex justify-between py-sm border-b border-hairline">
					<span class="text-body text-ink-muted-80">PM2 ID</span>
					<span class="text-body-strong text-ink">{process.pm_id}</span>
				</div>
				<div class="flex justify-between py-sm border-b border-hairline">
					<span class="text-body text-ink-muted-80">Status</span>
					<span class="text-body-strong text-ink capitalize">{process.status}</span>
				</div>
				<div class="flex justify-between py-sm border-b border-hairline">
					<span class="text-body text-ink-muted-80">CPU</span>
					<span class="text-body-strong text-ink">{process.cpu}%</span>
				</div>
				<div class="flex justify-between py-sm border-b border-hairline">
					<span class="text-body text-ink-muted-80">Memory</span>
					<span class="text-body-strong text-ink">{formatBytes(process.monit.memory)}</span>
				</div>
				<div class="flex justify-between py-sm border-b border-hairline">
					<span class="text-body text-ink-muted-80">Uptime</span>
					<span class="text-body-strong text-ink">{process.uptimeFormatted}</span>
				</div>
				<div class="flex justify-between py-sm border-b border-hairline">
					<span class="text-body text-ink-muted-80">Restart Count</span>
					<span class="text-body-strong text-ink">{process.pm2_env.restart_time}</span>
				</div>
			</div>
		</Card>

		<!-- Actions -->
		<Card variant="parchment" padding={true} rounded="lg">
			<h2 class="text-display-md font-semibold text-ink mb-lg">Actions</h2>
			<div class="flex gap-md flex-wrap">
				{#if process.status === 'online'}
					<Button variant="secondary" onclick={handleAction('restart')}>
						Restart Process
					</Button>
					<Button variant="secondary" onclick={handleAction('stop')}>
						Stop Process
					</Button>
				{:else if process.status === 'stopped'}
					<Button variant="secondary" onclick={handleAction('restart')}>
						Start Process
					</Button>
				{/if}
				<Button variant="danger" onclick={handleAction('delete')}>
					Delete Process
				</Button>
			</div>
		</Card>

	{:else if activeTab === 'logs'}
		<Card variant="light" padding={true} rounded="lg">
			<h2 class="text-display-md font-semibold text-ink mb-lg">Recent Logs</h2>
			{#if !logs || logs.length === 0}
				<p class="text-body text-ink-muted-80 py-lg text-center">
					No logs available.
				</p>
			{:else}
				<div class="bg-surface-black rounded-lg p-md font-mono text-caption text-on-dark overflow-x-auto max-h-96 overflow-y-auto">
					{#each logs as log}
						<div class="py-xs {log.type === 'err' ? 'text-red-400' : 'text-green-400'}">
							<span class="opacity-48">[{log.type}]</span> {log.data}
						</div>
					{/each}
				</div>
			{/if}
			<p class="text-caption text-ink-muted-80 mt-md">
				Note: Real-time logs will be available in Phase 5.
			</p>
		</Card>

	{:else if activeTab === 'env'}
		<Card variant="light" padding={true} rounded="lg">
			<h2 class="text-display-md font-semibold text-ink mb-lg">Environment Variables</h2>
			{#if process.pm2_env && 'env' in process.pm2_env && process.pm2_env.env}
				{@const envVars = Object.entries(process.pm2_env.env as Record<string, string>).filter(([key]) => !key.startsWith('npm_') && key !== 'PATH')}
				{#if envVars.length === 0}
					<p class="text-body text-ink-muted-80 py-lg text-center">
						No environment variables to display.
					</p>
				{:else}
					<div class="space-y-sm">
						{#each envVars as [key, value]}
							<div class="flex justify-between py-sm border-b border-hairline">
								<span class="text-body-strong text-ink">{key}</span>
								<span class="text-body text-ink-muted-80 font-mono text-caption">{value}</span>
							</div>
						{/each}
					</div>
				{/if}
			{:else}
				<p class="text-body text-ink-muted-80 py-lg text-center">
					No environment variables available.
				</p>
			{/if}
			<p class="text-caption text-ink-muted-80 mt-md">
				Note: Full environment variable management will be available in Phase 5.
			</p>
		</Card>
	{/if}
</div>
