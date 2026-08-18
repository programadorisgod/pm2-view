<script lang="ts">
  import { Card, Button, Badge, FeedbackBanner } from "$lib/ui/components";
  import { base } from "$app/paths";
  import type { PageData } from "./$types";
  import { invalidateAll } from "$app/navigation";

  let { data }: { data: PageData } = $props();

  let feedback = $state<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  let importing = $state<number | null>(null);

  async function handleImport(repositoryId: number) {
    feedback = null;
    importing = repositoryId;
    try {
      const res = await fetch(
        `${base}/api/github/repositories/${repositoryId}/import`,
        { method: "POST" },
      );
      const result = await res.json();
      if (res.ok) {
        feedback = {
          type: "success",
          text: result.message || "Repository imported successfully",
        };
      } else {
        feedback = {
          type: "error",
          text: result.error || "Failed to import repository",
        };
      }
    } catch {
      feedback = { type: "error", text: "Failed to import repository" };
    } finally {
      importing = null;
    }
  }
</script>

<div class="space-y-lg">
  <div>
    <h1 class="text-heading-lg">GitHub Integration</h1>
    <p class="text-body text-muted mt-1">
      Connect your GitHub account to import repositories.
    </p>
  </div>

  {#if feedback}
    <FeedbackBanner type={feedback.type} message={feedback.text} onDismiss={() => (feedback = null)} />
  {/if}

  {#if data.connected}
    <Card>
      <div class="flex items-center gap-md">
        {#if data.installation?.accountAvatar}
          <img
            src={data.installation.accountAvatar}
            alt={data.installation.accountLogin}
            class="w-10 h-10 rounded-full"
          />
        {/if}
        <div>
          <div class="flex items-center gap-sm">
            <span class="text-body font-medium">
              {data.installation?.accountLogin}
            </span>
            <Badge variant="online">Connected</Badge>
          </div>
          <span class="text-caption text-muted">
            {data.installation?.accountType}
          </span>
        </div>
      </div>
    </Card>

    <div>
      <h2 class="text-heading-md mb-md">Repositories</h2>
      {#if data.repositories.length === 0}
        <Card variant="ghost">
          <p class="text-body text-muted text-center py-lg">
            No repositories accessible. Update your GitHub App installation to
            grant access.
          </p>
        </Card>
      {:else}
        <div class="space-y-sm">
          {#each data.repositories as repo (repo.id)}
            <Card>
              <div class="flex items-center justify-between">
                <div class="min-w-0 flex-1">
                  <p class="text-body font-medium truncate">{repo.name}</p>
                  <p class="text-caption text-muted truncate">
                    {repo.fullName}
                  </p>
                  <div class="flex items-center gap-sm mt-1">
                    {#if repo.private}
                      <Badge>Private</Badge>
                    {:else}
                      <Badge variant="secondary">Public</Badge>
                    {/if}
                    <span class="text-caption text-muted">
                      {repo.defaultBranch}
                    </span>
                  </div>
                </div>
                <div class="ml-md flex-shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={importing === repo.id}
                    onclick={() => handleImport(repo.id)}
                  >
                    {importing === repo.id ? "Importing..." : "Import"}
                  </Button>
                </div>
              </div>
            </Card>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <Card>
      <div class="text-center py-lg">
        <p class="text-body text-muted mb-md">
          Connect your GitHub account to start importing repositories.
        </p>
        <a href={data.installUrl}>
          <Button variant="primary">Connect GitHub</Button>
        </a>
      </div>
    </Card>
  {/if}
</div>
