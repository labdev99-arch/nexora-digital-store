import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';

export async function getUserPayments(profileId: string) {
  const admin = createAdminClient();
  const {data, error} = await admin
    .from('payments')
    .select('*')
    .eq('profile_id', profileId)
    .is('deleted_at', null)
    .order('created_at', {ascending: false})
    .limit(50);
  if (error) throw new Error('payments_query_failed');
  return data ?? [];
}

export async function getSavedPaymentMethods(profileId: string) {
  const admin = createAdminClient();
  const {data, error} = await admin
    .from('saved_payment_methods')
    .select('*')
    .eq('profile_id', profileId)
    .is('deleted_at', null)
    .order('is_default', {ascending: false});
  if (error) throw new Error('saved_payment_methods_failed');
  return data ?? [];
}

export async function getPaymentVerificationQueue() {
  const admin = createAdminClient();
  const {data: queue, error} = await admin
    .from('payment_verification_queue')
    .select('*')
    .in('status', ['pending', 'needs_review', 'processing'])
    .order('priority', {ascending: false})
    .order('created_at')
    .limit(100);
  if (error) throw new Error('payment_queue_failed');
  const paymentIds = (queue ?? []).map((item) => item.payment_id);
  const proofIds = (queue ?? []).map((item) => item.proof_id);
  const [{data: payments}, {data: proofs}, {data: checks}] = await Promise.all([
    paymentIds.length
      ? admin.from('payments').select('*').in('id', paymentIds)
      : Promise.resolve({data: []}),
    proofIds.length
      ? admin.from('payment_proofs').select('*').in('id', proofIds)
      : Promise.resolve({data: []}),
    proofIds.length
      ? admin.from('payment_proof_checks').select('*').in('proof_id', proofIds)
      : Promise.resolve({data: []})
  ]);
  return Promise.all(
    (queue ?? []).map(async (item) => {
      const proof = (proofs ?? []).find((candidate) => candidate.id === item.proof_id);
      const signed = proof
        ? await admin.storage.from('payment-proofs').createSignedUrl(proof.storage_path, 300)
        : {data: null};
      return {
        queue: item,
        payment: (payments ?? []).find((candidate) => candidate.id === item.payment_id) ?? null,
        proof: proof ?? null,
        check: (checks ?? []).find((candidate) => candidate.proof_id === item.proof_id) ?? null,
        proofUrl: signed.data?.signedUrl ?? null
      };
    })
  );
}

export async function getPaymentMethodsForAdmin() {
  const admin = createAdminClient();
  const {data, error} = await admin
    .from('payment_methods')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order');
  if (error) throw new Error('payment_methods_query_failed');
  return data ?? [];
}
