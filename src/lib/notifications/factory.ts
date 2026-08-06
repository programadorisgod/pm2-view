import type { NotificationProvider } from './provider.interface';
import { createNodemailerProvider } from './providers/nodemailer.provider';

const PROVIDER_REGISTRY: Record<string, () => NotificationProvider | null> = {
  nodemailer: () => createNodemailerProvider(),
};

export function createNotificationProvider(providerName: string): NotificationProvider | null {
  const factory = PROVIDER_REGISTRY[providerName];
  if (!factory) {
    const available = Object.keys(PROVIDER_REGISTRY).join(', ');
    throw new Error(`Unknown notification provider: ${providerName}. Available: ${available}`);
  }
  return factory();
}

export function registerNotificationProvider(name: string, factory: () => NotificationProvider | null): void {
  PROVIDER_REGISTRY[name] = factory;
}
