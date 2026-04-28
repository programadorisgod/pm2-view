<script lang="ts">
  let {
    type = 'success',
    message,
    onDismiss
  }: {
    type?: 'success' | 'error' | 'warning' | 'info';
    message: string;
    onDismiss?: () => void;
  } = $props();

  const typeConfig = {
    success: {
      bg: 'rgba(0, 230, 118, 0.1)',
      text: '#00E676',
      border: 'rgba(0, 230, 118, 0.2)',
      icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
    },
    error: {
      bg: 'rgba(255, 82, 82, 0.1)',
      text: '#FF5252',
      border: 'rgba(255, 82, 82, 0.2)',
      icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
    },
    warning: {
      bg: 'rgba(255, 183, 77, 0.1)',
      text: '#FFB74D',
      border: 'rgba(255, 183, 77, 0.2)',
      icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01"/></svg>'
    },
    info: {
      bg: 'rgba(56, 205, 255, 0.1)',
      text: '#38CDFF',
      border: 'rgba(56, 205, 255, 0.2)',
      icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
    }
  };

  let config = $derived(typeConfig[type]);
</script>

<div
  class="flex items-start gap-sm rounded-md p-sm text-body-sm"
  style="background: {config.bg}; color: {config.text}; border: 1px solid {config.border};"
  role="alert"
>
  {@html config.icon}
  <span class="flex-1">{message}</span>
  {#if onDismiss}
    <button
      type="button"
      onclick={onDismiss}
      class="opacity-60 hover:opacity-100 transition-opacity"
      aria-label="Dismiss"
    >
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>
  {/if}
</div>
