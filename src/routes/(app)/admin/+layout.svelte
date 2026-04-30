<script lang="ts">
	import type { LayoutData } from './$types';

	let { children, data }: { children?: import('svelte').Snippet; data: LayoutData } = $props();
</script>

{@render children?.()}
