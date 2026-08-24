<script lang="ts">
	import { base } from '$app/paths';
	import { browser } from '$app/environment';
	import { Card, Button, Badge, FeedbackBanner, GitHubImportModal } from '$lib/ui/components';
	import type { PageData } from './$types';
	import type { GitHubRepoDTO } from '$lib/github/github.types';

	let { data }: { data: PageData } = $props();

	let feedback = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let showImportModal = $state(false);
	let selectedRepo = $state<GitHubRepoDTO | null>(null);

	// Search and sort state
	let searchQuery = $state('');
	let sortBy = $state<'name' | 'updated'>('name');
	let sortOrder = $state<'asc' | 'desc'>('asc');
	let showSortMenu = $state(false);
	let sortMenuRef = $state<HTMLDivElement | undefined>();
	let showDisconnectConfirm = $state(false);
	let disconnecting = $state(false);

	// Close sort menu on outside click
	$effect(() => {
		if (!showSortMenu || !browser) return;
		function handleClick(e: MouseEvent) {
			if (sortMenuRef && !sortMenuRef.contains(e.target as Node)) {
				showSortMenu = false;
			}
		}
		document.addEventListener('mousedown', handleClick);
		return () => document.removeEventListener('mousedown', handleClick);
	});

	function handleImportClick(repo: GitHubRepoDTO) {
		selectedRepo = repo;
		showImportModal = true;
	}

	function handleModalClose() {
		showImportModal = false;
		selectedRepo = null;
	}

	async function handleModalSuccess() {
		feedback = {
			type: 'success',
			text: selectedRepo
				? `Successfully imported ${selectedRepo.name}`
				: 'Successfully imported repository',
		};
	}

	// Filtered and sorted repositories
	let filteredRepos = $derived(
		data.repositories
			.filter((repo) => {
				if (!searchQuery.trim()) return true;
				const q = searchQuery.toLowerCase();
				return repo.name.toLowerCase().includes(q) || repo.fullName.toLowerCase().includes(q);
			})
			.toSorted((a, b) => {
				let cmp: number;
				if (sortBy === 'name') {
					cmp = a.name.localeCompare(b.name);
				} else {
					cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
				}
				return sortOrder === 'asc' ? cmp : -cmp;
			})
	);

	function sortLabel(): string {
		const dir = sortOrder === 'asc' ? '↑' : '↓';
		return sortBy === 'name' ? `${dir} Name` : `${dir} Last Updated`;
	}

	function toggleSortDir() {
		sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
	}

	function setSortBy(by: 'name' | 'updated') {
		sortBy = by;
		showSortMenu = false;
	}

	function formatUpdated(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		const diffDays = Math.floor(diffHours / 24);
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	}

	async function handleDisconnect() {
		disconnecting = true;
		try {
			const res = await fetch(`${base}/api/github/disconnect`, {
				method: 'POST',
			});

			if (!res.ok) {
				const error = await res.json();
				feedback = { type: 'error', text: error.error || 'Failed to disconnect GitHub account' };
				return;
			}

			feedback = { type: 'success', text: 'GitHub account disconnected successfully' };
			// Reload page to reflect disconnected state
			window.location.reload();
		} catch {
			feedback = { type: 'error', text: 'Failed to disconnect GitHub account' };
		} finally {
			disconnecting = false;
			showDisconnectConfirm = false;
		}
	}

	function toggleSort() {
		sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
	}
</script>

