<script lang="ts">
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { Card, NginxEditorModal, NginxCreateModal, NginxOutputModal } from '$lib/ui/components';
	import type { PageData } from './$types';
	import type { NginxConfigFile } from '$lib/nginx/nginx.service';

	let { data }: { data: PageData } = $props();

	let files = $derived(data.files || []);
	let baseDir = $derived(data.baseDir || '/etc/nginx/conf.d');

	// Search & filter
	let searchQuery = $state('');
	let filterTab = $state<'all' | 'apps' | 'main'>('all');

	// Modals state
	let editorOpen = $state(false);
	let currentEditFile = $state<NginxConfigFile | null>(null);
	let currentFileContent = $state('');
	let loadingFile = $state(false);

	let createModalOpen = $state(false);

	// Output Modal state
	let outputModalOpen = $state(false);
	let outputModalTitle = $state('');
	let outputModalCommand = $state('');
	let outputModalContent = $state('');
	let outputModalSuccess = $state(true);
	let outputModalLoading = $state(false);

	// Reload Modal state
	let reloadModalOpen = $state(false);
	let reloadPassword = $state('');
	let reloading = $state(false);

	// Notification banners
	let pendingReloadNotice = $state(false);
	let feedback = $state<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

	// Derived metrics
	let mainConfigs = $derived(files.filter((f) => !f.isApp));
	let appConfigs = $derived(files.filter((f) => f.isApp));
	let totalLocations = $derived(files.reduce((acc, f) => acc + f.locations.length, 0));
	let mainDomain = $derived(
		mainConfigs.flatMap((f) => f.serverNames)[0] || 'engine.clinicamedicos.com'
	);

	let stats = $derived([
		{
			label: 'Applications',
			value: appConfigs.length,
			detail: 'apps/*.conf',
			icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
		},
		{
			label: 'Proxy Routes',
			value: totalLocations,
			detail: 'active locations',
			icon: 'M13 10V3L4 14h7v7l9-11h-7z'
		},
		{
			label: 'Main Server',
			value: mainConfigs.length,
			detail: mainDomain,
			icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
		},
		{
			label: 'Nginx Status',
			value: 'Active',
			detail: 'reverse proxy',
			icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01'
		}
	]);

	// Filtered files
	let filteredFiles = $derived(
		files.filter((f) => {
			if (filterTab === 'apps' && !f.isApp) return false;
			if (filterTab === 'main' && f.isApp) return false;

			if (!searchQuery.trim()) return true;
			const q = searchQuery.toLowerCase().trim();

			const inFilename = f.filename.toLowerCase().includes(q);
			const inComment = f.commentTitle?.toLowerCase().includes(q) ?? false;
			const inLocations = f.locations.some(
				(l) => l.path.toLowerCase().includes(q) || (l.proxyPass?.toLowerCase().includes(q) ?? false)
			);
			const inServers = f.serverNames.some((s) => s.toLowerCase().includes(q));

			return inFilename || inComment || inLocations || inServers;
		})
	);

	function showFeedback(type: 'success' | 'error' | 'warning', text: string) {
		feedback = { type, text };
		setTimeout(() => {
			if (feedback?.text === text) feedback = null;
		}, 6000);
	}

	async function openEditor(file: NginxConfigFile) {
		currentEditFile = file;
		loadingFile = true;
		try {
			const res = await fetch(`${base}/api/nginx/configs/file?path=${encodeURIComponent(file.relativePath)}`);
			const resData = await res.json();
			if (res.ok && resData.success) {
				currentFileContent = resData.content;
				editorOpen = true;
			} else {
				showFeedback('error', resData.error || 'Failed to read file');
			}
		} catch {
			showFeedback('error', 'Connection error reading configuration');
		} finally {
			loadingFile = false;
		}
	}

	async function runTestNginx() {
		outputModalTitle = 'Test Nginx Configuration';
		outputModalCommand = 'sudo nginx -t';
		outputModalContent = 'Testing syntax...';
		outputModalLoading = true;
		outputModalOpen = true;

		try {
			const res = await fetch(`${base}/api/nginx/test`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			const resData = await res.json();
			outputModalLoading = false;
			outputModalSuccess = resData.success;
			outputModalContent = resData.output || (resData.success ? 'Syntax is ok' : 'Test failed');
		} catch (err: any) {
			outputModalLoading = false;
			outputModalSuccess = false;
			outputModalContent = err.message || 'Execution error';
		}
	}

	function openReloadPrompt(prefilledPassword?: string) {
		if (prefilledPassword) {
			reloadPassword = prefilledPassword;
		}
		reloadModalOpen = true;
	}

	async function executeReload() {
		if (!reloadPassword) return;
		reloading = true;

		try {
			const res = await fetch(`${base}/api/nginx/reload`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: reloadPassword })
			});

			const resData = await res.json();
			reloading = false;
			reloadModalOpen = false;

			outputModalTitle = 'Reload Nginx';
			outputModalCommand = 'sudo nginx -s reload';
			outputModalSuccess = resData.success;
			outputModalContent = resData.output || (resData.success ? 'Nginx reloaded successfully.' : 'Reload failed');
			outputModalLoading = false;
			outputModalOpen = true;

			if (resData.success) {
				pendingReloadNotice = false;
				showFeedback('success', 'Nginx reloaded successfully');
			} else {
				showFeedback('error', resData.output || 'Failed to reload Nginx');
			}
		} catch (err: any) {
			reloading = false;
			showFeedback('error', err.message || 'Connection error');
		}
	}

	function handleFileSaved() {
		pendingReloadNotice = true;
		invalidateAll();
	}

	function handleFileCreated(filename: string) {
		pendingReloadNotice = true;
		invalidateAll();
	}
