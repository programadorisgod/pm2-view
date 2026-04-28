<script lang="ts">
	let { children } = $props();
</script>

<div class="auth-layout page-transition-enter">
	{@render children()}
</div>

<style>
	.auth-layout {
		display: flex;
		min-height: 100vh;
		align-items: center;
		justify-content: center;
		background: var(--bg-base);
		transition: background-color 0.2s ease;
	}
</style>
