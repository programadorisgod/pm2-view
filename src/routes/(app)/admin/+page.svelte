<script lang="ts">
	import { base } from '$app/paths';
</script>

<div class="flex flex-col items-center justify-center min-h-[60vh]">
	<h1 class="text-3xl font-bold mb-4" style="color: var(--text-primary);">Admin Dashboard</h1>
	<p class="text-lg mb-8" style="color: var(--text-secondary);">Select a section from the sidebar to manage users, teams, and permissions.</p>
	<div class="flex gap-4">
		<a href="{base}/admin/users" class="px-6 py-3 rounded-lg font-medium" style="background: var(--accent); color: var(--accent-text);">Manage Users</a>
		<a href="{base}/admin/teams" class="px-6 py-3 rounded-lg font-medium" style="background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border-base);">Manage Teams</a>
		<a href="{base}/admin/audit" class="px-6 py-3 rounded-lg font-medium" style="background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border-base);">Audit Logs</a>
	</div>
</div>
