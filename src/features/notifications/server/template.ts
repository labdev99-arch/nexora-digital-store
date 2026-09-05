import type {NotificationData, RenderedNotification} from '../types';

function scalar(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}
export function renderTemplate(
  template: {subject?: unknown; body?: unknown; provider_template_name?: unknown},
  data: NotificationData,
  locale: string
): RenderedNotification {
  const replace = (source: string) =>
    source.replace(/\{\{([a-z0-9_]+)\}\}/gi, (_, key: string) => scalar(data[key]));
  const sourceId = scalar(data.order_id || data.ticket_id);
  const actionUrl =
    scalar(data.order_url || data.ticket_url || data.wallet_url) ||
    (data.order_id
      ? `/${locale}/account/orders/${sourceId}`
      : data.ticket_id
        ? `/${locale}/support/${sourceId}`
        : null);
  return {
    subject: typeof template.subject === 'string' ? replace(template.subject) : null,
    body: replace(typeof template.body === 'string' ? template.body : ''),
    actionUrl,
    providerTemplateName:
      typeof template.provider_template_name === 'string' ? template.provider_template_name : null
  };
}
