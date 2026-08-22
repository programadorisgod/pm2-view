<script lang="ts">
	import { Card } from '$lib/ui/components';
	import { base } from '$app/paths';

	interface DeploymentSummary {
		id: string;
		repository: string;
		branch: string;
		commitSha: string | null;
		status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
		stage: string | null;
		startedAt: string | null;
		finishedAt: string | null;
		durationMs: number | null;
		error: string | null;
		createdAt: string;
	}

	let { projectId }: { projectId: string } = $props();

	let deployments = $state<DeploymentSummary[]>([]);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);

	let expandedId = $state<string | null>(null);
	let detailLogs = $state<string | null>(null);
	let detailLoading = $state(false);

	let pollTimer: ReturnType<typeof setInterval> | null = null;

	const hasActiveDeployment = $derived(
		deployments.some((d) => d.status === 'pending' || d.status === 'running')
	);

	function statusColor(status: string): string {
		switch (status) {
			case 'success': return '#4CAF50';
			case 'failed': return '#FF5252';
			case 'running': return '#2196F3';
			case 'pending': return '#FFB74D';
			default: return 'var(--text-muted)';
		}
	}

	function formatDuration(ms: number | null): string {
		if (ms === null || ms === undefined) return '—';
		if (ms < 1000) return `${ms}ms`;
		const s = Math.round(ms / 1000);
		if (s < 60) return `${s}s`;
		return `${Math.floor(s / 60)}m ${s % 60}s`;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString();
	}

	async function load() {
		if (!projectId || isLoading) return;
		isLoading = true;
		loadError = null;
		try {
			const res = await fetch(`${base}/api/projects/${projectId}/deployments?limit=20`);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				loadError = data.error || 'Failed to load deployment history';
				return;
			}
			const data = await res.json();
			deployments = data.deployments ?? [];
		} catch {
			loadError = 'Network error while loading deployments';
		} finally {
			isLoading = false;
		}
	}

	async function toggleDetail(id: string) {
		if (expandedId === id) {
			expandedId = null;
			detailLogs = null;
			return;
		}
		expandedId = id;
		detailLogs = null;
		detailLoading = true;
		try {
			const res = await fetch(`${base}/api/deployments/${id}`);
			if (res.ok) {
				const data = await res.json();
				detailLogs = data.logs || '(no logs)';
				// Keep summary in sync with fresh detail data
				const idx = deployments.findIndex((d) => d.id === id);
				if (idx !== -1 && data.status !== deployments[idx].status) {
					deployments[idx] = {
						...deployments[idx],
						status: data.status,
						stage: data.stage,
						error: data.error,
						durationMs: data.durationMs
					};
				}
			} else {
				detailLogs = 'Failed to load logs';
			}
		} catch {
			detailLogs = 'Network error while loading logs';
		} finally {
			detailLoading = false;
		}
	}

	$effect(() => {
		load();
		if (pollTimer) clearInterval(pollTimer);
		// Poll only while something is pending/running
		pollTimer = setInterval(() => {
			if (hasActiveDeployment) load();
		}, 5000);
		return () => {
			if (pollTimer) clearInterval(pollTimer);
		};
	});
</script>

<Card padding>
	<div class="mb-md flex items-center justify-between">
		<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">
			Deployment History
		</h3>
		<button
			type="button"
			class="btn-secondary px-3 py-1.5 text-caption"
			onclick={load}
			disabled={isLoading}
		>
			{isLoading ? 'Loading...' : 'Refresh'}
		</button>
	</div>

	{#if loadError}
		<div
			class="rounded-md p-sm text-body-sm mb-md"
			style="background: rgba(255, 82, 82, 0.1); color: #FF5252; border: 1px solid rgba(255, 82, 82, 0.2);"
		>
			{loadError}
		</div>
	{/if}

	{#if !projectId}
		<p class="text-body-sm" style="color: var(--text-muted);">
			Register this project to see its deployment history.
		</p>
	{:else if deployments.length === 0 && !isLoading}
		<p class="text-body-sm" style="color: var(--text-muted);">
			No deployments yet. Push to the configured repository to trigger one.
		</p>
	{:else}
		<div class="space-y-xs">
			{#each deployments as d (d.id)}
				<div
					class="rounded-md overflow-hidden"
					style="border: 1px solid var(--border-color);"
				>
					<button
						type="button"
						class="w-full flex items-center gap-sm p-sm text-left hover:bg-black/5"
						style="background: var(--bg-surface);"
						onclick={() => toggleDetail(d.id)}
					>
						<span
							class="px-2 py-0.5 rounded text-caption font-medium uppercase shrink-0"
							style="background: {statusColor(d.status)}1a; color: {statusColor(d.status)};"
						>
							{d.status}
						</span>
						<code class="text-caption font-mono shrink-0" style="color: var(--text-secondary);">
							{(d.commitSha ?? '—').slice(0, 7)}
						</code>
						<span class="text-caption truncate flex-1" style="color: var(--text-muted);">
							{formatDate(d.createdAt)}
						</span>
						<span class="text-caption shrink-0" style="color: var(--text-muted);">
							{formatDuration(d.durationMs)}
						</span>
					</button>

					{#if expandedId === d.id}
						<div class="p-sm" style="background: var(--bg-surface); border-top: 1px solid var(--border-color);">
							<div class="grid grid-cols-2 sm:grid-cols-4 gap-sm mb-sm">
								<div>
									<p class="text-caption" style="color: var(--text-muted);">Branch</p>
									<p class="text-caption font-mono" style="color: var(--text-primary);">{d.branch}</p>
								</div>
								<div>
									<p class="text-caption" style="color: var(--text-muted);">Commit</p>
									<p class="text-caption font-mono" style="color: var(--text-primary);">
										{d.commitSha ? d.commitSha.slice(0, 7) : '—'}
									</p>
								</div>
								<div>
									<p class="text-caption" style="color: var(--text-muted);">Stage</p>
									<p class="text-caption font-mono" style="color: var(--text-primary);">
										{d.status === 'failed' ? (d.stage ?? '—') : '—'}
									</p>
								</div>
								<div>
									<p class="text-caption" style="color: var(--text-muted);">Duration</p>
									<p class="text-caption" style="color: var(--text-primary);">{formatDuration(d.durationMs)}</p>
								</div>
							</div>

							{#if d.status === 'failed' && d.error}
								<div
									class="rounded-md p-sm text-body-sm mb-sm"
									style="background: rgba(255, 82, 82, 0.08); color: #FF5252;"
								>
									<strong>Error ({d.stage}):</strong> {d.error}
								</div>
							{/if}

							<p class="text-caption mb-2xs" style="color: var(--text-muted);">Logs</p>
							{#if detailLoading}
								<p class="text-caption" style="color: var(--text-muted);">Loading logs...</p>
							{:else}
								<pre
									class="rounded-md p-sm text-caption font-mono overflow-auto max-h-96 whitespace-pre-wrap"
									style="background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-secondary);">{detailLogs ?? ''}</pre
								>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</Card>
