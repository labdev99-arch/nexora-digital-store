import 'server-only';

export function trustedConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase trusted server credentials are not configured.');
  return {restUrl: `${url}/rest/v1`, key};
}

export async function trustedRest<T>(path: string, init?: RequestInit): Promise<T> {
  const {restUrl, key} = trustedConfig();
  const response = await fetch(`${restUrl}/${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      code?: string;
    } | null;
    throw new Error(body?.message ?? body?.code ?? `trusted_rest_failed_${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function queryValue(value: string) {
  return encodeURIComponent(value);
}
