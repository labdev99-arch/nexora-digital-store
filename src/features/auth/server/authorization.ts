import {redirect} from 'next/navigation';

import {createClient} from '@/lib/supabase/server';
import type {UserRole} from '@/lib/supabase/database.types';
import {hasRole, type Permission} from './permissions';

export type AuthContext = {
  user: {id: string; email: string | null; phone: string | null};
  roles: UserRole[];
  permissions: Permission[];
};

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: {user},
    error
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const {data: roleRows} = await supabase
    .from('profile_roles')
    .select('role, expires_at')
    .eq('profile_id', user.id);
  const now = Date.now();
  const roles = (roleRows ?? [])
    .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now)
    .map((row) => row.role);
  const effectiveRoles: UserRole[] = roles.length === 0 ? ['customer'] : roles;
  const {data: permissionRows} = await supabase
    .from('role_permissions')
    .select('permission')
    .in('role', effectiveRoles);
  const effectivePermissions = (permissionRows ?? [])
    .map((row) => row.permission)
    .filter((permission): permission is Permission => permission in permissionMap);
  return {
    user: {id: user.id, email: user.email ?? null, phone: user.phone ?? null},
    roles: effectiveRoles,
    permissions: effectivePermissions
  };
}

const permissionMap: Record<Permission, true> = {
  'account.read': true,
  'account.update': true,
  'reseller.access': true,
  'reseller.manage': true,
  'affiliate.access': true,
  'support.manage': true,
  'notifications.manage': true,
  'knowledge.manage': true,
  'ai.manage': true,
  'fulfillment.manage': true,
  'finance.manage': true,
  'admin.access': true,
  'identity.manage': true,
  'settings.manage': true,
  'catalog.manage': true,
  'catalog.read_draft': true,
  'wallet.manage': true,
  'orders.manage': true,
  'analytics.read': true,
  'audit.read': true,
  'content.manage': true,
  'marketing.manage': true,
  'reviews.manage': true,
  'loyalty.manage': true,
  'affiliate.manage': true,
  'import_export.manage': true,
  'platform.own': true
};

export async function requireUser(locale: string): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) redirect(`/${locale}/auth/sign-in`);
  return context;
}

export async function requirePermission(
  locale: string,
  permission: Permission
): Promise<AuthContext> {
  const context = await requireUser(locale);
  if (!context.permissions.includes(permission)) redirect(`/${locale}/account?denied=1`);
  return context;
}

export async function requireRole(
  locale: string,
  allowedRoles: readonly UserRole[]
): Promise<AuthContext> {
  const context = await requireUser(locale);
  if (!hasRole(context.roles, allowedRoles)) redirect(`/${locale}/account?denied=1`);
  return context;
}

export async function requireAal2(locale: string): Promise<void> {
  const supabase = await createClient();
  const {data, error} = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || data.currentLevel !== 'aal2') redirect(`/${locale}/auth/mfa`);
}
