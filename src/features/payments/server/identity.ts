import 'server-only';

import {getAuthContext} from '@/features/auth/server/authorization';
import {createClient} from '@/lib/supabase/server';

export async function getPaymentIdentity() {
  const context = await getAuthContext();
  if (!context) return null;
  const supabase = await createClient();
  const {data: profile} = await supabase
    .from('profiles')
    .select('country_code')
    .eq('id', context.user.id)
    .maybeSingle();
  return {
    id: context.user.id,
    email: context.user.email,
    roles: context.roles,
    countryCode: profile?.country_code ?? null
  };
}
