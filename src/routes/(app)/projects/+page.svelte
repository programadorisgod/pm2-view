	<script lang="ts">
	import { Card, Badge, Button } from '$lib/ui/components';
	import { base } from '$app/paths';
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';

	let { data, form }: { data: PageData; form: { success?: boolean; message?: string; error?: string } | null } = $props();

	let processes = $derived(data.processes ?? []);

	function getStatusVariant(status: string) {
		switch (status) {
			case 'online': return 'online';
			case 'stopped': return 'stopped';
			case 'error': return 'error';
			default: return 'offline';
		}
	}

	async function handleAction(pm_id: string, action: 'restart' | 'stop' | 'delete') {
		const res = await fetch(`${base}/projects?/${action}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: `pm_id=${encodeURIComponent(pm_id)}`
		});
		if (res.ok) {
			await invalidateAll();
		}
	}
</script>

<div class="max-w-6xl mx-auto">
	<!-- Header -->
	<div class="mb-xl">
		<h1 class="text-hero font-bold mb-xs" style="view-transition-name: page-title; color: var(--text-primary);">Projects</h1>
		<p class="text-body-sm" style="color: var(--text-secondary);">Manage and monitor all your PM2 processes</p>
	</div>

	{#if form?.error}
		<div class="rounded-md p-sm mb-lg text-body-sm" style="background: rgba(255, 82, 82, 0.1); color: #FF5252; border: 1px solid rgba(255, 82, 82, 0.2);">
			{form.error}
		</div>
	{/if}

	{#if form?.success}
		<div class="rounded-md p-sm mb-lg text-body-sm" style="background: rgba(0, 230, 118, 0.1); color: #00E676; border: 1px solid rgba(0, 230, 118, 0.2);">
			{form.message}
		</div>
	{/if}

	{#if processes.length === 0}
		<Card>
			<div class="text-center py-2xl">
				<p class="text-h3 font-semibold mb-xs" style="color: var(--text-secondary);">No Processes Found</p>
				<p class="text-body-sm" style="color: var(--text-muted);">PM2 is not running or no processes have been started</p>
			</div>
		</Card>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
			{#each processes as process, i (process.pm_id)}
				<div class="stagger-item" style="--stagger-index: {i};">
					<Card class="group">
					<!-- Header -->
					<div class="flex items-start justify-between mb-md">
						<div>
							<h3 class="text-body-sm font-semibold mb-xs" style="color: var(--text-primary);">{process.name}</h3>
							<Badge variant={getStatusVariant(process.status)}>
								{process.status}
							</Badge>
						</div>
					</div>

					<!-- Stats -->
					<div class="space-y-xs mb-lg">
						<div class="flex justify-between text-caption">
							<span style="color: var(--text-muted);">CPU</span>
							<span class="font-medium" style="color: var(--text-primary);">{process.cpu}%</span>
						</div>
						<div class="flex justify-between text-caption">
							<span style="color: var(--text-muted);">RAM</span>
							<span class="font-medium" style="color: var(--text-primary);">{process.memoryMB} MB</span>
						</div>
						<div class="flex justify-between text-caption">
							<span style="color: var(--text-muted);">Uptime</span>
							<span class="font-medium" style="color: var(--text-primary);">{process.uptimeFormatted}</span>
						</div>
					</div>

					<!-- Actions -->
					<div class="flex gap-xs flex-wrap">
						<a href="{base}/projects/{process.pm_id}" class="btn-secondary px-3 py-1 text-caption flex-1 text-center">
							Details
						</a>

						{#if process.status === 'online'}
							<button class="btn-secondary px-3 py-1 text-caption" onclick={() => handleAction(process.pm_id.toString(), 'restart')}>
								Restart
							</button>
							<button class="btn-secondary px-3 py-1 text-caption" onclick={() => handleAction(process.pm_id.toString(), 'stop')}>
								Stop
							</button>
						{:else if process.status === 'stopped'}
							<button class="btn-secondary px-3 py-1 text-caption" onclick={() => handleAction(process.pm_id.toString(), 'restart')}>
								Start
							</button>
						{/if}

						<button class="btn-danger px-3 py-1 text-caption" onclick={() => handleAction(process.pm_id.toString(), 'delete')}>
							Delete
						</button>
					</div>
				</Card>
				</div>
			{/each}
		</div>
	{/if}
</div>
