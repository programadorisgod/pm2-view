	<script lang="ts">
	import { Card, Badge, StatusIndicator, ConfirmDeleteModal, FeedbackBanner } from '$lib/ui/components';
	import { base } from '$app/paths';
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let { process, logs: initialLogs, envVars: initialEnvVars } = $derived(data);

	let activeTab = $state('overview');
	let feedback = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let deleteModal = $state({ open: false });

	let logs = $state<Array<{ type: 'out' | 'err'; data: string; timestamp: Date }>>([]);

	$effect(() => {
		if (initialLogs && initialLogs.length > 0) {
			logs = initialLogs;
		}
	});

	// Derived: split logs by type (repository already sorts chronologically)
	let outLogs = $derived(logs.filter(l => l.type === 'out'));
	let errLogs = $derived(logs.filter(l => l.type === 'err'));

	// Independent scroll state per panel
	let outContainer: HTMLDivElement | undefined = $state();
	let errContainer: HTMLDivElement | undefined = $state();
	let autoScrollOut = $state(true);
	let autoScrollErr = $state(true);

	let envVars = $state<Array<{ key: string; value: string; isNew?: boolean }>>([]);

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

	async function handleAction(action: 'restart' | 'stop') {
		feedback = null;
		try {
			const res = await fetch(`${base}/projects/api?action=${action}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pm_id: process.pm_id.toString() })
			});
			const result = await res.json();
			if (res.ok) {
				feedback = { type: 'success', text: result.message || `${action} successful` };
				await invalidateAll();
			} else {
				feedback = { type: 'error', text: result.error || `${action} failed` };
			}
		} catch {
			feedback = { type: 'error', text: `Failed to ${action}` };
		}
	}

	function requestDelete() {
		deleteModal.open = true;
	}

	async function confirmDelete() {
		deleteModal.open = false;
		feedback = null;
		try {
			const res = await fetch(`${base}/projects/api?action=delete`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pm_id: process.pm_id.toString() })
			});
			const result = await res.json();
			if (res.ok) {
				feedback = { type: 'success', text: result.message || 'Delete successful' };
				goto(`${base}/projects`);
			} else {
				feedback = { type: 'error', text: result.error || 'Delete failed' };
			}
		} catch {
			feedback = { type: 'error', text: 'Failed to delete' };
		}
	}

	// Real-time logs polling
	$effect(() => {
		if (activeTab !== 'logs') return;

		const interval = setInterval(async () => {
			try {
				const res = await fetch(`${base}/projects/${process.pm_id}/logs?lines=100`);
				const data = await res.json();
				if (data.success && data.logs) {
					logs = data.logs;
					// Auto-scroll both panels independently
					if (autoScrollOut && outContainer) {
						setTimeout(() => { if (outContainer) outContainer.scrollTop = outContainer.scrollHeight; }, 0);
					}
					if (autoScrollErr && errContainer) {
						setTimeout(() => { if (errContainer) errContainer.scrollTop = errContainer.scrollHeight; }, 0);
					}
				}
		} catch (error) {
			// Failed to fetch logs - silently ignore for polling
		}
		}, 3000);

		return () => clearInterval(interval);
	});

	function handleOutScroll(e: Event) {
		const target = e.target as HTMLDivElement;
		const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
		autoScrollOut = isNearBottom;
	}

	function handleErrScroll(e: Event) {
		const target = e.target as HTMLDivElement;
		const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
		autoScrollErr = isNearBottom;
	}

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

<div class="max-w-5xl mx-auto">
	<!-- Back Button -->
	<div class="mb-lg">
		<a href="{base}/projects" class="btn-secondary px-3 py-1.5 text-caption inline-flex items-center gap-1.5">
			<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
			Back
		</a>
	</div>

	{#if feedback}
		<FeedbackBanner type={feedback.type} message={feedback.text} />
	{/if}

	<!-- Project Header -->
	<div class="flex items-start justify-between mb-xl">
		<div>
			<div class="flex items-center gap-md mb-sm">
				<h1 class="text-hero font-bold process-name" style="view-transition-name: page-title; color: var(--text-primary);">{process.name}</h1>
				<Badge variant={getStatusVariant(process.status)}>{process.status}</Badge>
			</div>
			<div class="flex items-center gap-md text-caption" style="color: var(--text-muted);">
				<span>PM2 ID: {process.pm_id}</span>
				<span>·</span>
				<span>Uptime: {process.uptimeFormatted}</span>
			</div>
		</div>

		<div class="flex gap-xs">
			{#if process.status === 'online'}
				<button class="btn-secondary px-3 py-1.5 text-caption" onclick={() => handleAction('restart')}>Restart</button>
				<button class="btn-secondary px-3 py-1.5 text-caption" onclick={() => handleAction('stop')}>Stop</button>
			{:else if process.status === 'stopped'}
				<button class="btn-secondary px-3 py-1.5 text-caption" onclick={() => handleAction('restart')}>Start</button>
			{/if}
			<button class="btn-danger px-3 py-1.5 text-caption" onclick={requestDelete}>Delete</button>
		</div>
	</div>

	<!-- Tabs -->
	<div class="flex gap-xs mb-lg" style="border-bottom: 1px solid var(--border-color);">
		{#each ['overview', 'logs', 'env'] as tab}
			<button
				class="px-md py-sm text-caption font-medium transition-colors border-b-2"
				style="border-color: {activeTab === tab ? '#38CDFF' : 'transparent'}; color: {activeTab === tab ? '#38CDFF' : 'var(--text-muted)'};"
				onclick={() => (activeTab = tab)}
			>
				{tab === 'env' ? 'Environment' : tab.charAt(0).toUpperCase() + tab.slice(1)}
			</button>
		{/each}
	</div>

	<!-- Tab Content -->
	{#key activeTab}
		<div class="tab-content">
			{#if activeTab === 'overview'}
		<!-- Stats -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-md mb-xl">
			<div class="stagger-item" style="--stagger-index: 0;"><Card>
				<p class="text-caption font-medium mb-1" style="color: var(--text-muted);">CPU Usage</p>
				<p class="text-h1 font-bold" style="color: var(--text-primary);">{process.cpu}%</p>
			</Card></div>
			<div class="stagger-item" style="--stagger-index: 1;"><Card>
				<p class="text-caption font-medium mb-1" style="color: var(--text-muted);">Memory</p>
				<p class="text-h1 font-bold" style="color: var(--text-primary);">{process.memoryMB} MB</p>
			</Card></div>
			<div class="stagger-item" style="--stagger-index: 2;"><Card>
				<p class="text-caption font-medium mb-1" style="color: var(--text-muted);">Restarts</p>
				<p class="text-h1 font-bold" style="color: var(--text-primary);">{process.pm2_env.restart_time}</p>
			</Card></div>
		</div>

		<!-- Details -->
		<Card>
			<h2 class="text-h3 font-semibold mb-md" style="color: var(--text-primary);">Process Details</h2>
			<div class="space-y-xs">
				{#each [
					['Process Name', process.name],
					['PM2 ID', process.pm_id.toString()],
					['Status', process.status],
					['CPU', process.cpu + '%'],
					['Memory', formatBytes(process.monit.memory)],
					['Uptime', process.uptimeFormatted],
					['Restart Count', process.pm2_env.restart_time.toString()]
				] as [label, value]}
					<div class="flex justify-between py-sm px-md rounded-md" style="border-bottom: 1px solid var(--border-color);">
						<span class="text-body-sm" style="color: var(--text-muted);">{label}</span>
						<span class="text-body-sm font-medium" style="color: var(--text-primary);">{value}</span>
					</div>
				{/each}
			</div>
		</Card>

	{:else if activeTab === 'logs'}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-md">
			<!-- OUT Panel -->
			<Card>
				<div class="flex items-center justify-between mb-md">
					<h2 class="text-h3 font-semibold" style="color: #00E676;">
						<span class="inline-block w-2 h-2 rounded-full mr-2" style="background: #00E676;"></span>
						OUT
					</h2>
					<label class="flex items-center gap-xs text-caption cursor-pointer" style="color: var(--text-muted);">
						<input type="checkbox" checked={autoScrollOut} onchange={(e) => (autoScrollOut = (e.target as HTMLInputElement).checked)} class="rounded" />
						Auto-scroll
					</label>
				</div>
				{#if outLogs.length === 0}
					<p class="text-center py-xl" style="color: var(--text-muted);">No output logs</p>
				{:else}
					<div
						bind:this={outContainer}
						onscroll={handleOutScroll}
						class="rounded-lg p-md font-mono text-code overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin"
						style="background: var(--bg-base); border: 1px solid var(--border-color);"
					>
						{#each outLogs as log}
							<div class="py-2xs" style="color: #00E676;">
								{log.data}
							</div>
						{/each}
					</div>
				{/if}
			</Card>

			<!-- ERRORS Panel -->
			<Card>
				<div class="flex items-center justify-between mb-md">
					<h2 class="text-h3 font-semibold" style="color: #FF5252;">
						<span class="inline-block w-2 h-2 rounded-full mr-2" style="background: #FF5252;"></span>
						ERRORS
					</h2>
					<label class="flex items-center gap-xs text-caption cursor-pointer" style="color: var(--text-muted);">
						<input type="checkbox" checked={autoScrollErr} onchange={(e) => (autoScrollErr = (e.target as HTMLInputElement).checked)} class="rounded" />
						Auto-scroll
					</label>
				</div>
				{#if errLogs.length === 0}
					<p class="text-center py-xl" style="color: var(--text-muted);">No error logs</p>
				{:else}
					<div
						bind:this={errContainer}
						onscroll={handleErrScroll}
						class="rounded-lg p-md font-mono text-code overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin"
						style="background: var(--bg-base); border: 1px solid var(--border-color);"
					>
						{#each errLogs as log}
							<div class="py-2xs" style="color: #FF5252;">
								{log.data}
							</div>
						{/each}
					</div>
				{/if}
			</Card>
		</div>

	{:else if activeTab === 'env'}
		<Card>
			<h2 class="text-h3 font-semibold mb-md" style="color: var(--text-primary);">Environment Variables</h2>

		{#if saveMessage}
			<FeedbackBanner type={saveMessage.type} message={saveMessage.text} />
		{/if}

			<!-- Add new -->
			<div class="mb-md p-md rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
				<h3 class="text-caption font-medium mb-sm" style="color: var(--text-secondary);">Add New Variable</h3>
				<div class="flex gap-sm flex-wrap">
					<input type="text" bind:value={newKey} placeholder="Key (e.g., API_KEY)" class="input-base flex-1 min-w-[180px] h-9 px-md text-code text-body-sm" />
					<input type="text" bind:value={newValue} placeholder="Value" class="input-base flex-1 min-w-[180px] h-9 px-md text-code text-body-sm" />
					<button class="btn-secondary px-3 py-1.5 text-caption" onclick={addEnvVar} disabled={!newKey.trim()}>Add</button>
				</div>
			</div>

			<!-- List -->
			{#if envVars.length === 0}
				<p class="text-center py-xl" style="color: var(--text-muted);">No environment variables configured</p>
			{:else}
				<div class="space-y-xs mb-lg">
					{#each envVars as env, index (env.key)}
						<div class="flex items-center gap-sm py-sm px-md rounded-md" style="background: var(--bg-surface);">
							<span class="text-body-sm font-medium min-w-[160px] font-mono" style="color: var(--text-primary);">{env.key}</span>
							<div class="flex-1 font-mono text-body-sm">
								{#if isSensitiveKey(env.key)}
									<span style="color: var(--text-muted);">
										{showSecrets[env.key] ? env.value : '••••••••••••'}
									</span>
									<button onclick={() => toggleSecret(env.key)} class="ml-sm text-caption font-medium" style="color: #38CDFF;">
										{showSecrets[env.key] ? 'Hide' : 'Show'}
									</button>
								{:else}
									<input type="text" value={env.value} oninput={(e) => updateEnvVar(index, 'value', (e.target as HTMLInputElement).value)} class="input-base w-full h-8 px-sm text-code text-body-sm" />
								{/if}
							</div>
							<button onclick={() => removeEnvVar(index)} class="w-6 h-6 rounded flex items-center justify-center transition-colors" style="color: #FF5252;" title="Remove">
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<div class="flex items-center gap-md">
				<button class="btn-primary px-4 py-2 text-body-sm" onclick={saveEnvVars} disabled={saving || envVars.length === 0}>
					{saving ? 'Saving...' : 'Save & Restart'}
				</button>
				<p class="text-caption" style="color: var(--text-muted);">Saving will restart the process</p>
			</div>
		</Card>
		{/if}
		</div>
	{/key}
</div>

<ConfirmDeleteModal
	open={deleteModal.open}
	itemName={process.name}
	onConfirm={confirmDelete}
	onCancel={() => { deleteModal.open = false; }}
/>
