import 'server-only';

import {createClient} from '@supabase/supabase-js';

import type {Database} from './database.types';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase trusted server credentials are not configured.');
  return createClient<Database>(url, key, {
    auth: {autoRefreshToken: false, persistSession: false, detectSessionInUrl: false}
  });
}