</script>

<svelte:head>
	<title>Nginx | PM2 View</title>
</svelte:head>

<div class="max-w-5xl mx-auto pb-2xl">
	<!-- Page Header -->
	<div class="flex items-center justify-between mb-xl flex-wrap gap-md">
		<div>
			<h1 class="text-hero font-bold mb-xs" style="view-transition-name: page-title; color: var(--text-primary);">
				Nginx
			</h1>
			<p class="text-body-sm" style="color: var(--text-secondary);">
				Manage reverse proxy routes and configurations in <code class="font-mono text-caption opacity-80">{baseDir}</code>
			</p>
		</div>

		<div class="flex items-center gap-xs flex-wrap">
			<button
				class="btn-secondary px-3 py-1.5 text-body-sm inline-flex items-center gap-1.5"
				onclick={runTestNginx}
				title="Run sudo nginx -t"
			>
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
				</svg>
				Test Nginx
			</button>

			<button
				class="btn-secondary px-3 py-1.5 text-body-sm inline-flex items-center gap-1.5"
				onclick={() => openReloadPrompt()}
				title="Run sudo nginx -s reload"
			>
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
				</svg>
				Reload Nginx
			</button>

			<button
				class="btn-primary px-3.5 py-1.5 text-body-sm inline-flex items-center gap-1.5"
				onclick={() => (createModalOpen = true)}
			>
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
				</svg>
				New App
			</button>
		</div>
	</div>

	<!-- Feedback Banner -->
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

	<!-- Pending Reload Alert Banner -->
	{#if pendingReloadNotice}
		<div class="mb-lg">
			<div
				class="flex items-center justify-between gap-md p-md rounded-lg"
				style="background: rgba(255, 183, 77, 0.08); border: 1px solid rgba(255, 183, 77, 0.25);"
			>
				<div class="flex items-center gap-md">
					<svg class="w-5 h-5 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
					</svg>
					<div>
						<p class="text-body-sm font-medium text-amber-400">Configuration updated</p>
						<p class="text-caption" style="color: var(--text-secondary);">
							Remember to reload Nginx for the new proxy rules to take effect.
						</p>
					</div>
				</div>
				<div class="flex items-center gap-xs shrink-0">
					<button
						class="btn-primary px-3 py-1 text-caption font-semibold"
						style="background: #FFB74D; color: #111;"
						onclick={() => openReloadPrompt()}
					>
						Reload Now
					</button>
					<button
						class="p-1 rounded hover:opacity-75"
						style="color: var(--text-muted);"
						onclick={() => (pendingReloadNotice = false)}
						aria-label="Dismiss notice"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>
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
							<p class="text-caption mt-1 truncate" style="color: var(--text-muted);" title={stat.detail}>
								{stat.detail}
							</p>
						</div>
						<div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background: rgba(0, 112, 243, 0.08);">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #0070F3;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={stat.icon}/>
							</svg>
						</div>
					</div>
				</Card>
			</div>
		{/each}
	</div>

	<!-- Filter & Search Bar -->
	<div class="mb-lg flex items-center justify-between gap-md flex-wrap">
		<div class="relative flex-1 max-w-md">
			<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style="color: var(--text-muted);">
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
				</svg>
			</div>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Filter by name, route (/powerbi/) or target port..."
				class="w-full pl-9 pr-9 py-2 rounded-xl text-body-sm transition-all outline-none focus:ring-2 focus:ring-accent"
				style="background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-primary);"
				onkeydown={(e) => { if (e.key === 'Escape') searchQuery = ''; }}
			/>
			{#if searchQuery}
				<button
					type="button"
					class="absolute inset-y-0 right-0 pr-3 flex items-center transition-colors hover:opacity-80"
					style="color: var(--text-muted);"
					onclick={() => (searchQuery = '')}
					title="Clear search"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</button>
			{/if}
		</div>

		<!-- Filter Tabs -->
		<div class="flex items-center gap-xs">
			<div class="flex items-center p-0.5 rounded-lg border" style="background: var(--bg-surface); border-color: var(--border-color);">
				<button
					type="button"
					class="px-3 py-1 rounded-md text-caption font-medium transition-all"
					style={filterTab === 'all'
						? 'background: var(--bg-card); color: var(--text-primary); font-weight: 600;'
						: 'color: var(--text-secondary);'
					}
					onclick={() => (filterTab = 'all')}
				>
					All ({files.length})
				</button>
				<button
					type="button"
					class="px-3 py-1 rounded-md text-caption font-medium transition-all"
					style={filterTab === 'apps'
						? 'background: var(--bg-card); color: var(--text-primary); font-weight: 600;'
						: 'color: var(--text-secondary);'
					}
					onclick={() => (filterTab = 'apps')}
				>
					Apps ({appConfigs.length})
				</button>
				<button
					type="button"
					class="px-3 py-1 rounded-md text-caption font-medium transition-all"
					style={filterTab === 'main'
						? 'background: var(--bg-card); color: var(--text-primary); font-weight: 600;'
						: 'color: var(--text-secondary);'
					}
					onclick={() => (filterTab = 'main')}
				>
					Main ({mainConfigs.length})
				</button>
			</div>

			<button
				type="button"
				class="btn-secondary px-2.5 py-1 text-caption inline-flex items-center"
				onclick={() => invalidateAll()}
				title="Refresh list"
			>
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Main Server Section (rpatic.conf) -->
	{#if filterTab !== 'apps' && filteredFiles.some((f) => !f.isApp)}
		<div class="mb-xl">
			<h2 class="text-h3 font-semibold mb-md" style="color: var(--text-primary);">
				Main Gateway Server
			</h2>

			<div class="space-y-sm">
				{#each filteredFiles.filter((f) => !f.isApp) as file (file.relativePath)}
					<Card>
						<div class="flex items-center justify-between gap-md flex-wrap">
							<div class="flex items-center gap-md">
								<span class="w-2 h-2 rounded-full shrink-0" style="background: #0070F3;"></span>
								<div>
									<div class="flex items-center gap-2">
										<p class="text-body-sm font-medium" style="color: var(--text-primary);">
											{file.filename}
										</p>
										{#if file.serverNames.length > 0}
											<span class="text-caption font-mono px-2 py-0.5 rounded bg-[var(--bg-surface)]" style="color: var(--text-secondary);">
												{file.serverNames.join(', ')}
											</span>
										{/if}
									</div>
									<p class="text-caption mt-0.5" style="color: var(--text-muted);">
										HTTP (80) → HTTPS (443) SSL Redirect • Includes <code class="font-mono">apps/*.conf</code>
									</p>
								</div>
							</div>

							<div class="flex items-center gap-sm">
								<button
									class="btn-secondary px-3 py-1.5 text-caption inline-flex items-center gap-1.5"
									onclick={() => openEditor(file)}
									disabled={loadingFile}
								>
									<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
									</svg>
									Edit Config
								</button>
							</div>
						</div>
					</Card>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Apps Section (/apps/*.conf) -->
	{#if filterTab !== 'main'}
		<div>
			<div class="flex items-center justify-between mb-md">
				<h2 class="text-h3 font-semibold" style="color: var(--text-primary);">
					Applications ({filteredFiles.filter((f) => f.isApp).length})
				</h2>
				<span class="text-caption" style="color: var(--text-muted);">
					/etc/nginx/conf.d/apps/
				</span>
			</div>

			{#if filteredFiles.filter((f) => f.isApp).length === 0}
				<Card>
					<div class="text-center py-2xl">
						<svg class="w-10 h-10 mx-auto mb-md opacity-40" style="color: var(--text-muted);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
						</svg>
						<p class="text-h3 font-semibold mb-xs" style="color: var(--text-primary);">
							No matching configurations found
						</p>
						<p class="text-body-sm mb-lg" style="color: var(--text-secondary);">
							No config file matches "{searchQuery}".
						</p>
						<button
							class="btn-secondary px-4 py-2 text-body-sm"
							onclick={() => { searchQuery = ''; filterTab = 'all'; }}
						>
							Clear filter
						</button>
					</div>
				</Card>
			{:else}
				<div class="space-y-sm">
					{#each filteredFiles.filter((f) => f.isApp) as file, i (file.relativePath)}
						<div class="stagger-item" style="--stagger-index: {i};">
							<Card>
								<div class="flex items-center justify-between gap-md flex-wrap">
									<!-- Left: Dot + Title + Routing -->
									<div class="flex items-center gap-md min-w-0 flex-1 pr-4">
										<span
											class="w-2 h-2 rounded-full shrink-0"
											style="background: {file.locations.length > 0 ? '#00E676' : '#666666'};"
										></span>

										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2 flex-wrap">
												<span class="text-body-sm font-medium truncate" style="color: var(--text-primary);">
													{file.commentTitle || file.filename.replace(/\.conf$/, '')}
												</span>
												<span class="text-caption font-mono text-[var(--text-muted)]">
													{file.filename}
												</span>
											</div>

											<!-- Route Preview -->
											{#if file.locations.length > 0}
												<div class="flex items-center gap-2 mt-1 text-caption flex-wrap">
													{#each file.locations as loc}
														<span class="font-mono font-medium" style="color: #0070F3;">
															{loc.path}
														</span>
														{#if loc.proxyPass}
															<span style="color: var(--text-muted);">→</span>
															<span class="font-mono" style="color: var(--text-secondary);">
																{loc.proxyPass}
															</span>
														{/if}
														{#if loc.proxyBuffering === 'off'}
															<span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)]" style="color: var(--text-muted);">
																buffer: off
															</span>
														{/if}
														{#if loc.isWebsocket}
															<span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] text-purple-400">
																ws
															</span>
														{/if}
													{/each}
												</div>
											{:else}
												<p class="text-caption mt-0.5" style="color: var(--text-muted);">
													No location block defined
												</p>
											{/if}
										</div>
									</div>

									<!-- Right: File size + Edit button -->
									<div class="flex items-center gap-md shrink-0">
										<span class="text-caption font-mono hidden sm:inline-block" style="color: var(--text-muted);">
											{(file.size / 1024).toFixed(1)} KB
										</span>

										<button
											class="btn-secondary px-3 py-1.5 text-caption inline-flex items-center gap-1.5"
											onclick={() => openEditor(file)}
											disabled={loadingFile}
										>
											<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
											</svg>
											Edit
										</button>
									</div>
								</div>
							</Card>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Nginx Editor Modal -->
{#if currentEditFile}
	<NginxEditorModal
		open={editorOpen}
		filePath={currentEditFile.relativePath}
		fileName={currentEditFile.filename}
		initialContent={currentFileContent}
		onClose={() => { editorOpen = false; currentEditFile = null; }}
		onSaved={handleFileSaved}
		onReloadRequest={(pwd) => {
			editorOpen = false;
			openReloadPrompt(pwd);
		}}
	/>
{/if}

<!-- Nginx Create Modal -->
<NginxCreateModal
	open={createModalOpen}
	onClose={() => (createModalOpen = false)}
	onCreated={handleFileCreated}
	onReloadRequest={(pwd) => openReloadPrompt(pwd)}
/>

<!-- Nginx Output Modal (Test / Reload terminal output) -->
<NginxOutputModal
	open={outputModalOpen}
	title={outputModalTitle}
	command={outputModalCommand}
	output={outputModalContent}
	success={outputModalSuccess}
	loading={outputModalLoading}
	onClose={() => (outputModalOpen = false)}
/>

<!-- Reload Sudo Confirmation Modal -->
{#if reloadModalOpen}
	<dialog
		open
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		style="background: transparent; border: none;"
	>
		<!-- Backdrop -->
		<button
			type="button"
			class="fixed inset-0"
			style="background: rgba(0,0,0,0.6); border: none; cursor: pointer;"
			onclick={() => { if (!reloading) reloadModalOpen = false; }}
			aria-label="Close modal"
		></button>

		<div
			class="relative w-full max-w-md rounded-xl p-lg shadow-2xl"
			style="background: var(--bg-surface); border: 1px solid var(--border-color);"
		>
			<h3 class="text-h3 font-semibold mb-xs" style="color: var(--text-primary);">
				Reload Nginx
			</h3>
			<p class="text-body-sm mb-lg" style="color: var(--text-secondary);">
				Runs <code class="font-mono text-caption">sudo nginx -s reload</code> to apply configuration changes without downtime.
			</p>

			<div class="mb-lg">
				<label for="reload-sudo-pwd" class="block text-caption font-medium mb-1.5" style="color: var(--text-secondary);">
					Sudo password:
				</label>
				<input
					id="reload-sudo-pwd"
					type="password"
					bind:value={reloadPassword}
					onkeydown={(e) => { if (e.key === 'Enter') executeReload(); }}
					placeholder="Enter sudo password"
					class="w-full px-3 py-2 rounded-xl text-body-sm outline-none transition-all focus:ring-2 focus:ring-accent"
					style="background: var(--bg-base); color: var(--text-primary); border: 1px solid var(--border-color);"
				/>
			</div>

			<div class="flex items-center justify-end gap-sm">
				<button
					type="button"
					class="btn-secondary px-4 py-2 text-body-sm"
					onclick={() => (reloadModalOpen = false)}
					disabled={reloading}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn-primary px-4 py-2 text-body-sm inline-flex items-center gap-1.5"
					onclick={executeReload}
					disabled={reloading || !reloadPassword}
				>
					{#if reloading}
						<svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
						</svg>
						Reloading...
					{:else}
						Reload Nginx
					{/if}
				</button>
			</div>
		</div>
	</dialog>
{/if}
