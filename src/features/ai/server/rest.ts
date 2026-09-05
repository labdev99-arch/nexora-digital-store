import 'server-only';

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('ai_database_not_configured');
  return {url, key};
}

export async function aiRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {url, key} = configuration();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...init.headers
    },
    cache: 'no-store'
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ai_database_error:${response.status}:${detail.slice(0, 240)}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function aiRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return aiRest<T>(`rpc/${name}`, {method: 'POST', body: JSON.stringify(body)});
}
