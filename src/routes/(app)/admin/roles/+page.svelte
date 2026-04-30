<script lang="ts">
	import { base } from '$app/paths';
	import { hasPermission } from '$lib/auth/permissions';

	// Permission matrix — mirrors statements in $lib/auth/permissions.ts
	const permissions = [
		{ resource: 'user', actions: ['create', 'read', 'list', 'get', 'update', 'delete', 'set-role', 'ban', 'set-password', 'impersonate', 'impersonate-admins'] },
		{ resource: 'project', actions: ['create', 'read', 'update', 'delete'] },
		{ resource: 'project_member', actions: ['create', 'read', 'update', 'delete'] },
		{ resource: 'team', actions: ['create', 'read', 'update', 'delete'] },
		{ resource: 'team_member', actions: ['create', 'read', 'update', 'delete'] },
		{ resource: 'audit_log', actions: ['create', 'read', 'delete'] }
	];

	const roles = ['admin', 'user', 'viewer'];
</script>

<div class="max-w-6xl mx-auto">
	<!-- Header -->
	<div class="mb-xl">
		<h1 class="text-h1 font-bold mb-xs" style="color: var(--text-primary);">Roles & Permissions</h1>
		<p class="text-body-sm" style="color: var(--text-secondary);">View and manage role-based access control</p>
	</div>

	<!-- Role Definitions -->
	<div class="grid grid-cols-1 md:grid-cols-3 gap-lg mb-xl">
		<div class="p-lg rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
			<h3 class="text-h3 font-semibold mb-2" style="color: #FF5252;">Admin</h3>
			<p class="text-caption mb-md" style="color: var(--text-muted);">Full system access</p>
			<ul class="text-caption space-y-1" style="color: var(--text-secondary);">
				<li>• Manage all users</li>
				<li>• Manage all teams</li>
				<li>• View audit logs</li>
				<li>• Manage project sharing</li>
				<li>• System configuration</li>
			</ul>
		</div>

		<div class="p-lg rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
			<h3 class="text-h3 font-semibold mb-2" style="color: #38CDFF;">User</h3>
			<p class="text-caption mb-md" style="color: var(--text-muted);">Standard access</p>
			<ul class="text-caption space-y-1" style="color: var(--text-secondary);">
				<li>• Create projects</li>
				<li>• Manage own projects</li>
				<li>• Join teams</li>
				<li>• Create teams</li>
				<li>• View own metrics</li>
			</ul>
		</div>

		<div class="p-lg rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
			<h3 class="text-h3 font-semibold mb-2" style="color: #8B95A5;">Viewer</h3>
			<p class="text-caption mb-md" style="color: var(--text-muted);">Read-only access</p>
			<ul class="text-caption space-y-1" style="color: var(--text-secondary);">
				<li>• View projects (read-only)</li>
				<li>• View teams (read-only)</li>
				<li>• View metrics</li>
				<li>• Cannot modify anything</li>
			</ul>
		</div>
	</div>

	<!-- Permission Matrix -->
	<div class="p-lg rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
		<h2 class="text-h3 font-semibold mb-lg" style="color: var(--text-primary);">Permission Matrix</h2>

		<div class="overflow-x-auto">
			<table class="w-full text-body-sm">
				<thead>
					<tr style="border-bottom: 1px solid var(--border-color);">
						<th class="text-left p-3" style="color: var(--text-secondary);">Resource</th>
						<th class="text-left p-3" style="color: var(--text-secondary);">Action</th>
						{#each roles as role}
							<th class="text-center p-3" style="color: var(--text-secondary);">{role}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each permissions as { resource, actions }}
						{#each actions as action, i}
							<tr style="border-bottom: 1px solid var(--border-color);" class="hover:bg-[var(--bg-card)]">
								{#if i === 0}
									<td class="p-3 font-medium" style="color: var(--text-primary);" rowspan={actions.length}>
										{resource.replace('_', ' ')}
									</td>
								{/if}
								<td class="p-3" style="color: var(--text-secondary);">{action}</td>
								{#each roles as role}
									<td class="p-3 text-center">
										{#if hasPermission(role, resource, action)}
											<span class="text-xs" style="color: #00E676;">✓</span>
										{:else}
											<span class="text-xs" style="color: #FF5252;">✗</span>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
