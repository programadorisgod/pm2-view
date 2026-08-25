<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { DateTimePicker } from '$lib/ui/components';

	let action = $state('');
	let actor = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let loading = $state(false);

	function applyFilters() {
		if (loading) return;
		loading = true;

		const params = new URLSearchParams();
		if (action) params.set('action', action);
		if (actor) params.set('actor', actor);
		if (startDate) params.set('startDate', startDate);
		if (endDate) params.set('endDate', endDate);

		goto(`${base}/admin/audit?${params.toString()}`).finally(() => {
			loading = false;
		});
	}

	function clearFilters() {
		action = '';
		actor = '';
		startDate = '';
		endDate = '';
		goto(`${base}/admin/audit`);
	}
</script>

<div class="p-lg rounded-lg space-y-md" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
	<h3 class="text-body font-semibold" style="color: var(--text-primary);">Filters</h3>

	<div class="grid grid-cols-1 md:grid-cols-4 gap-md">
		<!-- Action filter -->
		<div>
			<label for="filter-action" class="block text-caption mb-1" style="color: var(--text-secondary);">Action</label>
			<select
				id="filter-action"
				bind:value={action}
				class="w-full px-3 py-2 rounded-md border text-body-sm"
				style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
			>
				<option value="">All Actions</option>
				<option value="role_change">Role Change</option>
				<option value="user_ban">User Ban</option>
				<option value="user_unban">User Unban</option>
				<option value="project_member_add">Project Member Add</option>
				<option value="project_member_remove">Project Member Remove</option>
				<option value="team_create">Team Create</option>
				<option value="team_member_add">Team Member Add</option>
				<option value="team_member_remove">Team Member Remove</option>
			</select>
		</div>

		<!-- Actor filter -->
		<div>
			<label for="filter-actor" class="block text-caption mb-1" style="color: var(--text-secondary);">Actor</label>
			<input
				id="filter-actor"
				type="text"
				bind:value={actor}
				placeholder="Name, email, or ID"
				class="w-full px-3 py-2 rounded-md border text-body-sm"
				style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
			/>
		</div>

		<!-- Start date -->
		<div>
			<DateTimePicker id="filter-start" bind:value={startDate} label="Start Date" />
		</div>

		<!-- End date -->
		<div>
			<DateTimePicker id="filter-end" bind:value={endDate} label="End Date" />
		</div>
	</div>

	<!-- Action buttons -->
	<div class="flex gap-md">
		<button
			class="btn-primary px-4 py-2 text-body-sm inline-flex items-center gap-2"
			onclick={applyFilters}
			disabled={loading}
			class:opacity-40={loading}
			class:cursor-not-allowed={loading}
		>
			{#if loading}
				<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
				</svg>
				Applying...
			{:else}
				Apply Filters
			{/if}
		</button>
		<button
			class="btn-secondary px-4 py-2 text-body-sm"
			onclick={clearFilters}
			disabled={loading}
		>
			Clear
		</button>
	</div>
</div>
