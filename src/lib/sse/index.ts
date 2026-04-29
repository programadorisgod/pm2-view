// Client-safe exports — safe to import in Svelte components
export { createSSEClient } from './client';
export type { SSEEventType, SSEEvent, LogEvent, MetricsEvent, ProcessStatusEvent } from './types';
export type { SSEClient } from './client';
