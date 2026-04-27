<script lang="ts">
	let { children } = $props();
</script>

<div class="auth-layout">
	{@render children()}
</div>

<style>
	.auth-layout {
		display: flex;
		min-height: 100vh;
		align-items: center;
		justify-content: center;
		background-color: #f5f5f7;
		padding: 1rem;
	}
</style>
