<script lang="ts">
  import { Card, Button, FeedbackBanner } from "$lib/ui/components";
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
  {:else if data.isOAuthRequest}
    <Card>
      <div class="text-center py-lg">
        <p class="text-body text-muted mb-md">Conectando con GitHub...</p>
        <p class="text-sm text-muted">Serás redirigido en un momento.</p>
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
