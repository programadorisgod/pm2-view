<script lang="ts">
	import { base } from '$app/paths';
	import type { PageData } from './$types';
	import AuditFilters from '$lib/components/admin/audit-filters.svelte';

	let { data }: { data: PageData } = $props();

	let logs = $derived(data.logs || []);
	let pagination = $derived(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
	let exporting = $state(false);

	function formatAction(action: string) {
		return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}

	function formatTimestamp(timestamp: string) {
		return new Date(timestamp).toLocaleString();
	}

	function formatValue(value: unknown): string {
		if (value === null || value === undefined) return '—';
		if (typeof value === 'string') return value;
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		return String(value);
	}

	function getActorDisplay(log: any): string {
		return log.actor?.name ?? log.actor?.email ?? log.actorId ?? 'Unknown';
	}

	function parseDetails(details: unknown): Record<string, unknown> {
		if (!details) return {};
		if (typeof details === 'string') {
			try { return JSON.parse(details); } catch { return {}; }
		}
		return details as Record<string, unknown>;
	}

	async function handleExport() {
		if (exporting) return;
		exporting = true;
		try {
			const params = new URLSearchParams(window.location.search);
			const res = await fetch(`${base}/admin/audit/export?${params.toString()}`);
			if (!res.ok) throw new Error('Export failed');
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('CSV export failed:', err);
		} finally {
			exporting = false;
		}
	}
</script>

<div class="max-w-6xl mx-auto">
	<!-- Header -->
	<div class="mb-xl">
		<h1 class="text-h1 font-bold mb-xs" style="color: var(--text-primary);">Audit Logs</h1>
		<p class="text-body-sm" style="color: var(--text-secondary);">Track all system actions and changes</p>
	</div>

	<!-- Filters -->
	<AuditFilters />

	<!-- Desktop Table -->
	<div class="hidden md:block overflow-x-auto mt-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 0.5rem;">
		<table class="w-full text-body-sm">
			<thead>
				<tr style="border-bottom: 1px solid var(--border-color);">
					<th class="text-left p-3 whitespace-nowrap" style="color: var(--text-secondary);">Timestamp</th>
					<th class="text-left p-3 whitespace-nowrap" style="color: var(--text-secondary);">Actor</th>
					<th class="text-left p-3 whitespace-nowrap" style="color: var(--text-secondary);">Action</th>
					<th class="text-left p-3 whitespace-nowrap" style="color: var(--text-secondary);">Target</th>
					<th class="text-left p-3 whitespace-nowrap" style="color: var(--text-secondary);">Details</th>
				</tr>
			</thead>
			<tbody>
				{#each logs as log (log.id)}
					{@const actorName = getActorDisplay(log)}
					{@const details = parseDetails(log.details)}
					<tr style="border-bottom: 1px solid var(--border-color);" class="hover:bg-[var(--bg-card)]">
						<td class="p-3 whitespace-nowrap" style="color: var(--text-muted);">{formatTimestamp(log.timestamp)}</td>
						<td class="p-3 max-w-[160px] truncate" style="color: var(--text-primary);" title="{actorName}">{actorName}</td>
						<td class="p-3 whitespace-nowrap">
							<span class="px-2 py-1 rounded text-caption" style="background: rgba(56, 205, 255, 0.1); color: #38CDFF;">
								{formatAction(log.action)}
							</span>
						</td>
						<td class="p-3 max-w-[200px] truncate" style="color: var(--text-secondary);" title="{log.resourceType}: {log.resourceId || log.targetId || 'N/A'}">
							{log.resourceType}: {log.resourceId || log.targetId || 'N/A'}
						</td>
						<td class="p-3">
							<div class="flex flex-wrap gap-x-3 gap-y-1 text-caption" style="color: var(--text-muted);">
								{#each Object.entries(details) as [key, value]}
									<span>
										<span style="color: var(--text-secondary);">{key}:</span>
										<span class="font-mono">{formatValue(value)}</span>
									</span>
								{/each}
								{#if Object.keys(details).length === 0}
									<span style="color: var(--text-muted);">—</span>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		{#if logs.length === 0}
			<div class="text-center py-2xl" style="color: var(--text-muted);">
				No audit logs found
			</div>
		{/if}
	</div>

	<!-- Mobile Cards -->
	<div class="md:hidden space-y-md mt-lg">
		{#each logs as log (log.id)}
			{@const actorName = getActorDisplay(log)}
			{@const details = parseDetails(log.details)}
			<div class="p-4 rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
				<div class="flex items-start justify-between mb-2">
					<span class="px-2 py-0.5 rounded text-caption" style="background: rgba(56, 205, 255, 0.1); color: #38CDFF;">
						{formatAction(log.action)}
					</span>
					<span class="text-caption" style="color: var(--text-muted);">{formatTimestamp(log.timestamp)}</span>
				</div>
				<div class="space-y-xs text-body-sm">
					<div class="flex justify-between">
						<span style="color: var(--text-muted);">Actor</span>
						<span class="font-medium" style="color: var(--text-primary);">{actorName}</span>
					</div>
					<div class="flex justify-between">
						<span style="color: var(--text-muted);">Target</span>
						<span style="color: var(--text-secondary);">{log.resourceType}: {log.resourceId || log.targetId || 'N/A'}</span>
					</div>
					{#if Object.keys(details).length > 0}
						<div>
							<span style="color: var(--text-muted);">Details</span>
							<div class="mt-1 space-y-0.5 text-caption font-mono" style="color: var(--text-muted);">
								{#each Object.entries(details) as [key, value]}
									<div class="flex gap-2">
										<span style="color: var(--text-secondary);">{key}:</span>
										<span>{formatValue(value)}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/each}

		{#if logs.length === 0}
			<div class="text-center py-2xl" style="color: var(--text-muted);">
				No audit logs found
			</div>
		{/if}
	</div>

	<!-- Pagination -->
	{#if pagination.totalPages > 1}
		<div class="flex justify-center gap-2 mt-xl">
			{#each Array(pagination.totalPages) as _, i}
				<a
					href="{base}/admin/audit?page={i + 1}"
					class="px-3 py-1 rounded text-caption"
					style="background: {pagination.page === i + 1 ? 'var(--bg-card)' : 'transparent'}; color: var(--text-primary);"
				>
					{i + 1}
				</a>
			{/each}
		</div>
	{/if}

	<!-- Export -->
	<div class="mt-lg flex items-center justify-between">
		<span class="text-caption" style="color: var(--text-muted);">
			{pagination.total} log{pagination.total !== 1 ? 's' : ''} total
		</span>
		<button
			class="btn-secondary px-4 py-2 text-body-sm inline-flex items-center gap-2"
			onclick={handleExport}
			disabled={exporting}
			class:opacity-40={exporting}
			class:cursor-not-allowed={exporting}
		>
			{#if exporting}
				<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
				</svg>
				Exporting...
			{:else}
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
				</svg>
				Export CSV
			{/if}
		</button>
	</div>
</div>
