<script lang="ts">
	import { Card } from '$lib/ui/components';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';

	interface LastDeployment {
		id: string;
		status: string;
		stage: string | null;
		commitSha: string | null;
		durationMs: number | null;
		finishedAt: string | null;
		error: string | null;
	}

	let {
		projectId,
		initialSettings,
	}: {
		projectId: string;
		initialSettings: {
			autoDeployEnabled: boolean;
			githubRepo: string | null;
			deployBranch: string;
			pm2Names?: string[];
		};
	} = $props();

	let enabled = $state(initialSettings.autoDeployEnabled);
	let repoInput = $state(initialSettings.githubRepo ?? '');
	let branchInput = $state(initialSettings.deployBranch);
	let pm2NamesInput = $state<string[]>(initialSettings.pm2Names ?? []);

	let isSaving = $state(false);
	let serverError = $state<string | null>(null);
	let savedJustNow = $state(false);

	const webhookUrl = $derived(
		`${env.PUBLIC_WEBHOOK_BASE_URL || page.url.origin}${base}/api/webhooks/github`
	);
	let copied = $state(false);

	function validateRepo(value: string): string | null {
		if (enabled && !value.trim()) return 'Repository is required when auto-deploy is enabled';
		if (value.trim() && !/^[A-Za-z0-9-_.]+\/[A-Za-z0-9-_.]+$/.test(value.trim())) {
			return 'Repository must be in owner/name format';
		}
		return null;
	}

	function validateBranch(value: string): string | null {
		if (!value.trim()) return 'Branch is required';
		if (!/^[A-Za-z0-9._\-/]+$/.test(value.trim())) return 'Branch contains invalid characters';
		return null;
	}

	async function save() {
		serverError = null;
		savedJustNow = false;

		const repoError = validateRepo(repoInput);
		const branchError = validateBranch(branchInput);
		if (repoError) { serverError = repoError; return; }
		if (branchError) { serverError = branchError; return; }

		isSaving = true;
		try {
			const res = await fetch(`${base}/api/projects/${projectId}/deployment-settings`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					autoDeployEnabled: enabled,
					githubRepo: repoInput.trim() || null,
					deployBranch: branchInput.trim(),
					pm2Names: pm2NamesInput.length > 0 ? pm2NamesInput.filter((n) => n.trim()) : undefined
				})
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				serverError = data.error || 'Failed to save settings';
				return;
			}
			enabled = data.autoDeployEnabled ?? enabled;
			repoInput = data.githubRepo ?? '';
			branchInput = data.deployBranch ?? branchInput;
			pm2NamesInput = data.pm2Names ?? pm2NamesInput;
			savedJustNow = true;
			setTimeout(() => (savedJustNow = false), 3000);
		} catch {
			serverError = 'Network error. Please try again.';
		} finally {
			isSaving = false;
		}
	}

	async function copyWebhookUrl() {
		try {
			await navigator.clipboard.writeText(webhookUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard unavailable — user can select the text manually
		}
	}
</script>

<Card padding>
	<div class="mb-md flex items-center justify-between">
		<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">
			Automatic Deployment
		</h3>
		{#if savedJustNow}
			<span class="text-caption" style="color: #4CAF50;">Saved</span>
		{/if}
	</div>

	<p class="text-caption mb-md" style="color: var(--text-muted);">
		Automatically deploy when GitHub sends a push event to the configured repository and branch.
	</p>

	{#if serverError}
		<div
			class="rounded-md p-sm text-body-sm mb-md"
			style="background: rgba(255, 82, 82, 0.1); color: #FF5252; border: 1px solid rgba(255, 82, 82, 0.2);"
		>
			{serverError}
		</div>
	{/if}

	<div class="space-y-md">
		<label class="flex items-center gap-sm cursor-pointer">
			<input type="checkbox" bind:checked={enabled} class="w-4 h-4" />
			<span class="text-body-sm" style="color: var(--text-primary);">Enable automatic deployment</span>
		</label>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-md">
			<div>
				<label class="text-caption block mb-2xs" for="autodeploy-repo" style="color: var(--text-muted);">
					GitHub Repository (owner/name)
				</label>
				<input
					id="autodeploy-repo"
					type="text"
					bind:value={repoInput}
					placeholder="e.g. octocat/hello-world"
					class="input-base w-full h-10 px-md text-body-sm font-mono"
				/>
				<p class="text-caption mt-2xs" style="color: var(--text-muted);">
					Copy it from the repo URL: github.com/<code>octocat</code>/<code>hello-world</code>
				</p>
			</div>
			<div>
				<label class="text-caption block mb-2xs" for="autodeploy-branch" style="color: var(--text-muted);">
					Branch
				</label>
				<input
					id="autodeploy-branch"
					type="text"
					bind:value={branchInput}
					placeholder="main"
					class="input-base w-full h-10 px-md text-body-sm font-mono"
				/>
			</div>
		</div>

		<!-- PM2 Process Names -->
		<div>
			<div class="flex items-center justify-between mb-2xs">
				<label class="text-caption" style="color: var(--text-muted);">
					PM2 Processes (restart all after build)
				</label>
				<button
					type="button"
					class="text-caption px-2 py-1 rounded"
					style="color: #38CDFF; background: transparent; border: 1px solid var(--border-color);"
					onclick={() => { pm2NamesInput = [...pm2NamesInput, '']; }}
				>
					+ Add Process
				</button>
			</div>
			{#if pm2NamesInput.length === 0}
				<p class="text-caption" style="color: var(--text-muted);">
					Uses <code class="font-mono">{initialSettings.pm2Name ?? 'pm2_name'}</code> (single process). Add more for multi-process deploys.
				</p>
			{:else}
				<div class="space-y-xs">
					{#each pm2NamesInput as name, i (i)}
						<div class="flex items-center gap-xs">
							<input
								type="text"
								bind:value={pm2NamesInput[i]}
								placeholder="e.g. atlas-backend"
								class="input-base flex-1 h-9 px-3 text-body-sm font-mono"
							/>
							<button
								type="button"
								class="p-2 rounded"
								style="color: #FF5252;"
								onclick={() => { pm2NamesInput = pm2NamesInput.filter((_, j) => j !== i); }}
								title="Remove process"
								aria-label="Remove process"
							>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
								</svg>
							</button>
						</div>
					{/each}
				</div>
				<p class="text-caption mt-2xs" style="color: var(--text-muted);">
					All processes will be restarted sequentially after the build succeeds.
				</p>
			{/if}
		</div>

		<div>
			<span class="text-caption block mb-2xs" style="color: var(--text-muted);">
				Webhook URL (configure in GitHub → Settings → Webhooks)
			</span>
			<div class="flex gap-xs">
				<code
					class="flex-1 min-w-0 truncate h-10 flex items-center px-md rounded-md text-caption font-mono"
					style="background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-secondary);"
				>
					{webhookUrl}
				</code>
				<button
					type="button"
					class="btn-secondary px-3 text-caption shrink-0"
					onclick={copyWebhookUrl}
				>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>
			<p class="text-caption mt-2xs" style="color: var(--text-muted);">
				Content type: <code>application/json</code> · Event: <code>push</code> · Secret: set via
				<code>GITHUB_WEBHOOK_SECRET</code> environment variable
			</p>
		</div>

		<div class="flex justify-end">
			<button
				type="button"
				class="btn-primary px-4 py-2 text-body-sm"
				disabled={isSaving || !projectId}
				onclick={save}
			>
				{isSaving ? 'Saving...' : 'Save Settings'}
			</button>
		</div>
	</div>
</Card>
