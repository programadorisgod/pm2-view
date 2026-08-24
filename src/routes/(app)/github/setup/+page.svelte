<script lang="ts">
  import { Card, Button } from "$lib/ui/components";
  import { base } from "$app/paths";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<div class="space-y-lg">
  <div>
    <h1 class="text-heading-lg">GitHub Setup</h1>
  </div>

  {#if data.success}
    <Card>
      <div class="text-center py-lg">
        <p class="text-body text-success mb-md">{data.message}</p>
        <a href={`${base}/github`}>
          <Button variant="primary">View Repositories</Button>
        </a>
      </div>
    </Card>
  {:else if data.installUrl}
    <Card>
      <div class="text-center py-lg">
        <p class="text-body text-muted mb-md">{data.message}</p>
        <a href={data.installUrl}>
          <Button variant="primary">Install GitHub App</Button>
        </a>
      </div>
    </Card>
  {:else}
    <Card>
      <div class="text-center py-lg">
        <p class="text-body text-error mb-md">{data.message}</p>
        <a href={`${base}/github`}>
          <Button variant="secondary">Back to GitHub</Button>
        </a>
      </div>
    </Card>
  {/if}
</div>
