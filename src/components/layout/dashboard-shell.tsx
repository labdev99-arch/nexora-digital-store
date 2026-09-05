'use client';

import {
  Bell,
  BadgeDollarSign,
  BarChart3,
  BrainCircuit,
  ChevronLeft,
  Command,
  KeyRound,
  LayoutDashboard,
  Menu,
  PackageSearch,
  PackageCheck,
  PanelsTopLeft,
  ScrollText,
  LifeBuoy,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Handshake,
  UserRound,
  Users,
  WalletCards
} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useState, type ReactNode} from 'react';

import {Brand} from '@/components/brand';
import {Button} from '@/components/ui/button';
import {Breadcrumb} from '@/components/ui/surfaces';
import {signOutAction} from '@/features/auth/server/actions';
import type {Permission} from '@/features/auth/server/permissions';
import {LocaleSwitcher} from '@/features/preferences/components/language-switcher';
import {ThemeSwitcher} from '@/features/preferences/components/theme-switcher';
import {NotificationCenter} from '@/features/notifications/components/notification-center';
import {Link, usePathname} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

const accountItems = [
  {key: 'overview', href: '/account', icon: LayoutDashboard},
  {key: 'wallet', href: '/account/wallet', icon: WalletCards},
  {key: 'orders', href: '/account/orders', icon: ShoppingBag},
  {key: 'loyalty', href: '/account/loyalty', icon: Sparkles},
  {key: 'affiliate', href: '/account/affiliate', icon: Handshake},
  {key: 'support', href: '/support', icon: LifeBuoy},
  {key: 'profile', href: '/account/profile', icon: UserRound},
  {key: 'security', href: '/account/security', icon: KeyRound},
  {key: 'notifications', href: '/account/notifications', icon: Bell},
  {key: 'preferences', href: '/account/preferences', icon: Settings}
] as const;

const adminItems = [
  {key: 'overview', href: '/admin', icon: LayoutDashboard, permission: 'admin.access'},
  {key: 'analytics', href: '/admin/analytics', icon: BarChart3, permission: 'analytics.read'},
  {key: 'ai', href: '/admin/ai', icon: BrainCircuit, permission: 'ai.manage'},
  {key: 'payments', href: '/admin/payments', icon: BadgeDollarSign, permission: 'finance.manage'},
  {key: 'wallets', href: '/admin/wallets', icon: WalletCards, permission: 'wallet.manage'},
  {key: 'catalog', href: '/admin/catalog', icon: PackageSearch, permission: 'catalog.manage'},
  {key: 'growth', href: '/admin/growth', icon: Sparkles, permission: 'affiliate.manage'},
  {key: 'support', href: '/admin/support', icon: LifeBuoy, permission: 'support.manage'},
  {
    key: 'fulfillment',
    href: '/admin/fulfillment',
    icon: PackageCheck,
    permission: 'fulfillment.manage'
  },
  {key: 'resources', href: '/admin/resources', icon: PanelsTopLeft, permission: 'admin.access'},
  {key: 'homepage', href: '/admin/homepage', icon: PanelsTopLeft, permission: 'marketing.manage'},
  {key: 'templates', href: '/admin/templates', icon: Bell, permission: 'settings.manage'},
  {key: 'identity', href: '/admin/resources/users', icon: Users, permission: 'identity.manage'},
  {key: 'audit', href: '/admin/audit', icon: ScrollText, permission: 'audit.read'},
  {key: 'settings', href: '/admin/settings', icon: Settings, permission: 'settings.manage'},
  {key: 'security', href: '/admin/audit', icon: ShieldCheck, permission: 'platform.own'}
] as const;

function DashboardShell({
  children,
  mode,
  userName,
  permissions = []
}: {
  children: ReactNode;
  mode: 'account' | 'admin';
  userName: string;
  permissions?: readonly Permission[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations('AccountShell');
  const growthT = useTranslations('Growth.navigation');
  const items =
    mode === 'admin'
      ? adminItems.filter((item) => permissions.includes(item.permission))
      : accountItems;
  return (
    <div className={cn('dashboard-shell', collapsed && 'dashboard-collapsed')}>
      <aside>
        <div className="dashboard-logo">
          <Link href="/" aria-label={t('home')}>
            <Brand compact={collapsed} />
          </Link>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={t('toggleSidebar')}
          >
            <ChevronLeft aria-hidden="true" className="rtl:-scale-x-100" />
          </Button>
        </div>
        <nav aria-label={t(mode === 'admin' ? 'adminNavigation' : 'accountNavigation')}>
          {items.map(({key, href, icon: Icon}) => (
            <Link
              key={key}
              href={href}
              className={
                pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`))
                  ? 'active'
                  : undefined
              }
            >
              <Icon aria-hidden="true" />
              <span>
                {key === 'loyalty' || key === 'affiliate' || key === 'growth'
                  ? growthT(key)
                  : t(`nav.${key}`)}
              </span>
            </Link>
          ))}
        </nav>
        <form action={signOutAction.bind(null, locale, false)} className="dashboard-signout">
          <Button type="submit" variant="ghost" size="sm">
            {t('signOut')}
          </Button>
        </form>
        <div className="dashboard-user">
          <span>{userName.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{userName}</strong>
            <small>{t(mode === 'admin' ? 'administrator' : 'member')}</small>
          </div>
        </div>
      </aside>
      <div className="dashboard-main">
        <header>
          <Button
            size="icon"
            variant="ghost"
            className="dashboard-mobile-menu"
            aria-label={t('openMenu')}
          >
            <Menu />
          </Button>
          <Breadcrumb items={[{label: t(mode)}, {label: t('current')}]} />
          <div className="dashboard-header-actions">
            <NotificationCenter />
            <LocaleSwitcher />
            <ThemeSwitcher />
            <Button variant="outline" size="sm">
              <Command />
              {t('quickActions')}
              <kbd>⌘K</kbd>
            </Button>
          </div>
        </header>
        <main>{children}</main>
      </div>
      {mode === 'account' ? (
        <nav className="account-mobile-nav" aria-label={t('accountNavigation')}>
          {accountItems.slice(0, 4).map(({key, href, icon: Icon}) => (
            <Link key={key} href={href} className={pathname === href ? 'active' : undefined}>
              <Icon aria-hidden="true" />
              <span>{t(`nav.${key}`)}</span>
            </Link>
          ))}
          <Link
            href="/account/preferences"
            className={pathname === '/account/preferences' ? 'active' : undefined}
          >
            <WalletCards aria-hidden="true" />
            <span>{t('nav.preferences')}</span>
          </Link>
        </nav>
      ) : null}
    </div>
  );
}

export function AccountShell({children, userName}: {children: ReactNode; userName: string}) {
  return (
    <DashboardShell mode="account" userName={userName}>
      {children}
    </DashboardShell>
  );
}
export function AdminShell({
  children,
  userName,
  permissions
}: {
  children: ReactNode;
  userName: string;
  permissions: readonly Permission[];
}) {
  return (
    <DashboardShell mode="admin" userName={userName} permissions={permissions}>
      {children}
    </DashboardShell>
  );
}
