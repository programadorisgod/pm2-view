import type { AuthProvider } from './provider.interface';
import { BetterAuthProvider } from './providers/better-auth.provider';

const PROVIDER_REGISTRY: Record<string, () => AuthProvider> = {
  'better-auth': () => new BetterAuthProvider(),
};

export function createAuthProvider(providerName: string = 'better-auth'): AuthProvider {
  const factory = PROVIDER_REGISTRY[providerName];
  if (!factory) {
    const available = Object.keys(PROVIDER_REGISTRY).join(', ');
    throw new Error(`Unknown auth provider: ${providerName}. Available: ${available}`);
  }
  return factory();
}

export function registerAuthProvider(name: string, factory: () => AuthProvider): void {
  PROVIDER_REGISTRY[name] = factory;
}
