<script lang="ts">
	import { base } from '$app/paths';
	import type { PageData } from './$types';
	import AuditFilters from '$lib/components/admin/audit-filters.svelte';

	let { data }: { data: PageData } = $props();

	let logs = $derived(data.logs || []);
	let pagination = $derived(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });

	function formatAction(action: string) {
		return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}

	function formatTimestamp(timestamp: string) {
		return new Date(timestamp).toLocaleString();
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

	<!-- Logs Table -->
	<div class="overflow-x-auto mt-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 0.5rem;">
		<table class="w-full text-body-sm">
			<thead>
				<tr style="border-bottom: 1px solid var(--border-color);">
					<th class="text-left p-3" style="color: var(--text-secondary);">Timestamp</th>
					<th class="text-left p-3" style="color: var(--text-secondary);">Actor</th>
					<th class="text-left p-3" style="color: var(--text-secondary);">Action</th>
					<th class="text-left p-3" style="color: var(--text-secondary);">Target</th>
					<th class="text-left p-3" style="color: var(--text-secondary);">Details</th>
				</tr>
			</thead>
			<tbody>
				{#each logs as log (log.id)}
					<tr style="border-bottom: 1px solid var(--border-color);" class="hover:bg-[var(--bg-card)]">
						<td class="p-3" style="color: var(--text-muted);">{formatTimestamp(log.timestamp)}</td>
						<td class="p-3" style="color: var(--text-primary);">{log.actorName || log.actorId}</td>
						<td class="p-3">
							<span class="px-2 py-1 rounded text-caption" style="background: rgba(56, 205, 255, 0.1); color: #38CDFF;">
								{formatAction(log.action)}
							</span>
						</td>
						<td class="p-3" style="color: var(--text-secondary);">
							{log.resourceType}: {log.resourceId || log.targetId || 'N/A'}
						</td>
						<td class="p-3 text-caption" style="color: var(--text-muted); max-w-xs truncate">
							{JSON.stringify(log.details || {})}
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

	<!-- Export Button (TODO: implement CSV export endpoint) -->
	<div class="mt-lg">
		<button class="btn-secondary px-4 py-2 text-body-sm" disabled>
			Export CSV (coming soon)
		</button>
	</div>
</div>
