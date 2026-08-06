import { env } from '$env/dynamic/private';
import { createNotificationProvider } from './factory';
import type { EmailMessage, NotificationProvider } from './provider.interface';

let cachedProviders: NotificationProvider[] | null = null;

export function getNotificationProviders(): NotificationProvider[] {
  if (cachedProviders) return cachedProviders;
  const configured = (env.NOTIFICATION_CHANNELS ?? 'nodemailer')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  cachedProviders = configured
    .map((name) => {
      try {
        return createNotificationProvider(name);
      } catch (err) {
        console.error(`[notifications] Failed to create provider '${name}':`, err);
        return null;
      }
    })
    .filter((provider): provider is NotificationProvider => provider !== null);
  return cachedProviders;
}

export async function sendNotificationEmail(message: EmailMessage): Promise<boolean> {
  const providers = getNotificationProviders();
  if (providers.length === 0) return false;
  await Promise.allSettled(
    providers.map((provider) =>
      provider.sendEmail(message).catch((err) => {
        console.error(`[notifications] Provider '${provider.name}' failed to send email:`, err);
      })
    )
  );
  return true;
}
