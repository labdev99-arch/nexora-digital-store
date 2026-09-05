import type {Json, NotificationChannel} from '@/lib/supabase/database.types';

export const notificationEvents = [
  'order.paid',
  'order.processing',
  'order.delivered',
  'order.failed',
  'wallet.topup_confirmed',
  'wallet.low_balance',
  'support.reply',
  'admin.ai_daily_digest'
] as const;
export type NotificationEvent = (typeof notificationEvents)[number];
export type NotificationData = Record<string, Json | undefined>;
export type DeliveryChannel = NotificationChannel;
export type RenderedNotification = {
  subject: string | null;
  body: string;
  actionUrl: string | null;
  providerTemplateName: string | null;
};
export type DeliveryTarget = {
  userId: string;
  email: string | null;
  phone: string | null;
  externalId: string | null;
  locale: string;
};
export type DeliveryResult = {providerMessageId: string | null; metadata?: NotificationData};
export interface NotificationAdapter {
  readonly channel: DeliveryChannel;
  send(
    target: DeliveryTarget,
    content: RenderedNotification,
    data: NotificationData
  ): Promise<DeliveryResult>;
}
