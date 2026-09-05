import type {UserRole} from '@/lib/supabase/database.types';

export const permissions = [
  'account.read',
  'account.update',
  'reseller.access',
  'reseller.manage',
  'affiliate.access',
  'support.manage',
  'notifications.manage',
  'knowledge.manage',
  'ai.manage',
  'fulfillment.manage',
  'finance.manage',
  'admin.access',
  'identity.manage',
  'settings.manage',
  'catalog.manage',
  'catalog.read_draft',
  'wallet.manage',
  'orders.manage',
  'analytics.read',
  'audit.read',
  'content.manage',
  'marketing.manage',
  'reviews.manage',
  'loyalty.manage',
  'affiliate.manage',
  'import_export.manage',
  'platform.own'
] as const;

export type Permission = (typeof permissions)[number];

export const rolePermissions: Readonly<Record<UserRole, readonly Permission[]>> = {
  customer: ['account.read', 'account.update'],
  reseller: ['account.read', 'account.update', 'reseller.access'],
  affiliate: ['account.read', 'account.update', 'affiliate.access'],
  support: [
    'account.read',
    'admin.access',
    'support.manage',
    'notifications.manage',
    'knowledge.manage',
    'ai.manage',
    'catalog.read_draft',
    'orders.manage',
    'reviews.manage'
  ],
  fulfiller: ['account.read', 'admin.access', 'fulfillment.manage', 'orders.manage'],
  finance: [
    'account.read',
    'admin.access',
    'finance.manage',
    'wallet.manage',
    'analytics.read',
    'audit.read',
    'ai.manage'
  ],
  admin: [
    'account.read',
    'admin.access',
    'identity.manage',
    'settings.manage',
    'catalog.manage',
    'catalog.read_draft',
    'finance.manage',
    'wallet.manage',
    'orders.manage',
    'analytics.read',
    'audit.read',
    'content.manage',
    'marketing.manage',
    'reviews.manage',
    'loyalty.manage',
    'affiliate.manage',
    'import_export.manage',
    'reseller.manage',
    'notifications.manage',
    'knowledge.manage',
    'ai.manage'
  ],
  owner: permissions
};

export function can(roles: readonly UserRole[], permission: Permission): boolean {
  return roles.some((role) => rolePermissions[role].includes(permission));
}

export function hasRole(roles: readonly UserRole[], allowed: readonly UserRole[]): boolean {
  return roles.some((role) => allowed.includes(role));
}
