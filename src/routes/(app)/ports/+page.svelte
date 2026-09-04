<script lang="ts">
	import { Card, PortConfirmModal } from '$lib/ui/components';
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let ports = $derived(data.ports ?? []);
	let summary = $derived(data.summary);
	let searchQuery = $state('');

	let loading = $state(false);
	let modalOpen = $state(false);
	let selectedPort = $state<number>(0);
	let selectedPid = $state<number | null>(null);
	let selectedProcess = $state<string | null>(null);

	let feedback = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	let stats = $derived([
		{ label: 'Total', value: summary?.total ?? 0, icon: 'M4 6a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z' },
		{ label: 'TCP', value: summary?.tcpCount ?? 0, color: '#0070F3', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
		{ label: 'UDP', value: summary?.udpCount ?? 0, color: '#FFB74D', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
		{ label: 'Listening', value: summary?.listeningCount ?? 0, color: '#00E676', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' }
	]);

	let filteredPorts = $derived(
		searchQuery.trim()
			? ports.filter((p) => {
					const q = searchQuery.toLowerCase();
					return (
						String(p.port).includes(q) ||
						(p.processName?.toLowerCase().includes(q) ?? false) ||
						p.address.toLowerCase().includes(q) ||
						p.protocol.includes(q)
					);
				})
			: ports
	);

	async function handleFree(port: number, pid: number | null, processName: string | null) {
		selectedPort = port;
		selectedPid = pid;
		selectedProcess = processName;
		feedback = null;
		loading = true;

		try {
			const res = await fetch(`${base}/api/ports/kill`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ port, pid, processName })
			});

			const result = await res.json();

			if (res.ok && result.success) {
				modalOpen = true;
			} else {
				feedback = { type: 'error', text: result.error || 'Failed to send verification code' };
			}
		} catch {
			feedback = { type: 'error', text: 'Failed to send verification code' };
		} finally {
			loading = false;
		}
	}

	async function handleConfirmKill(code: string) {
		loading = true;
		feedback = null;

		try {
			const res = await fetch(`${base}/api/ports/confirm`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});

			const result = await res.json();

			if (res.ok && result.success) {
				feedback = { type: 'success', text: result.message };
				modalOpen = false;
				await invalidateAll();
			} else {
				feedback = { type: 'error', text: result.error || 'Verification failed' };
			}
		} catch {
			feedback = { type: 'error', text: 'Verification failed' };
		} finally {
			loading = false;
		}
	}

	function getProtocolColor(protocol: string): string {
		return protocol === 'tcp' ? '#0070F3' : '#FFB74D';
	}

	function getStateColor(state: string): string {
		if (state === 'LISTEN') return '#00E676';
		if (state === 'ESTABLISHED') return '#0070F3';
		return '#666666';
	}
</script>

