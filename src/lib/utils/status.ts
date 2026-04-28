export type StatusVariant = 'online' | 'offline' | 'stopped' | 'error';

export function getStatusVariant(status: string): StatusVariant {
  switch (status) {
    case 'online':
    case 'launching':
      return 'online';
    case 'stopped':
    case 'stopping':
      return 'stopped';
    case 'error':
    case 'errored':
      return 'error';
    default:
      return 'offline';
  }
}
