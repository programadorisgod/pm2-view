<script lang="ts">
	import { base } from '$app/paths';

	let {
		open = false,
		filePath = '',
		fileName = '',
		initialContent = '',
		onClose,
		onSaved,
		onReloadRequest
	}: {
		open: boolean;
		filePath: string;
		fileName: string;
		initialContent: string;
		onClose: () => void;
		onSaved: () => void;
		onReloadRequest: (password: string) => void;
	} = $props();

	let content = $state('');
	let sudoPassword = $state('');
	let showPasswordModal = $state(false);
	let saving = $state(false);
	let errorMessage = $state<string | null>(null);
	let testResult = $state<{ ok: boolean; output: string } | null>(null);
	let dialogRef = $state<HTMLDialogElement | undefined>();
	let textareaRef = $state<HTMLTextAreaElement | undefined>();

	$effect(() => {
		if (open) {
			content = initialContent;
			sudoPassword = '';
			errorMessage = null;
			testResult = null;
			showPasswordModal = false;
			dialogRef?.showModal();
		} else {
			dialogRef?.close();
		}
	});

	let linesCount = $derived((content.match(/\n/g) || []).length + 1);

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Tab') {
			e.preventDefault();
			const el = textareaRef;
			if (!el) return;
			const start = el.selectionStart;
			const end = el.selectionEnd;
			content = content.substring(0, start) + '    ' + content.substring(end);
			setTimeout(() => {
				el.selectionStart = el.selectionEnd = start + 4;
			}, 0);
		}
	}

	function handleSaveClick() {
		errorMessage = null;
		showPasswordModal = true;
	}

	async function performSave() {
		saving = true;
		errorMessage = null;
		testResult = null;

		try {
			const res = await fetch(`${base}/api/nginx/configs?action=save`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					path: filePath,
					content,
					password: sudoPassword || undefined
				})
			});

			const data = await res.json();

			if (!res.ok || !data.success) {
				errorMessage = data.error || 'Failed to save configuration file';
				if (data.testResult) {
					testResult = data.testResult;
				}
			} else {
				testResult = data.testResult;
				showPasswordModal = false;
				onSaved();
			}
		} catch (err: any) {
			errorMessage = err.message || 'Connection error';
		} finally {
			saving = false;
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
			onclick={() => { if (!saving) onClose(); }}
			aria-label="Close modal"
		></button>

		<!-- Main Modal content -->
		<div
			class="relative w-full max-w-5xl rounded-xl shadow-2xl p-xl flex flex-col h-[90vh]"
			style="background: var(--bg-surface); border: 1px solid var(--border-color);"
		>
			<!-- Header with aligned button & description -->
			<div class="flex items-start justify-between gap-lg pb-md mb-md border-b" style="border-color: var(--border-color);">
				<div class="space-y-1.5 min-w-0 flex-1">
					<div class="flex items-center gap-2 flex-wrap">
						<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">{fileName}</h3>
						<span
							class="text-caption font-mono px-2 py-0.5 rounded bg-[var(--bg-card)] border"
							style="color: var(--text-muted); border-color: var(--border-color);"
						>
							{filePath}
						</span>
					</div>
					<p class="text-body-sm leading-relaxed" style="color: var(--text-secondary);">
						Edit configuration directives. Syntax will be tested via <code class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)]">nginx -t</code> on save.
					</p>
				</div>

				<div class="flex items-center gap-sm shrink-0 pt-0.5">
					<button
						type="button"
						class="btn-primary px-4 py-2 text-body-sm inline-flex items-center gap-1.5"
						onclick={handleSaveClick}
						disabled={saving}
					>
						{#if saving}
							<svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
							</svg>
							Saving...
						{:else}
							Save Changes
						{/if}
					</button>

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
			</div>

			<!-- Test result banner if present -->
			{#if testResult}
				<div
					class="mb-md p-md rounded-lg flex items-start justify-between gap-md text-caption"
					style={testResult.ok
						? 'background: rgba(0, 230, 118, 0.08); border: 1px solid rgba(0, 230, 118, 0.25); color: #00E676;'
						: 'background: rgba(255, 91, 79, 0.08); border: 1px solid rgba(255, 91, 79, 0.25); color: #FF5B4F;'
					}
				>
					<div class="flex-1">
						{#if testResult.ok}
							<p class="font-semibold flex items-center gap-1.5">
								<span>✓ Saved and verified:</span>
								<span class="font-normal opacity-90">nginx -t syntax is ok.</span>
							</p>
							<div class="mt-2 flex items-center justify-between gap-2 pt-2 border-t border-emerald-500/20">
								<span class="text-caption text-emerald-400">
									Remember to reload Nginx to apply changes.
								</span>
								<button
									type="button"
									class="btn-secondary px-2.5 py-1 text-caption font-semibold"
									style="color: #00E676; border-color: rgba(0, 230, 118, 0.3);"
									onclick={() => onReloadRequest(sudoPassword)}
								>
									Reload Nginx now
								</button>
							</div>
						{:else}
							<p class="font-semibold">Syntax error in Nginx configuration:</p>
							<pre class="mt-1 font-mono text-[11px] whitespace-pre-wrap opacity-90">{testResult.output}</pre>
						{/if}
					</div>
					<button type="button" class="ml-auto opacity-70 hover:opacity-100" onclick={() => (testResult = null)}>
						✕
					</button>
				</div>
			{/if}

			{#if errorMessage && !testResult}
				<div
					class="mb-md p-md rounded-lg flex items-center justify-between text-caption"
					style="background: rgba(255, 91, 79, 0.08); border: 1px solid rgba(255, 91, 79, 0.25); color: #FF5B4F;"
				>
					<span>{errorMessage}</span>
					<button type="button" onclick={() => (errorMessage = null)}>✕</button>
				</div>
			{/if}

			<!-- Code editor box -->
			<div
				class="flex-1 flex flex-col rounded-lg overflow-hidden"
				style="background: var(--bg-base); border: 1px solid var(--border-color);"
			>
				<div
					class="flex items-center justify-between px-md py-xs text-caption font-mono border-b"
					style="background: var(--bg-surface); border-color: var(--border-color); color: var(--text-muted);"
				>
					<span>{linesCount} lines</span>
					<span>Tab = 4 spaces</span>
				</div>

				<textarea
					bind:this={textareaRef}
					bind:value={content}
					onkeydown={handleKeyDown}
					spellcheck="false"
					autocapitalize="none"
					autocomplete="off"
					class="flex-1 w-full p-md font-mono text-body-sm leading-relaxed outline-none resize-none overflow-auto"
					style="background: transparent; color: var(--text-primary); caret-color: #0070F3; tab-size: 4;"
				></textarea>
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-between pt-md mt-md border-t" style="border-color: var(--border-color);">
				<span class="text-caption" style="color: var(--text-muted);">
					Press <kbd class="px-1.5 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-color)]">Tab</kbd> to indent
				</span>
				<div class="flex items-center gap-xs">
					<button
						type="button"
						class="btn-secondary px-4 py-2 text-body-sm"
						onclick={onClose}
					>
						Cancel
					</button>
					<button
						type="button"
						class="btn-primary px-4 py-2 text-body-sm"
						onclick={handleSaveClick}
						disabled={saving}
					>
						Save Changes
					</button>
				</div>
			</div>
		</div>

		<!-- Password Confirmation Sub-Modal -->
		{#if showPasswordModal}
			<div
				class="fixed inset-0 z-60 flex items-center justify-center p-4"
				style="background: rgba(0,0,0,0.6);"
			>
				<div
					class="w-full max-w-sm rounded-xl p-lg shadow-2xl space-y-md"
					style="background: var(--bg-surface); border: 1px solid var(--border-color);"
				>
					<div>
						<h4 class="text-h3 font-semibold mb-xs" style="color: var(--text-primary);">Sudo Password Required</h4>
						<p class="text-caption" style="color: var(--text-secondary);">
							Writing to <code class="font-mono text-[11px]">{filePath}</code> requires superuser elevation.
						</p>
					</div>

					<div>
						<label for="editor-sudo-pwd" class="block text-caption font-medium mb-1.5" style="color: var(--text-secondary);">
							Sudo password:
						</label>
						<input
							id="editor-sudo-pwd"
							type="password"
							bind:value={sudoPassword}
							onkeydown={(e) => { if (e.key === 'Enter') performSave(); }}
							placeholder="Enter sudo password"
							class="w-full px-3 py-2 rounded-xl text-body-sm outline-none transition-all focus:ring-2 focus:ring-accent"
							style="background: var(--bg-base); color: var(--text-primary); border: 1px solid var(--border-color);"
						/>
					</div>

					<div class="flex items-center justify-end gap-xs pt-1">
						<button
							type="button"
							class="btn-secondary px-3 py-1.5 text-body-sm"
							onclick={() => (showPasswordModal = false)}
							disabled={saving}
						>
							Cancel
						</button>
						<button
							type="button"
							class="btn-primary px-4 py-1.5 text-body-sm"
							onclick={performSave}
							disabled={saving}
						>
							{saving ? 'Saving...' : 'Confirm & Save'}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</dialog>
{/if}
