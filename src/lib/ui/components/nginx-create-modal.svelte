<script lang="ts">
	import { base } from '$app/paths';

	let {
		open = false,
		onClose,
		onCreated,
		onReloadRequest
	}: {
		open: boolean;
		onClose: () => void;
		onCreated: (filename: string) => void;
		onReloadRequest: (password: string) => void;
	} = $props();

	let name = $state('');
	let sudoPassword = $state('');
	let selectedTemplate = $state<'proxy' | 'websocket' | 'static' | 'blank'>('proxy');
	let content = $state('');
	let creating = $state(false);
	let errorMessage = $state<string | null>(null);
	let testResult = $state<{ ok: boolean; output: string } | null>(null);
	let createdFilename = $state<string | null>(null);
	let dialogRef = $state<HTMLDialogElement | undefined>();

	const templates = {
		proxy: `    # __________________________
    # REVERSE PROXY APP
    # __________________________
    location /my-app/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_max_temp_file_size 0;
        gzip off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
`,
		websocket: `    # __________________________
    # WEBSOCKET & API APP
    # __________________________
    location /ws-app/ {
        proxy_pass http://localhost:4000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
`,
		static: `    # __________________________
    # STATIC FRONTEND APP
    # __________________________
    location /app/ {
        alias /var/www/my-app/dist/;
        index index.html;
        try_files $uri $uri/ /app/index.html;
        expires 1h;
        add_header Cache-Control "public, no-transform";
    }
`,
		blank: `    # __________________________
    # CUSTOM CONFIG
    # __________________________
    location /custom/ {
        # Custom directives
    }
`
	};

	$effect(() => {
		if (open) {
			name = '';
			sudoPassword = '';
			selectedTemplate = 'proxy';
			content = templates.proxy;
			errorMessage = null;
			testResult = null;
			createdFilename = null;
			dialogRef?.showModal();
		} else {
			dialogRef?.close();
		}
	});

	function applyTemplate(tpl: 'proxy' | 'websocket' | 'static' | 'blank') {
		selectedTemplate = tpl;
		content = templates[tpl];
	}

	async function handleCreate() {
		if (!name.trim()) {
			errorMessage = 'Please enter a name for the app configuration';
			return;
		}

		creating = true;
		errorMessage = null;
		testResult = null;

		try {
			const res = await fetch(`${base}/api/nginx/configs?action=create`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: name.trim(),
					content,
					password: sudoPassword || undefined
				})
			});

			const data = await res.json();

			if (!res.ok || !data.success) {
				errorMessage = data.error || 'Failed to create configuration file';
				if (data.testResult) {
					testResult = data.testResult;
				}
			} else {
				testResult = data.testResult;
				const finalName = data.filename || `${name.trim()}.conf`;
				createdFilename = finalName;
				onCreated(finalName);
			}
		} catch (err: any) {
			errorMessage = err.message || 'Connection error';
		} finally {
			creating = false;
		}
	}
</script>

