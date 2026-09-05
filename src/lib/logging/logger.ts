import 'server-only';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY =
  /(?:authorization|cookie|token|secret|password|phone|email|address|proof|payload|api.?key|session)/i;

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[MAX_DEPTH]';
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redactSensitive(item, depth + 1)
      ])
    );
  }
  return value;
}

export function logEvent(
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,
  context: Record<string, unknown> = {}
) {
  const safeContext = redactSensitive(context) as Record<string, unknown>;
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safeContext
  });
  if (level === 'error') console.error(record);
  else if (level === 'warn') console.warn(record);
  else if (level === 'debug') console.debug(record);
  else console.info(record);
}
