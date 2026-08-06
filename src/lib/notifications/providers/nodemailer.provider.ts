import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';
import type { EmailMessage, NotificationProvider } from '../provider.interface';

export class NodemailerProvider implements NotificationProvider {
  readonly name = 'nodemailer';

  constructor(private readonly transporter: nodemailer.Transporter) {}

  async sendEmail(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
  }
}

export function createNodemailerProvider(): NodemailerProvider | null {
  const host = env.SMTP_HOST;
  if (!host) return null;
  const port = Number(env.SMTP_PORT ?? 587);
  const secure = env.SMTP_SECURE === 'true';
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user && pass ? { auth: { user, pass } } : {})
  });
  return new NodemailerProvider(transporter);
}
