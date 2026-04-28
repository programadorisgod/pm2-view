<script lang="ts">
	import { Card, Button, Badge, StatusIndicator } from '$lib/ui/components';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let { process, logs: initialLogs, envVars: initialEnvVars } = $derived(data);

	let activeTab = $state('overview');

	// Logs state - initialize from data, but allow updates
	let logs = $state<Array<{ type: 'out' | 'err'; data: string; timestamp: Date }>>([]);

	// Initialize logs when data changes
	$effect(() => {
		if (initialLogs && initialLogs.length > 0) {
			logs = initialLogs;
		}
	});
	let logsContainer: HTMLDivElement | undefined = $state();
	let autoScroll = $state(true);

	// Environment variables state - initialize from data, but allow updates
	let envVars = $state<Array<{ key: string; value: string; isNew?: boolean }>>([]);

	// Initialize env vars when data changes
	$effect(() => {
		if (initialEnvVars && Object.keys(initialEnvVars).length > 0) {
			envVars = Object.entries(initialEnvVars).map(([key, value]) => ({
				key,
				value: value as string
			}));
		}
	});
	let newKey = $state('');
	let newValue = $state('');
	let showSecrets = $state<Record<string, boolean>>({});
	let saving = $state(false);
	let saveMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let formElement: HTMLFormElement | undefined = $state();

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

	// Real-time logs polling
	$effect(() => {
		if (activeTab !== 'logs') return;

		const interval = setInterval(async () => {
			try {
				const res = await fetch(`/projects/${process.pm_id}/logs?lines=100`);
				const data = await res.json();
				if (data.success && data.logs) {
					logs = data.logs;
					// Auto-scroll to bottom if enabled
					if (autoScroll && logsContainer) {
						setTimeout(() => {
							if (logsContainer) {
								logsContainer.scrollTop = logsContainer.scrollHeight;
							}
						}, 0);
					}
				}
			} catch (error) {
				console.error('Failed to fetch logs:', error);
			}
		}, 3000);

		return () => clearInterval(interval);
	});

	// Scroll handler to detect if user scrolled up
	function handleLogsScroll(e: Event) {
		const target = e.target as HTMLDivElement;
		const threshold = 50; // pixels from bottom
		const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
		autoScroll = isNearBottom;
	}

	// Environment variables functions
	function isSensitiveKey(key: string): boolean {
		const sensitivePatterns = ['PASSWORD', 'SECRET', 'TOKEN', 'KEY', 'API', 'AUTH'];
		return sensitivePatterns.some(pattern => key.toUpperCase().includes(pattern));
	}

	function toggleSecret(key: string) {
		showSecrets = { ...showSecrets, [key]: !showSecrets[key] };
	}

	function addEnvVar() {
		if (!newKey.trim()) return;
		envVars = [...envVars, { key: newKey.trim(), value: newValue, isNew: true }];
		newKey = '';
		newValue = '';
	}

	function removeEnvVar(index: number) {
		envVars = envVars.filter((_, i) => i !== index);
	}

	function updateEnvVar(index: number, field: 'key' | 'value', newValue: string) {
		envVars = envVars.map((env, i) =>
			i === index ? { ...env, [field]: newValue } : env
		);
	}

	async function saveEnvVars() {
		saving = true;
		saveMessage = null;

		try {
			const envVarsObj = Object.fromEntries(
				envVars.map(({ key, value }) => [key, value])
			);

			const formData = new FormData();
			formData.append('envVars', JSON.stringify(envVarsObj));

			const res = await fetch(`?/saveEnv`, {
				method: 'POST',
				body: formData
			});

			const result = await res.json();

			if (result.success) {
				saveMessage = { type: 'success', text: result.message || 'Environment variables saved successfully' };
			} else {
				saveMessage = { type: 'error', text: result.error || 'Failed to save environment variables' };
			}
		} catch (error) {
			saveMessage = {
				type: 'error',
				text: error instanceof Error ? error.message : 'Failed to save environment variables'
			};
		} finally {
			saving = false;
		}
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
			<div class="flex items-center justify-between mb-lg">
				<h2 class="text-display-md font-semibold text-ink">Real-time Logs</h2>
				<div class="flex items-center gap-sm">
					<label class="flex items-center gap-xs text-caption text-ink-muted-80 cursor-pointer">
						<input
							type="checkbox"
							checked={autoScroll}
							onchange={(e) => (autoScroll = (e.target as HTMLInputElement).checked)}
							class="rounded border-hairline"
						/>
						Auto-scroll
					</label>
				</div>
			</div>
			{#if !logs || logs.length === 0}
				<p class="text-body text-ink-muted-80 py-lg text-center">
					No logs available.
				</p>
			{:else}
				<div
					bind:this={logsContainer}
					onscroll={handleLogsScroll}
					class="bg-surface-black rounded-lg p-md font-mono text-caption text-on-dark overflow-x-auto max-h-96 overflow-y-auto"
				>
					{#each logs as log}
						<div class="py-xs {log.type === 'err' ? 'text-red-400' : 'text-green-400'}">
							<span class="opacity-48">[{log.type}]</span> {log.data}
						</div>
					{/each}
				</div>
			{/if}
			<p class="text-caption text-ink-muted-80 mt-md">
				Polling every 3 seconds. {autoScroll ? 'Auto-scrolling enabled.' : 'Auto-scroll disabled.'}
			</p>
		</Card>

	{:else if activeTab === 'env'}
		<Card variant="light" padding={true} rounded="lg">
			<div class="flex items-center justify-between mb-lg">
				<h2 class="text-display-md font-semibold text-ink">Environment Variables</h2>
			</div>

			{#if saveMessage}
				<div
					class="{saveMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'} border px-lg py-md rounded-lg mb-lg"
				>
					{saveMessage.text}
				</div>
			{/if}

			<!-- Add new env var -->
			<div class="mb-lg p-md bg-canvas-parchment rounded-lg">
				<h3 class="text-caption-strong text-ink-muted-80 uppercase tracking-wider mb-md">Add New Variable</h3>
				<div class="flex gap-sm flex-wrap">
					<input
						type="text"
						bind:value={newKey}
						placeholder="Key (e.g., API_KEY)"
						class="flex-1 min-w-[200px] px-md py-sm border border-hairline rounded-md text-body font-mono text-caption"
					/>
					<input
						type="text"
						bind:value={newValue}
						placeholder="Value"
						class="flex-1 min-w-[200px] px-md py-sm border border-hairline rounded-md text-body font-mono text-caption"
					/>
					<Button variant="secondary" size="sm" onclick={addEnvVar} disabled={!newKey.trim()}>
						Add
					</Button>
				</div>
			</div>

			<!-- Env vars list -->
			{#if envVars.length === 0}
				<p class="text-body text-ink-muted-80 py-lg text-center">
					No environment variables configured.
				</p>
			{:else}
				<div class="space-y-sm mb-lg">
					{#each envVars as env, index (env.key)}
						<div class="flex items-center gap-sm py-sm border-b border-hairline">
							<span class="text-body-strong text-ink min-w-[200px] font-mono text-caption">{env.key}</span>
							<div class="flex-1 font-mono text-caption">
								{#if isSensitiveKey(env.key)}
									<span class="text-ink-muted-80">
										{showSecrets[env.key] ? env.value : '••••••••••••'}
									</span>
									<button
										onclick={() => toggleSecret(env.key)}
										class="ml-sm text-action-blue hover:underline text-caption"
									>
										{showSecrets[env.key] ? 'Hide' : 'Show'}
									</button>
								{:else}
									<input
										type="text"
										value={env.value}
										oninput={(e) => updateEnvVar(index, 'value', (e.target as HTMLInputElement).value)}
										class="w-full px-sm py-xs border border-hairline rounded-md text-body font-mono text-caption"
									/>
								{/if}
							</div>
							<button
								onclick={() => removeEnvVar(index)}
								class="text-red-500 hover:text-red-700 text-caption"
								title="Remove"
							>
								✕
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Save button -->
			<div class="flex items-center gap-md">
				<Button variant="primary" onclick={saveEnvVars} disabled={saving || envVars.length === 0}>
					{saving ? 'Saving...' : 'Save & Restart'}
				</Button>
				<p class="text-caption text-ink-muted-80">
					Saving will restart the process with updated environment variables.
				</p>
			</div>
		</Card>
	{/if}
</div>