<div class="max-w-5xl mx-auto">
	<!-- Header -->
	<div class="flex items-center justify-between mb-xl">
		<div>
			<h1 class="text-hero font-bold mb-xs" style="view-transition-name: page-title; color: var(--text-primary);">Port Manager</h1>
			<p class="text-body-sm" style="color: var(--text-secondary);">Monitor and free ports currently in use</p>
		</div>
		<button
			class="btn-secondary px-4 py-2 text-body-sm inline-flex items-center gap-2"
			onclick={() => invalidateAll()}
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
			</svg>
			Refresh
		</button>
	</div>

	<!-- Feedback banner -->
	{#if feedback}
		<div class="mb-lg">
			<div
				class="flex items-center gap-md p-md rounded-lg"
				style="background: {feedback.type === 'success' ? 'rgba(0, 230, 118, 0.08)' : 'rgba(255, 91, 79, 0.08)'}; border: 1px solid {feedback.type === 'success' ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 91, 79, 0.2)'};"
			>
				{#if feedback.type === 'success'}
					<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #00E676;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				{:else}
					<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FF5B4F;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				{/if}
				<p class="text-body-sm" style="color: {feedback.type === 'success' ? '#00E676' : '#FF5B4F'};">{feedback.text}</p>
				<button
					class="ml-auto"
					onclick={() => (feedback = null)}
					style="color: var(--text-muted);"
					aria-label="Dismiss"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</button>
			</div>
		</div>
	{/if}

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
						<div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background: {stat.color ? `${stat.color}15` : 'rgba(0, 112, 243, 0.08)'};">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: {stat.color || '#0070F3'};">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={stat.icon}/>
							</svg>
						</div>
					</div>
				</Card>
			</div>
		{/each}
	</div>

	<!-- Port List -->
	<Card>
		<div class="flex items-center justify-between mb-md">
			<h2 class="text-h3 font-semibold" style="color: var(--text-primary);">Ports in Use</h2>
			{#if ports.length > 0}
				<span class="text-caption" style="color: var(--text-muted);">{filteredPorts.length} of {ports.length}</span>
			{/if}
		</div>

		<!-- Search -->
		{#if ports.length > 0}
			<div class="relative mb-md">
				<svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--text-muted);">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
				</svg>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search by port, process, or address..."
					class="input-base w-full h-10 pl-10 pr-md text-body-sm"
				/>
			</div>
		{/if}

		{#if !ports || ports.length === 0}
			<div class="text-center py-2xl">
				<div class="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-md" style="background: rgba(0, 230, 118, 0.1);">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #00E676;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
					</svg>
				</div>
				<p class="text-body" style="color: var(--text-secondary);">No ports in use</p>
				<p class="text-caption mt-xs" style="color: var(--text-muted);">The system has no listening ports</p>
			</div>
		{:else if filteredPorts.length === 0}
			<div class="text-center py-2xl">
				<p class="text-body" style="color: var(--text-secondary);">No ports match "{searchQuery}"</p>
				<p class="text-caption mt-xs" style="color: var(--text-muted);">Try a different search term</p>
			</div>
		{:else}
			<div class="space-y-xs">
				{#each filteredPorts as port, i (i)}
					<div class="flex items-center justify-between py-sm px-md rounded-md transition-colors hover:bg-[var(--bg-surface)] group stagger-item" style="--stagger-index: {i + 4};">
						<div class="flex items-center gap-md">
							<!-- Port number -->
							<div class="w-16 text-right">
								<span class="text-h3 font-bold font-mono" style="color: var(--text-primary);">{port.port}</span>
							</div>

							<!-- Protocol badge -->
							<span
								class="px-2 py-0.5 rounded-full text-caption-sm font-medium uppercase"
								style="background: {getProtocolColor(port.protocol)}15; color: {getProtocolColor(port.protocol)};"
							>
								{port.protocol}
							</span>

							<!-- State -->
							<span
								class="px-2 py-0.5 rounded-full text-caption-sm"
								style="background: {getStateColor(port.state)}15; color: {getStateColor(port.state)};"
							>
								{port.state}
							</span>
						</div>

						<div class="flex items-center gap-lg">
							<!-- Details -->
							<div class="text-right hidden sm:block">
								<p class="text-body-sm font-medium" style="color: var(--text-primary);">
									{port.processName ?? '—'}
								</p>
								<p class="text-caption font-mono" style="color: var(--text-muted);">
									{port.address} {port.pid ? `· PID ${port.pid}` : ''}
								</p>
							</div>

							<!-- Kill button -->
							<button
								class="btn-danger px-3 py-1 text-caption opacity-0 group-hover:opacity-100 transition-opacity"
								class:pointer-events-none={loading}
								disabled={loading}
								onclick={() => handleFree(port.port, port.pid, port.processName)}
							>
								{#if loading && selectedPort === port.port}
									<svg class="animate-spin w-3.5 h-3.5 inline-block" viewBox="0 0 24 24" fill="none">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
									</svg>
								{:else}
									Free
								{/if}
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card>
</div>

<PortConfirmModal
	open={modalOpen}
	port={selectedPort}
	processName={selectedProcess}
	onConfirm={handleConfirmKill}
	onCancel={() => { modalOpen = false; feedback = null; }}
	loading={loading}
	error={feedback?.type === 'error' ? feedback.text : null}
/>