{#if open}
	<dialog
		bind:this={dialogRef}
		class="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
		style="background: transparent; border: none;"
		onclose={onClose}
	>
		<!-- Backdrop -->
		<button
			type="button"
			class="fixed inset-0"
			style="background: rgba(0,0,0,0.6); border: none; cursor: pointer;"
			onclick={() => { if (!creating) onClose(); }}
			aria-label="Close modal"
		></button>

		<!-- Modal content (Expanded width and height for breathing room) -->
		<div
			class="relative w-full max-w-4xl rounded-xl shadow-2xl p-xl flex flex-col h-[88vh]"
			style="background: var(--bg-surface); border: 1px solid var(--border-color);"
		>
			<!-- Header -->
			<div class="flex items-start justify-between pb-md mb-lg border-b shrink-0" style="border-color: var(--border-color);">
				<div class="space-y-1">
					<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">
						New Application Config
					</h3>
					<p class="text-body-sm" style="color: var(--text-secondary);">
						Creates a new reverse proxy configuration file in <code class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)]">/etc/nginx/conf.d/apps/</code>
					</p>
				</div>

				<button
					type="button"
					class="p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors"
					style="color: var(--text-muted);"
					onclick={onClose}
					aria-label="Close"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</button>
			</div>

			<!-- Success notice with reload reminder -->
			{#if createdFilename && testResult?.ok}
				<div class="mb-lg p-md rounded-lg shrink-0" style="background: rgba(0, 230, 118, 0.08); border: 1px solid rgba(0, 230, 118, 0.25);">
					<p class="text-body-sm font-semibold" style="color: #00E676;">
						✓ File <span class="font-mono">{createdFilename}</span> created successfully!
					</p>
					<p class="text-caption mt-1" style="color: var(--text-secondary);">
						Configuration syntax check passed (<code class="font-mono">nginx -t</code>).
					</p>
					<div class="mt-3 pt-2.5 border-t border-emerald-500/20 flex items-center justify-between gap-2">
						<span class="text-caption font-medium text-amber-400">
							⚠️ Remember to reload Nginx to apply changes.
						</span>
						<button
							type="button"
							class="btn-primary px-3 py-1 text-caption font-semibold"
							style="background: #FFB74D; color: #111;"
							onclick={() => {
								const pwd = sudoPassword;
								onClose();
								onReloadRequest(pwd);
							}}
						>
							Reload Nginx now
						</button>
					</div>
				</div>
			{/if}

			{#if errorMessage}
				<div
					class="mb-md p-md rounded-lg text-caption flex items-center justify-between shrink-0"
					style="background: rgba(255, 91, 79, 0.08); border: 1px solid rgba(255, 91, 79, 0.25); color: #FF5B4F;"
				>
					<div>
						<p class="font-semibold">{errorMessage}</p>
						{#if testResult && !testResult.ok}
							<pre class="mt-1 font-mono text-[11px] whitespace-pre-wrap opacity-90">{testResult.output}</pre>
						{/if}
					</div>
					<button type="button" onclick={() => (errorMessage = null)}>✕</button>
				</div>
			{/if}

			{#if !createdFilename}
				<div class="space-y-md overflow-y-auto flex-1 min-h-0 pr-1 flex flex-col">
					<!-- Filename & Template picker grid -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-md shrink-0">
						<div>
							<label for="app-config-name" class="block text-caption font-medium mb-1.5" style="color: var(--text-secondary);">
								File Name:
							</label>
							<div class="flex items-center">
								<input
									id="app-config-name"
									type="text"
									bind:value={name}
									placeholder="e.g. agendamiento, smart-lab"
									class="flex-1 px-3.5 py-2 rounded-l-xl text-body-sm outline-none transition-all focus:ring-2 focus:ring-accent font-mono"
									style="background: var(--bg-base); color: var(--text-primary); border: 1px solid var(--border-color); border-right: none;"
								/>
								<span
									class="px-3 py-2 rounded-r-xl text-caption font-mono border"
									style="background: var(--bg-card); color: var(--text-muted); border-color: var(--border-color);"
								>
									.conf
								</span>
							</div>
						</div>

						<div>
							<span class="block text-caption font-medium mb-1.5" style="color: var(--text-secondary);">
								Preset Template:
							</span>
							<div class="grid grid-cols-2 gap-2">
								<button
									type="button"
									class="px-3 py-2 rounded-lg text-caption text-left transition-all border font-medium"
									style={selectedTemplate === 'proxy'
										? 'background: rgba(0, 112, 243, 0.08); border-color: #0070F3; color: #0070F3;'
										: 'background: var(--bg-card); border-color: var(--border-color); color: var(--text-secondary);'
									}
									onclick={() => applyTemplate('proxy')}
								>
									Reverse Proxy
								</button>
								<button
									type="button"
									class="px-3 py-2 rounded-lg text-caption text-left transition-all border font-medium"
									style={selectedTemplate === 'websocket'
										? 'background: rgba(0, 112, 243, 0.08); border-color: #0070F3; color: #0070F3;'
										: 'background: var(--bg-card); border-color: var(--border-color); color: var(--text-secondary);'
									}
									onclick={() => applyTemplate('websocket')}
								>
									WebSocket / SSE
								</button>
								<button
									type="button"
									class="px-3 py-2 rounded-lg text-caption text-left transition-all border font-medium"
									style={selectedTemplate === 'static'
										? 'background: rgba(0, 112, 243, 0.08); border-color: #0070F3; color: #0070F3;'
										: 'background: var(--bg-card); border-color: var(--border-color); color: var(--text-secondary);'
									}
									onclick={() => applyTemplate('static')}
								>
									Static Frontend
								</button>
								<button
									type="button"
									class="px-3 py-2 rounded-lg text-caption text-left transition-all border font-medium"
									style={selectedTemplate === 'blank'
										? 'background: rgba(0, 112, 243, 0.08); border-color: #0070F3; color: #0070F3;'
										: 'background: var(--bg-card); border-color: var(--border-color); color: var(--text-secondary);'
									}
									onclick={() => applyTemplate('blank')}
								>
									Blank
								</button>
							</div>
						</div>
					</div>

					<!-- Directives Code Area -->
					<div class="flex-1 flex flex-col min-h-[200px]">
						<label for="create-code-area" class="block text-caption font-medium mb-1.5" style="color: var(--text-secondary);">
							Configuration Directives:
						</label>
						<div
							class="flex-1 flex flex-col rounded-lg overflow-hidden border"
							style="background: var(--bg-base); border-color: var(--border-color);"
						>
							<div
								class="flex items-center justify-between px-md py-xs text-caption font-mono border-b"
								style="background: var(--bg-surface); border-color: var(--border-color); color: var(--text-muted);"
							>
								<span>Template Directives</span>
								<span>Tab = 4 spaces</span>
							</div>

							<textarea
								id="create-code-area"
								bind:value={content}
								spellcheck="false"
								class="flex-1 w-full p-md font-mono text-body-sm leading-relaxed outline-none resize-none overflow-auto"
								style="background: transparent; color: var(--text-primary); caret-color: #0070F3; tab-size: 4;"
							></textarea>
						</div>
					</div>
				</div>

				<!-- Sudo password row (Outside scroll container: always visible, full padding, never clipped) -->
				<div class="pt-md shrink-0">
					<label for="create-sudo-pwd" class="block text-caption font-medium mb-1.5" style="color: var(--text-secondary);">
						Sudo Password:
					</label>
					<input
						id="create-sudo-pwd"
						type="password"
						bind:value={sudoPassword}
						placeholder="Enter sudo password to create and write configuration"
						class="w-full px-3.5 py-2.5 rounded-xl text-body-sm outline-none transition-all focus:ring-2 focus:ring-accent"
						style="background: var(--bg-base); color: var(--text-primary); border: 1px solid var(--border-color);"
					/>
				</div>
			{/if}

			<!-- Footer -->
			<div class="flex items-center justify-end gap-sm pt-md mt-md border-t shrink-0" style="border-color: var(--border-color);">
				<button
					type="button"
					class="btn-secondary px-4 py-2 text-body-sm"
					onclick={onClose}
				>
					{createdFilename ? 'Close' : 'Cancel'}
				</button>
				{#if !createdFilename}
					<button
						type="button"
						class="btn-primary px-4 py-2 text-body-sm inline-flex items-center gap-1.5"
						onclick={handleCreate}
						disabled={creating}
					>
						{#if creating}
							<svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
							</svg>
							Creating & Testing...
						{:else}
							Create App
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</dialog>
{/if}
