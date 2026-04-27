<script lang="ts">
	import { Card, Button, Badge, StatusIndicator } from '$lib/ui/components';
	import type { PageData } from './$types';

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

	function handleAction(pm_id: string, action: 'restart' | 'stop' | 'delete') {
		return () => {
			const form = document.createElement('form');
			form.method = 'POST';
			form.action = '?/' + action;

			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = 'pm_id';
			input.value = pm_id;
			form.appendChild(input);

			document.body.appendChild(form);
			form.submit();
		};
	}
</script>

<div class="max-w-6xl mx-auto">
	<div class="mb-xxl">
		<h1 class="text-hero-display tracking-negative-hero font-semibold text-ink mb-md">
			Projects
		</h1>
		<p class="text-lead text-ink-muted-80">
			Manage and monitor all your PM2 processes.
		</p>
	</div>

	{#if form?.error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-lg py-md rounded-lg mb-lg">
			{form.error}
		</div>
	{/if}

	{#if form?.success}
		<div class="bg-green-50 border border-green-200 text-green-700 px-lg py-md rounded-lg mb-lg">
			{form.message}
		</div>
	{/if}

	{#if processes.length === 0}
		<Card variant="light" padding={true} rounded="lg">
			<div class="text-center py-xxl">
				<p class="text-display-md font-semibold text-ink-muted-80 mb-md">No Processes Found</p>
				<p class="text-body text-ink-muted-80">
					PM2 is not running or no processes have been started.
				</p>
			</div>
		</Card>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg">
			{#each processes as process (process.pm_id)}
				<Card variant="light" padding={true} rounded="lg" class="hover:shadow-md transition-shadow">
					<!-- Header -->
					<div class="flex items-start justify-between mb-md">
						<div>
							<h3 class="text-body-strong text-ink mb-xs">{process.name}</h3>
							<Badge variant={getStatusVariant(process.status)}>
								{process.status}
							</Badge>
						</div>
						<StatusIndicator status={getStatusVariant(process.status)} />
					</div>

					<!-- Stats -->
					<div class="space-y-sm mb-lg">
						<div class="flex justify-between text-caption">
							<span class="text-ink-muted-80">CPU</span>
							<span class="text-ink font-medium">{process.cpu}%</span>
						</div>
						<div class="flex justify-between text-caption">
							<span class="text-ink-muted-80">RAM</span>
							<span class="text-ink font-medium">{process.memoryMB} MB</span>
						</div>
						<div class="flex justify-between text-caption">
							<span class="text-ink-muted-80">Uptime</span>
							<span class="text-ink font-medium">{process.uptimeFormatted}</span>
						</div>
						<div class="flex justify-between text-caption">
							<span class="text-ink-muted-80">PM2 ID</span>
							<span class="text-ink font-medium">{process.pm_id}</span>
						</div>
					</div>

					<!-- Actions -->
					<div class="flex gap-sm flex-wrap">
						<a href="/projects/{process.pm_id}">
							<Button variant="secondary" size="sm">View Details</Button>
						</a>

						{#if process.status === 'online'}
							<Button
								variant="ghost"
								size="sm"
								onclick={handleAction(process.pm_id.toString(), 'restart')}
							>
								Restart
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onclick={handleAction(process.pm_id.toString(), 'stop')}
							>
								Stop
							</Button>
						{:else if process.status === 'stopped'}
							<Button
								variant="ghost"
								size="sm"
								onclick={handleAction(process.pm_id.toString(), 'restart')}
							>
								Start
							</Button>
						{/if}

						<Button
							variant="danger"
							size="sm"
							onclick={handleAction(process.pm_id.toString(), 'delete')}
						>
							Delete
						</Button>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>
