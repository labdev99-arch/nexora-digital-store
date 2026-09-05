import type {ReactNode} from 'react';

import {AdminShell} from '@/components/layout/dashboard-shell';
import {requirePermission} from '@/features/auth/server/authorization';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const context = await requirePermission(locale, 'admin.access');
  const userName = context.user.email?.split('@')[0] ?? context.user.id.slice(0, 8);
  return (
    <AdminShell userName={userName} permissions={context.permissions}>
      {children}
    </AdminShell>
  );
}
