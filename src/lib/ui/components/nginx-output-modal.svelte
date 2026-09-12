<script lang="ts">
	let {
		open = false,
		title = 'Nginx Output',
		command = '',
		output = '',
		success = true,
		loading = false,
		onClose
	}: {
		open: boolean;
		title?: string;
		command?: string;
		output?: string;
		success?: boolean;
		loading?: boolean;
		onClose: () => void;
	} = $props();

	let dialogRef = $state<HTMLDialogElement | undefined>();
	let copied = $state(false);

	$effect(() => {
		if (open) {
			dialogRef?.showModal();
		} else {
			dialogRef?.close();
		}
	});

	function copyToClipboard() {
		navigator.clipboard.writeText(output);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

{#if open}
	<dialog
		bind:this={dialogRef}
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		style="background: transparent; border: none;"
		onclose={onClose}
	>
		<!-- Backdrop -->
		<button
			type="button"
			class="fixed inset-0"
			style="background: rgba(0,0,0,0.6); border: none; cursor: pointer;"
			onclick={onClose}
			aria-label="Close modal"
		></button>

		<!-- Modal content -->
		<div
			class="relative w-full max-w-2xl rounded-xl shadow-2xl p-lg flex flex-col max-h-[85vh]"
			style="background: var(--bg-surface); border: 1px solid var(--border-color);"
		>
			<!-- Header -->
			<div class="flex items-center justify-between pb-md mb-md border-b" style="border-color: var(--border-color);">
				<div class="flex items-center gap-md">
					<div
						class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
						style="background: {loading ? 'rgba(0, 112, 243, 0.12)' : success ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 91, 79, 0.12)'};"
					>
						{#if loading}
							<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #0070F3;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
							</svg>
						{:else if success}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #00E676;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
							</svg>
						{:else}
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #FF5B4F;">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						{/if}
					</div>
					<div>
						<h3 class="text-h3 font-semibold" style="color: var(--text-primary);">{title}</h3>
						{#if command}
							<p class="text-caption font-mono" style="color: var(--text-muted);">$ {command}</p>
						{/if}
					</div>
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

			<!-- Terminal body -->
			<div class="mb-md flex-1 overflow-hidden flex flex-col">
				<div class="flex items-center justify-between pb-xs text-caption" style="color: var(--text-muted);">
					<span>Command Output</span>
					{#if output}
						<button
							type="button"
							class="text-caption hover:underline cursor-pointer"
							style="color: var(--text-secondary);"
							onclick={copyToClipboard}
						>
							{copied ? '✓ Copied' : 'Copy output'}
						</button>
					{/if}
				</div>
				<pre
					class="flex-1 p-md rounded-lg font-mono text-caption overflow-auto leading-relaxed whitespace-pre-wrap select-all"
					style="background: var(--bg-base); border: 1px solid var(--border-color); color: {success ? '#00E676' : '#FF5B4F'}; max-height: 380px;"
				>{#if loading}Running command...{:else}{output || '(No output)'}{/if}</pre>
			</div>

			<!-- Footer -->
			<div class="flex justify-end pt-md border-t" style="border-color: var(--border-color);">
				<button
					type="button"
					class="btn-secondary px-4 py-2 text-body-sm"
					onclick={onClose}
				>
					Close
				</button>
			</div>
		</div>
	</dialog>
{/if}
