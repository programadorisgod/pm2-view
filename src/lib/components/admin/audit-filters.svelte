<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	let action = $state('');
	let actorId = $state('');
	let startDate = $state('');
	let endDate = $state('');

	function applyFilters() {
		const params = new URLSearchParams();
		if (action) params.set('action', action);
		if (actorId) params.set('actorId', actorId);
		if (startDate) params.set('startDate', startDate);
		if (endDate) params.set('endDate', endDate);

		goto(`${base}/admin/audit?${params.toString()}`);
	}

	function clearFilters() {
		action = '';
		actorId = '';
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
			<label for="filter-actor" class="block text-caption mb-1" style="color: var(--text-secondary);">Actor ID</label>
			<input
				id="filter-actor"
				type="text"
				bind:value={actorId}
				placeholder="User ID"
				class="w-full px-3 py-2 rounded-md border text-body-sm"
				style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
			/>
		</div>

		<!-- Start date -->
		<div>
			<label for="filter-start" class="block text-caption mb-1" style="color: var(--text-secondary);">Start Date</label>
			<input
				id="filter-start"
				type="date"
				bind:value={startDate}
				class="w-full px-3 py-2 rounded-md border text-body-sm"
				style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
			/>
		</div>

		<!-- End date -->
		<div>
			<label for="filter-end" class="block text-caption mb-1" style="color: var(--text-secondary);">End Date</label>
			<input
				id="filter-end"
				type="date"
				bind:value={endDate}
				class="w-full px-3 py-2 rounded-md border text-body-sm"
				style="background: var(--bg-card); border-color: var(--border-color); color: var(--text-primary);"
			/>
		</div>
	</div>

	<!-- Action buttons -->
	<div class="flex gap-md">
		<button
			class="btn-primary px-4 py-2 text-body-sm"
			onclick={applyFilters}
		>
			Apply Filters
		</button>
		<button
			class="btn-secondary px-4 py-2 text-body-sm"
			onclick={clearFilters}
		>
			Clear
		</button>
	</div>
</div>
