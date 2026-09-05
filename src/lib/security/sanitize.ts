const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const DANGEROUS_TAGS = /<\/?(?:script|iframe|object|embed|style|link|meta)[^>]*>/gi;
const EVENT_HANDLERS = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_PROTOCOL = /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/gi;

export function sanitizePlainText(value: string, maxLength = 10_000): string {
  return value.replace(CONTROL_CHARACTERS, '').trim().slice(0, maxLength);
}

export function sanitizeLimitedHtml(value: string, maxLength = 50_000): string {
  return value
    .replace(CONTROL_CHARACTERS, '')
    .replace(DANGEROUS_TAGS, '')
    .replace(EVENT_HANDLERS, '')
    .replace(JS_PROTOCOL, '')
    .trim()
    .slice(0, maxLength);
}