<div class="space-y-lg">
	<div class="flex items-start justify-between">
		<div>
			<h1 class="text-heading-lg">GitHub Integration</h1>
			<p class="text-body text-muted mt-1">
				Connect your GitHub account to import repositories.
			</p>
		</div>
	</div>

	{#if feedback}
		<FeedbackBanner type={feedback.type} message={feedback.text} onDismiss={() => (feedback = null)} />
	{/if}

	{#if data.connected}
		<Card>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-md">
					{#if data.installation?.accountAvatar}
						<img
							src={data.installation.accountAvatar}
							alt={data.installation.accountLogin}
							class="w-10 h-10 rounded-full"
						/>
					{/if}
					<div>
						<div class="flex items-center gap-sm">
							<span class="text-body font-medium">
								{data.installation?.accountLogin}
							</span>
							<Badge variant="online">Connected</Badge>
						</div>
						<span class="text-caption text-muted">
							{data.installation?.accountType}
						</span>
					</div>
				</div>

				<!-- Disconnect button -->
				{#if showDisconnectConfirm}
					<div class="flex items-center gap-sm">
						<span class="text-caption text-muted">Disconnect?</span>
						<button
							type="button"
							class="btn-secondary px-3 py-1.5 text-caption"
							onclick={() => showDisconnectConfirm = false}
							disabled={disconnecting}
						>
							Cancel
						</button>
						<button
							type="button"
							class="px-3 py-1.5 text-caption font-semibold rounded-lg"
							style="background: rgba(255, 82, 82, 0.15); color: #FF5252; border: 1px solid rgba(255, 82, 82, 0.3);"
							onclick={handleDisconnect}
							disabled={disconnecting}
						>
							{disconnecting ? 'Disconnecting...' : 'Disconnect'}
						</button>
					</div>
				{:else}
					<button
						type="button"
						class="btn-secondary px-3 py-1.5 text-caption"
						style="color: #FF5252;"
						onclick={() => showDisconnectConfirm = true}
					>
						Disconnect Account
					</button>
				{/if}
			</div>
		</Card>

		<div>
			<div class="flex items-center justify-between mb-md">
				<h2 class="text-heading-md">Repositories</h2>
				<div class="flex items-center gap-sm">
					<!-- Sort dropdown -->
					<div class="relative" bind:this={sortMenuRef}>
						<button
							type="button"
							class="btn-secondary px-3 py-2 text-caption flex items-center gap-xs"
							onclick={() => showSortMenu = !showSortMenu}
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l-4 4m0 0l4 4"/>
							</svg>
							Sort
						</button>
						{#if showSortMenu}
							<div
								class="absolute right-0 top-full mt-1 w-48 rounded-lg shadow-lg z-10"
								style="background: var(--bg-surface); border: 1px solid var(--border-color);"
							>
								<div class="p-1">
									<button
										type="button"
										class="w-full flex items-center justify-between px-3 py-2 rounded-md text-caption"
										style="background: {sortBy === 'name' ? 'rgba(56, 205, 255, 0.1)' : 'transparent'}; color: var(--text-primary);"
										onclick={() => setSortBy('name')}
									>
										<span>Name</span>
										{#if sortBy === 'name'}
											<span style="color: #38CDFF;">{sortOrder === 'asc' ? '↑' : '↓'}</span>
										{/if}
									</button>
									<button
										type="button"
										class="w-full flex items-center justify-between px-3 py-2 rounded-md text-caption"
										style="background: {sortBy === 'updated' ? 'rgba(56, 205, 255, 0.1)' : 'transparent'}; color: var(--text-primary);"
										onclick={() => setSortBy('updated')}
									>
										<span>Last Updated</span>
										{#if sortBy === 'updated'}
											<span style="color: #38CDFF;">{sortOrder === 'asc' ? '↑' : '↓'}</span>
										{/if}
									</button>
									<div class="border-t my-1" style="border-color: var(--border-color);"></div>
									<button
										type="button"
										class="w-full flex items-center justify-between px-3 py-2 rounded-md text-caption"
										style="color: var(--text-secondary);"
										onclick={toggleSortDir}
									>
										<span>Direction</span>
										<span>{sortOrder === 'asc' ? 'Ascending ↑' : 'Descending ↓'}</span>
									</button>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Search bar -->
			<div class="mb-md">
				<div class="relative">
					<svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--text-muted);">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
					</svg>
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search repositories by name..."
						class="w-full pl-10 pr-4 py-2.5 text-body-sm rounded-lg"
						style="background: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-primary);"
					/>
				</div>
			</div>

			{#if filteredRepos.length === 0}
				<Card variant="ghost">
					<p class="text-body text-muted text-center py-lg">
						{searchQuery
							? `No repositories match "${searchQuery}"`
							: 'No repositories accessible. Update your GitHub App installation to grant access.'}
					</p>
				</Card>
			{:else}
				<div class="space-y-sm">
					{#each filteredRepos as repo (repo.id)}
						<Card>
							<div class="flex items-center justify-between">
								<div class="min-w-0 flex-1">
									<p class="text-body font-medium truncate">{repo.name}</p>
									<p class="text-caption text-muted truncate">
										{repo.fullName}
									</p>
									<div class="flex items-center gap-sm mt-1">
										{#if repo.private}
											<Badge>Private</Badge>
										{:else}
											<Badge variant="offline">Public</Badge>
										{/if}
										<span class="text-caption text-muted">
											{repo.defaultBranch}
										</span>
										<span class="text-caption text-muted">
											· Updated {formatUpdated(repo.updatedAt)}
										</span>
									</div>
								</div>
								<div class="ml-md flex-shrink-0">
									<Button
										variant="primary"
										size="sm"
										onclick={() => handleImportClick(repo)}
									>
										Import
									</Button>
								</div>
							</div>
						</Card>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<Card>
			<div class="text-center py-lg">
				<p class="text-body text-muted mb-md">
					Connect your GitHub account to start importing repositories.
				</p>
				<a href={data.setupUrl}>
					<Button variant="primary">Connect GitHub</Button>
				</a>
			</div>
		</Card>
	{/if}
</div>

<GitHubImportModal
	open={showImportModal}
	repository={selectedRepo}
	reposPath={data.config?.reposPath}
	onClose={handleModalClose}
	onSuccess={handleModalSuccess}
/>
