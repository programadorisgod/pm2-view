<script lang="ts">
	import { Card } from '$lib/ui/components';
	import { base } from '$app/paths';
	import type { DeployConfig, DeployCommand } from '$lib/deploy-config/deploy-config.types';

	let {
		projectId,
		initialConfig,
		availableProcesses = [],
		activeProcess = '',
	}: {
		projectId: string;
		initialConfig: DeployConfig;
		availableProcesses?: string[];
		activeProcess?: string;
	} = $props();

	// Check if project is registered in the database
	let isProjectRegistered = $derived(projectId !== '');

	// Local state mirroring initialConfig
	let config = $state<DeployConfig>({
		install: [],
		build: [],
		restart: [],
		postDeploy: [],
	});

	$effect(() => {
		config = {
			install: initialConfig.install ? [...initialConfig.install] : [],
			build: initialConfig.build ? [...initialConfig.build] : [],
			restart: initialConfig.restart ? [...initialConfig.restart] : [],
			postDeploy: initialConfig.postDeploy ? [...initialConfig.postDeploy] : [],
		};
	});

	// Process Filter State
	let selectedProcessFilter = $state<string>('all');

	// UI state per section
	let installAdding = $state(false);
	let buildAdding = $state(false);
	let restartAdding = $state(false);
	let postDeployAdding = $state(false);
	let editingCommand = $state<DeployCommand | null>(null);

	// Form fields
	let labelInput = $state('');
	let commandInput = $state('');
	let targetProcessInput = $state('');
	let serverError = $state<string | null>(null);
	let isSaving = $state(false);

	// Delete confirmation
	let deleteTarget = $state<DeployCommand | null>(null);
	let deleteConfirmName = $state('');

	// Client-side validation
	function validateLabel(value: string): string | null {
		if (!value.trim()) return 'Label is required';
		if (value.length > 100) return 'Label must be 100 characters or fewer';
		return null;
	}

	function validateCommand(value: string): string | null {
		if (!value.trim()) return 'Command is required';
		if (value.length > 2000) return 'Command must be 2000 characters or fewer';
		// Check for disallowed shell characters (allow &&)
		const disallowed = /(?:^|[^&])&(?!&)|[;|$()`<>|]/;
		if (disallowed.test(value)) return 'Command contains disallowed characters';
		return null;
	}

	function filterCommands(list: DeployCommand[]): DeployCommand[] {
		if (selectedProcessFilter === 'all') return list;
		return list.filter(
			(c) => !c.targetProcess || c.targetProcess === selectedProcessFilter
		);
	}

	async function saveCommand(
		commandType: 'install' | 'build' | 'restart' | 'post-deploy',
		existingId?: string
	) {
		serverError = null;
		const labelError = validateLabel(labelInput);
		const commandError = validateCommand(commandInput);
		if (labelError) {
			serverError = labelError;
			return;
		}
		if (commandError) {
			serverError = commandError;
			return;
		}

		isSaving = true;
		try {
			const method = existingId ? 'PUT' : 'POST';
			const url = `${base}/api/deploy-config`;
			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...(existingId && { id: existingId }),
					project_id: projectId,
					command_type: commandType,
					target_process: targetProcessInput.trim() || null,
					label: labelInput.trim(),
					command: commandInput.trim(),
				}),
			});

			if (!res.ok) {
				const data = await res.json();
				serverError = data.error || 'Failed to save command';
				return;
			}

			const result = await res.json();
			const savedCommand = (result.data || result) as DeployCommand;

			// Update local state
			if (existingId) {
				if (commandType === 'install') {
					config.install = config.install.map((c) => (c.id === existingId ? savedCommand : c));
				} else if (commandType === 'build') {
					config.build = config.build.map((c) => (c.id === existingId ? savedCommand : c));
				} else if (commandType === 'restart') {
					config.restart = config.restart.map((c) => (c.id === existingId ? savedCommand : c));
				} else {
					config.postDeploy = config.postDeploy.map((c) => (c.id === existingId ? savedCommand : c));
				}
			} else {
				if (commandType === 'install') {
					config.install = [...config.install, savedCommand];
				} else if (commandType === 'build') {
					config.build = [...config.build, savedCommand];
				} else if (commandType === 'restart') {
					config.restart = [...config.restart, savedCommand];
				} else {
					config.postDeploy = [...config.postDeploy, savedCommand];
				}
			}

			closeForms();
		} catch {
			serverError = 'Network error. Please try again.';
		} finally {
			isSaving = false;
		}
	}

	async function deleteCommand(cmd: DeployCommand) {
		try {
			const res = await fetch(`${base}/api/deploy-config`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: cmd.id }),
			});
			if (!res.ok) {
				const data = await res.json();
				serverError = data.error || 'Failed to delete command';
				return;
			}

			// Remove from local state
			if (cmd.commandType === 'install') {
				config.install = config.install.filter((c) => c.id !== cmd.id);
			} else if (cmd.commandType === 'build') {
				config.build = config.build.filter((c) => c.id !== cmd.id);
			} else if (cmd.commandType === 'restart') {
				config.restart = config.restart.filter((c) => c.id !== cmd.id);
			} else {
				config.postDeploy = config.postDeploy.filter((c) => c.id !== cmd.id);
			}

			deleteTarget = null;
		} catch {
			serverError = 'Network error. Please try again.';
		}
	}

	async function reorderCommand(
		commandType: 'install' | 'build' | 'restart' | 'post-deploy',
		cmd: DeployCommand,
		direction: 'up' | 'down'
	) {
		let list: DeployCommand[];
		if (commandType === 'install') list = config.install;
		else if (commandType === 'build') list = config.build;
		else if (commandType === 'restart') list = config.restart;
		else list = config.postDeploy;

		const idx = list.findIndex((c) => c.id === cmd.id);
		if (idx === -1) return;
		if (direction === 'up' && idx === 0) return;
		if (direction === 'down' && idx === list.length - 1) return;

		const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
		const newList = [...list];
		const temp = newList[idx];
		newList[idx] = newList[targetIdx];
		newList[targetIdx] = temp;

		// Optimistic update
		const oldList = list;
		if (commandType === 'install') config.install = newList;
		else if (commandType === 'build') config.build = newList;
		else if (commandType === 'restart') config.restart = newList;
		else config.postDeploy = newList;

		try {
			const cmd1 = newList[idx];
			const cmd2 = newList[targetIdx];
			const res1 = await fetch(`${base}/api/deploy-config`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: cmd1.id, sort_order: cmd1.sortOrder }),
			});
			const res2 = await fetch(`${base}/api/deploy-config`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: cmd2.id, sort_order: cmd2.sortOrder }),
			});
			if (!res1.ok || !res2.ok) throw new Error('Reorder failed');
		} catch {
			// Rollback
			if (commandType === 'install') config.install = oldList;
			else if (commandType === 'build') config.build = oldList;
			else if (commandType === 'restart') config.restart = oldList;
			else config.postDeploy = oldList;
			serverError = 'Failed to reorder commands';
		}
	}

	function resetInputs(defaultProcess = '') {
		labelInput = '';
		commandInput = '';
		targetProcessInput = defaultProcess;
		editingCommand = null;
	}

	function startAddInstall() {
		resetInputs(activeProcess);
		installAdding = true;
	}

	function startAddBuild() {
		resetInputs(activeProcess);
		buildAdding = true;
	}

	function startAddRestart() {
		resetInputs(activeProcess);
		restartAdding = true;
	}

	function startAddPostDeploy() {
		resetInputs(activeProcess);
		postDeployAdding = true;
	}

	function startEdit(cmd: DeployCommand) {
		labelInput = cmd.label;
		commandInput = cmd.command;
		targetProcessInput = cmd.targetProcess ?? '';
		editingCommand = cmd;
		if (cmd.commandType === 'install') installAdding = true;
		else if (cmd.commandType === 'build') buildAdding = true;
		else if (cmd.commandType === 'restart') restartAdding = true;
		else postDeployAdding = true;
	}

	function closeForms() {
		installAdding = false;
		buildAdding = false;
		restartAdding = false;
		postDeployAdding = false;
		editingCommand = null;
		labelInput = '';
		commandInput = '';
		targetProcessInput = '';
	}

	function confirmDelete(cmd: DeployCommand) {
		deleteTarget = cmd;
		deleteConfirmName = cmd.label;
	}

	function cancelDelete() {
		deleteTarget = null;
		deleteConfirmName = '';
	}
</script>

{#if !isProjectRegistered}
	<Card padding>
		<div class="text-center py-lg">
			<svg
				class="mx-auto mb-md h-12 w-12"
				style="color: var(--text-muted);"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<h3 class="text-h3 font-semibold mb-sm" style="color: var(--text-primary);">
				Project Not Registered
			</h3>
			<p class="text-body-sm" style="color: var(--text-muted);">
				This PM2 process is not registered as a project. Deploy configuration is only available for registered projects.
			</p>
		</div>
	</Card>
{:else}
<div class="space-y-lg">
	{#if serverError}
		<div
			class="rounded-md p-sm text-body-sm"
			style="background: rgba(255, 91, 79, 0.1); color: #FF5B4F; border: 1px solid rgba(255, 91, 79, 0.2);"
		>
			{serverError}
		</div>
	{/if}

	<!-- Process Filter Bar (for multi-process projects) -->
	{#if availableProcesses.length > 1}
		<div
			class="flex items-center gap-xs p-2 rounded-lg"
			style="background: var(--bg-surface); border: 1px solid var(--border-color);"
		>
			<span class="text-caption font-medium px-2" style="color: var(--text-muted);">
				Filter by process:
			</span>
			<button
				type="button"
				class="px-3 py-1 text-caption font-medium rounded-md transition-colors"
				style="background: {selectedProcessFilter === 'all' ? 'rgba(0, 112, 243, 0.15)' : 'transparent'}; color: {selectedProcessFilter === 'all' ? '#0070F3' : 'var(--text-muted)'};"
				onclick={() => { selectedProcessFilter = 'all'; }}
			>
				All Commands
			</button>
			{#each availableProcesses as proc}
				<button
					type="button"
					class="px-3 py-1 text-caption font-medium rounded-md transition-colors"
					style="background: {selectedProcessFilter === proc ? 'rgba(0, 112, 243, 0.15)' : 'transparent'}; color: {selectedProcessFilter === proc ? '#0070F3' : 'var(--text-muted)'};"
					onclick={() => { selectedProcessFilter = proc; }}
				>
					{proc}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Install Command Section -->
	<Card padding>
		<div class="mb-md flex items-center justify-between">
			<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">Install Commands</h3>
		</div>
		<p class="text-caption mb-md" style="color: var(--text-muted);">
			Custom installation commands to run instead of auto-detected package manager install.
		</p>

		{#if installAdding}
			<div class="space-y-sm mb-md p-md rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
				<input
					type="text"
					bind:value={labelInput}
					placeholder="Label (e.g., Install root dependencies or Install backend)"
					class="input-base w-full h-10 px-md text-body-sm"
					maxlength="100"
				/>
				<input
					type="text"
					bind:value={commandInput}
					placeholder="Command (e.g., pnpm install --frozen-lockfile)"
					class="input-base w-full h-10 px-md text-body-sm font-mono"
					maxlength="2000"
				/>
				{#if availableProcesses.length > 0}
					<div>
						<label class="text-caption block mb-2xs" style="color: var(--text-muted);">Target Process</label>
						<select
							bind:value={targetProcessInput}
							class="input-base w-full h-10 px-md text-body-sm font-mono"
						>
							<option value="">All Processes (Shared)</option>
							{#each availableProcesses as proc}
								<option value={proc}>{proc}</option>
							{/each}
						</select>
					</div>
				{/if}
				<div class="flex gap-xs pt-xs">
					<button
						type="button"
						class="btn-primary px-3 py-1.5 text-caption"
						disabled={isSaving}
						onclick={() => saveCommand('install', editingCommand?.id)}
					>
						{isSaving ? 'Saving...' : 'Save'}
					</button>
					<button
						type="button"
						class="btn-secondary px-3 py-1.5 text-caption"
						onclick={closeForms}
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		{@const filteredInstall = filterCommands(config.install)}
		{#if filteredInstall.length > 0}
			<div class="space-y-xs mb-md">
				{#each filteredInstall as cmd, i (cmd.id)}
					<div
						class="flex items-center gap-sm p-sm rounded-md"
						style="background: var(--bg-surface); border: 1px solid var(--border-color);"
					>
						<!-- Reorder arrows -->
						<div class="flex flex-col gap-2xs">
							<button
								type="button"
								class="p-2xs text-caption"
								disabled={i === 0}
								style="color: {i === 0 ? 'var(--text-muted)' : 'var(--text-secondary)'}; opacity: {i === 0 ? 0.3 : 1};"
								onclick={() => reorderCommand('install', cmd, 'up')}
								title="Move up"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
								</svg>
							</button>
							<button
								type="button"
								class="p-2xs text-caption"
								disabled={i === filteredInstall.length - 1}
								style="color: {i === filteredInstall.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)'}; opacity: {i === filteredInstall.length - 1 ? 0.3 : 1};"
								onclick={() => reorderCommand('install', cmd, 'down')}
								title="Move down"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
								</svg>
							</button>
						</div>

						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-xs mb-2xs">
								<span class="text-body-sm font-medium" style="color: var(--text-primary);">{cmd.label}</span>
								{#if cmd.targetProcess}
									<span class="text-caption px-2 py-0.5 rounded font-mono" style="background: rgba(0, 112, 243, 0.15); color: #0070F3; border: 1px solid rgba(0, 112, 243, 0.3);">
										{cmd.targetProcess}
									</span>
								{:else}
									<span class="text-caption px-2 py-0.5 rounded font-mono" style="background: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border-color);">
										All Processes
									</span>
								{/if}
							</div>
							<p class="text-caption font-mono truncate" style="color: var(--text-muted);" title={cmd.command}>
								{cmd.command}
							</p>
						</div>

						<div class="flex gap-xs">
							<button
								type="button"
								class="btn-secondary px-2 py-1 text-caption"
								onclick={() => startEdit(cmd)}
							>
								Edit
							</button>
							<button
								type="button"
								class="btn-danger px-2 py-1 text-caption"
								onclick={() => confirmDelete(cmd)}
							>
								Delete
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if !installAdding}
			<button
				type="button"
				class="btn-secondary px-3 py-1.5 text-caption"
				onclick={startAddInstall}
			>
				+ Add install command
			</button>
		{/if}
	</Card>

	<!-- Build Command Section -->
	<Card padding>
		<div class="mb-md flex items-center justify-between">
			<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">Build Commands</h3>
		</div>
		<p class="text-caption mb-md" style="color: var(--text-muted);">
			Custom build commands to run instead of detecting package.json build script. Multiple build commands run in sequence.
		</p>

		{#if buildAdding}
			<div class="space-y-sm mb-md p-md rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
				<input
					type="text"
					bind:value={labelInput}
					placeholder="Label (e.g., Build backend or Build frontend)"
					class="input-base w-full h-10 px-md text-body-sm"
					maxlength="100"
				/>
				<input
					type="text"
					bind:value={commandInput}
					placeholder="Command (e.g., pnpm --filter @atlas/backend build)"
					class="input-base w-full h-10 px-md text-body-sm font-mono"
					maxlength="2000"
				/>
				{#if availableProcesses.length > 0}
					<div>
						<label class="text-caption block mb-2xs" style="color: var(--text-muted);">Target Process</label>
						<select
							bind:value={targetProcessInput}
							class="input-base w-full h-10 px-md text-body-sm font-mono"
						>
							<option value="">All Processes (Shared)</option>
							{#each availableProcesses as proc}
								<option value={proc}>{proc}</option>
							{/each}
						</select>
					</div>
				{/if}
				<div class="flex gap-xs pt-xs">
					<button
						type="button"
						class="btn-primary px-3 py-1.5 text-caption"
						disabled={isSaving}
						onclick={() => saveCommand('build', editingCommand?.id)}
					>
						{isSaving ? 'Saving...' : 'Save'}
					</button>
					<button
						type="button"
						class="btn-secondary px-3 py-1.5 text-caption"
						onclick={closeForms}
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		{@const filteredBuild = filterCommands(config.build)}
		{#if filteredBuild.length > 0}
			<div class="space-y-xs mb-md">
				{#each filteredBuild as cmd, i (cmd.id)}
					<div
						class="flex items-center gap-sm p-sm rounded-md"
						style="background: var(--bg-surface); border: 1px solid var(--border-color);"
					>
						<!-- Reorder arrows -->
						<div class="flex flex-col gap-2xs">
							<button
								type="button"
								class="p-2xs text-caption"
								disabled={i === 0}
								style="color: {i === 0 ? 'var(--text-muted)' : 'var(--text-secondary)'}; opacity: {i === 0 ? 0.3 : 1};"
								onclick={() => reorderCommand('build', cmd, 'up')}
								title="Move up"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
								</svg>
							</button>
							<button
								type="button"
								class="p-2xs text-caption"
								disabled={i === filteredBuild.length - 1}
								style="color: {i === filteredBuild.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)'}; opacity: {i === filteredBuild.length - 1 ? 0.3 : 1};"
								onclick={() => reorderCommand('build', cmd, 'down')}
								title="Move down"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
								</svg>
							</button>
						</div>

						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-xs mb-2xs">
								<span class="text-body-sm font-medium" style="color: var(--text-primary);">{cmd.label}</span>
								{#if cmd.targetProcess}
									<span class="text-caption px-2 py-0.5 rounded font-mono" style="background: rgba(0, 112, 243, 0.15); color: #0070F3; border: 1px solid rgba(0, 112, 243, 0.3);">
										{cmd.targetProcess}
									</span>
								{:else}
									<span class="text-caption px-2 py-0.5 rounded font-mono" style="background: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border-color);">
										All Processes
									</span>
								{/if}
							</div>
							<p class="text-caption font-mono truncate" style="color: var(--text-muted);" title={cmd.command}>
								{cmd.command}
							</p>
						</div>

						<div class="flex gap-xs">
							<button
								type="button"
								class="btn-secondary px-2 py-1 text-caption"
								onclick={() => startEdit(cmd)}
							>
								Edit
							</button>
							<button
								type="button"
								class="btn-danger px-2 py-1 text-caption"
								onclick={() => confirmDelete(cmd)}
							>
								Delete
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if !buildAdding}
			<button
				type="button"
				class="btn-secondary px-3 py-1.5 text-caption"
				onclick={startAddBuild}
			>
				+ Add build command
			</button>
		{/if}
	</Card>

	<!-- Restart Commands Section -->
	<Card padding>
		<div class="mb-md flex items-center justify-between">
			<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">Restart Commands</h3>
		</div>
		<p class="text-caption mb-md" style="color: var(--text-muted);">
			Commands to run during the restart step. Multiple commands run in sequence.
		</p>

		{#if restartAdding}
			<div class="space-y-sm mb-md p-md rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
				<input
					type="text"
					bind:value={labelInput}
					placeholder="Label (e.g., Restart API service)"
					class="input-base w-full h-10 px-md text-body-sm"
					maxlength="100"
				/>
				<input
					type="text"
					bind:value={commandInput}
					placeholder="Command (e.g., pm2 restart atlas-backend --update-env)"
					class="input-base w-full h-10 px-md text-body-sm font-mono"
					maxlength="2000"
				/>
				{#if availableProcesses.length > 0}
					<div>
						<label class="text-caption block mb-2xs" style="color: var(--text-muted);">Target Process</label>
						<select
							bind:value={targetProcessInput}
							class="input-base w-full h-10 px-md text-body-sm font-mono"
						>
							<option value="">All Processes (Shared)</option>
							{#each availableProcesses as proc}
								<option value={proc}>{proc}</option>
							{/each}
						</select>
					</div>
				{/if}
				<div class="flex gap-xs pt-xs">
					<button
						type="button"
						class="btn-primary px-3 py-1.5 text-caption"
						disabled={isSaving}
						onclick={() => saveCommand('restart', editingCommand?.id)}
					>
						{isSaving ? 'Saving...' : 'Save'}
					</button>
					<button
						type="button"
						class="btn-secondary px-3 py-1.5 text-caption"
						onclick={closeForms}
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		{@const filteredRestart = filterCommands(config.restart)}
		{#if filteredRestart.length > 0}
			<div class="space-y-xs mb-md">
				{#each filteredRestart as cmd, i (cmd.id)}
					<div
						class="flex items-center gap-sm p-sm rounded-md"
						style="background: var(--bg-surface); border: 1px solid var(--border-color);"
					>
						<!-- Reorder arrows -->
						<div class="flex flex-col gap-2xs">
							<button
								type="button"
								class="p-2xs text-caption"
								disabled={i === 0}
								style="color: {i === 0 ? 'var(--text-muted)' : 'var(--text-secondary)'}; opacity: {i === 0 ? 0.3 : 1};"
								onclick={() => reorderCommand('restart', cmd, 'up')}
								title="Move up"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
								</svg>
							</button>
							<button
								type="button"
								class="p-2xs text-caption"
								disabled={i === filteredRestart.length - 1}
								style="color: {i === filteredRestart.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)'}; opacity: {i === filteredRestart.length - 1 ? 0.3 : 1};"
								onclick={() => reorderCommand('restart', cmd, 'down')}
								title="Move down"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
								</svg>
							</button>
						</div>

						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-xs mb-2xs">
								<span class="text-body-sm font-medium" style="color: var(--text-primary);">{cmd.label}</span>
								{#if cmd.targetProcess}
									<span class="text-caption px-2 py-0.5 rounded font-mono" style="background: rgba(0, 112, 243, 0.15); color: #0070F3; border: 1px solid rgba(0, 112, 243, 0.3);">
										{cmd.targetProcess}
									</span>
								{:else}
									<span class="text-caption px-2 py-0.5 rounded font-mono" style="background: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border-color);">
										All Processes
									</span>
								{/if}
							</div>
							<p class="text-caption font-mono truncate" style="color: var(--text-muted);" title={cmd.command}>
								{cmd.command}
							</p>
						</div>

						<div class="flex gap-xs">
							<button
								type="button"
								class="btn-secondary px-2 py-1 text-caption"
								onclick={() => startEdit(cmd)}
							>
								Edit
							</button>
							<button
								type="button"
								class="btn-danger px-2 py-1 text-caption"
								onclick={() => confirmDelete(cmd)}
							>
								Delete
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if !restartAdding}
			<button
				type="button"
				class="btn-secondary px-3 py-1.5 text-caption"
				onclick={startAddRestart}
			>
				+ Add restart command
			</button>
		{/if}
	</Card>

	<!-- Post-Deploy Commands Section -->
	<Card padding>
		<div class="mb-md flex items-center justify-between">
			<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">Post-Deploy Actions</h3>
		</div>
		<p class="text-caption mb-md" style="color: var(--text-muted);">
			Optional commands to run after a successful deploy. Multiple commands run in sequence. Failures are logged as warnings and do not fail the deployment.
		</p>

		{#if postDeployAdding}
			<div class="space-y-sm mb-md p-md rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-color);">
				<input
					type="text"
					bind:value={labelInput}
					placeholder="Label (e.g., Build docs)"
					class="input-base w-full h-10 px-md text-body-sm"
					maxlength="100"
				/>
				<input
					type="text"
					bind:value={commandInput}
					placeholder="Command (e.g., pnpm build:docs)"
					class="input-base w-full h-10 px-md text-body-sm font-mono"
					maxlength="2000"
				/>
				{#if availableProcesses.length > 0}
					<div>
						<label class="text-caption block mb-2xs" style="color: var(--text-muted);">Target Process</label>
						<select
							bind:value={targetProcessInput}
							class="input-base w-full h-10 px-md text-body-sm font-mono"
						>
							<option value="">All Processes (Shared)</option>
							{#each availableProcesses as proc}
								<option value={proc}>{proc}</option>
							{/each}
						</select>
					</div>
				{/if}
				<div class="flex gap-xs pt-xs">
					<button
						type="button"
						class="btn-primary px-3 py-1.5 text-caption"
						disabled={isSaving}
						onclick={() => saveCommand('post-deploy', editingCommand?.id)}
					>
						{isSaving ? 'Saving...' : 'Save'}
					</button>
					<button
						type="button"
						class="btn-secondary px-3 py-1.5 text-caption"
						onclick={closeForms}
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		{@const filteredPostDeploy = filterCommands(config.postDeploy)}
		{#if filteredPostDeploy.length > 0}
			<div class="space-y-xs mb-md">
				{#each filteredPostDeploy as cmd, i (cmd.id)}
					<div
						class="flex items-center gap-sm p-sm rounded-md"
						style="background: var(--bg-surface); border: 1px solid var(--border-color);"
					>
						<!-- Reorder arrows -->
						<div class="flex flex-col gap-2xs">
							<button
								type="button"
								class="p-2xs text-caption"
								disabled={i === 0}
								style="color: {i === 0 ? 'var(--text-muted)' : 'var(--text-secondary)'}; opacity: {i === 0 ? 0.3 : 1};"
								onclick={() => reorderCommand('post-deploy', cmd, 'up')}
								title="Move up"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
								</svg>
							</button>
							<button
								type="button"
								class="p-2xs text-caption"
								disabled={i === filteredPostDeploy.length - 1}
								style="color: {i === filteredPostDeploy.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)'}; opacity: {i === filteredPostDeploy.length - 1 ? 0.3 : 1};"
								onclick={() => reorderCommand('post-deploy', cmd, 'down')}
								title="Move down"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
								</svg>
							</button>
						</div>

						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-xs mb-2xs">
								<span class="text-body-sm font-medium" style="color: var(--text-primary);">{cmd.label}</span>
								{#if cmd.targetProcess}
									<span class="text-caption px-2 py-0.5 rounded font-mono" style="background: rgba(0, 112, 243, 0.15); color: #0070F3; border: 1px solid rgba(0, 112, 243, 0.3);">
										{cmd.targetProcess}
									</span>
								{:else}
									<span class="text-caption px-2 py-0.5 rounded font-mono" style="background: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border-color);">
										All Processes
									</span>
								{/if}
							</div>
							<p class="text-caption font-mono truncate" style="color: var(--text-muted);" title={cmd.command}>
								{cmd.command}
							</p>
						</div>

						<div class="flex gap-xs">
							<button
								type="button"
								class="btn-secondary px-2 py-1 text-caption"
								onclick={() => startEdit(cmd)}
							>
								Edit
							</button>
							<button
								type="button"
								class="btn-danger px-2 py-1 text-caption"
								onclick={() => confirmDelete(cmd)}
							>
								Delete
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if !postDeployAdding}
			<button
				type="button"
				class="btn-secondary px-3 py-1.5 text-caption"
				onclick={startAddPostDeploy}
			>
				+ Add post-deploy action
			</button>
		{/if}
	</Card>
</div>

<!-- Delete Confirmation Modal -->
{#if deleteTarget}
	{@const modalId = `delete-modal-${crypto.randomUUID()}`}
	<dialog
		id={modalId}
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		style="background: transparent; border: none;"
		onclose={cancelDelete}
	>
		<!-- Backdrop -->
		<button
			type="button"
			class="fixed inset-0"
			style="background: rgba(0,0,0,0.6); border: none; cursor: pointer;"
			onclick={cancelDelete}
			aria-label="Close modal"
		></button>

		<!-- Modal content -->
		<div
			class="relative w-full max-w-md rounded-xl shadow-2xl p-lg"
			style="background: var(--bg-surface); border: 1px solid var(--border-color);"
		>
			<div class="flex items-center gap-md mb-lg">
				<div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background: rgba(255, 91, 79, 0.15);">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FF5B4F;">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
					</svg>
				</div>
				<div>
					<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">Delete Command</h3>
					<p class="text-caption" style="color: var(--text-muted);">This action cannot be undone</p>
				</div>
			</div>

			<p class="text-body-sm mb-md" style="color: var(--text-secondary);">
				Are you sure you want to delete <strong class="font-mono" style="color: var(--text-primary);">{deleteConfirmName}</strong>?
			</p>

			<div class="flex gap-sm justify-end">
				<button
					type="button"
					class="btn-secondary px-4 py-2 text-body-sm"
					onclick={cancelDelete}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn-danger px-4 py-2 text-body-sm"
					onclick={() => deleteCommand(deleteTarget)}
				>
					Delete
				</button>
			</div>
		</div>
	</dialog>
{/if}
{/if}