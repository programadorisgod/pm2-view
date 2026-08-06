export interface EmailMessage {
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

export interface NotificationProvider {
  readonly name: string;
  sendEmail(message: EmailMessage): Promise<void>;
}
