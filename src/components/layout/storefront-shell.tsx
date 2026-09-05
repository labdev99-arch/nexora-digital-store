'use client';

import {
  BadgePercent,
  ChevronDown,
  Gamepad2,
  Gift,
  Headphones,
  HeartHandshake,
  Home,
  Menu,
  PackageSearch,
  Search,
  ShoppingBag,
  Sparkles,
  Tv,
  UsersRound,
  UserRound,
  WalletCards
} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {useState, type ReactNode} from 'react';

import {Brand} from '@/components/brand';
import {CommandPalette, type CommandItem} from '@/components/ui/advanced';
import {Button} from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/overlays';
import {CurrencySwitcher} from '@/features/preferences/components/currency-switcher';
import {LocaleSwitcher} from '@/features/preferences/components/language-switcher';
import {ThemeSwitcher} from '@/features/preferences/components/theme-switcher';
import {SupportAssistant} from '@/features/ai/components/support-assistant';
import {Link, useRouter} from '@/i18n/navigation';

const categoryIcons = [Gamepad2, Tv, Gift, UsersRound, HeartHandshake];

export function StorefrontShell({children}: {children: ReactNode}) {
  return (
    <>
      <StorefrontHeader />
      {children}
      <StorefrontFooter />
      <MobileTabBar />
      <SupportAssistant />
    </>
  );
}

function StorefrontHeader() {
  const t = useTranslations('Navigation');
  const c = useTranslations('Categories');
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const categories = [
    {title: c('gameTitle'), detail: c('gameDescription'), href: '/products?type=topup'},
    {
      title: c('subscriptionTitle'),
      detail: c('subscriptionDescription'),
      href: '/products?type=subscription'
    },
    {title: c('giftTitle'), detail: c('giftDescription'), href: '/products?type=giftcard'},
    {title: c('socialTitle'), detail: c('socialDescription'), href: '/products?type=smm'},
    {title: c('serviceTitle'), detail: c('serviceDescription'), href: '/products?type=service'}
  ];
  const commands: CommandItem[] = categories.map((category, index) => ({
    id: category.title,
    label: category.title,
    detail: category.detail,
    onSelect: () => router.push(category.href),
    icon: (() => {
      const Icon = categoryIcons[index] ?? Sparkles;
      return <Icon aria-hidden="true" />;
    })()
  }));
  return (
    <>
      <header className="store-header">
        <div className="site-container store-header-inner">
          <Link href="/" className="store-logo">
            <Brand />
          </Link>
          <nav className="store-nav" aria-label={t('primaryNavigation')}>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="store-nav-link">
                  {t('products')}
                  <ChevronDown aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="mega-menu" align="start">
                <div className="mega-menu-head">
                  <span>{t('products')}</span>
                  <BadgePercent aria-hidden="true" />
                </div>
                <div className="mega-menu-grid">
                  {categories.map((category, index) => {
                    const Icon = categoryIcons[index] ?? Sparkles;
                    return (
                      <Link href={category.href} key={category.title}>
                        <span>
                          <Icon aria-hidden="true" />
                        </span>
                        <div>
                          <strong>{category.title}</strong>
                          <small>{category.detail}</small>
                        </div>
                      </Link>
                    );
                  })}
                </div>
                <div className="mega-menu-footer">
                  <span>
                    <Sparkles aria-hidden="true" />
                    {t('megaNote')}
                  </span>
                  <Link href="/products">{t('browseAll')}</Link>
                </div>
              </PopoverContent>
            </Popover>
            <Link className="store-nav-link" href="/#featured">
              {t('deals')}
            </Link>
            <Link className="store-nav-link" href="/#how-it-works">
              {t('howItWorks')}
            </Link>
            <Link className="store-nav-link" href="/account/wallet">
              {t('wallet')}
            </Link>
          </nav>
          <div className="store-actions">
            <Button
              variant="ghost"
              size="sm"
              className="search-trigger"
              onClick={() => setCommandOpen(true)}
            >
              <Search aria-hidden="true" />
              <span>{t('search')}</span>
              <kbd>⌘K</kbd>
            </Button>
            <Link href="/account/wallet" className="wallet-chip">
              <WalletCards aria-hidden="true" />
              <span>
                <small>{t('balance')}</small>
                <strong>$83.00</strong>
              </span>
            </Link>
            <CurrencySwitcher compact />
            <LocaleSwitcher />
            <ThemeSwitcher />
            <Button asChild variant="ghost" size="sm">
              <Link href="/auth/sign-in">
                <UserRound aria-hidden="true" />
                {t('signIn')}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="cart-trigger">
              <Link href="/cart" aria-label={t('cart')}>
                <ShoppingBag aria-hidden="true" />
              </Link>
            </Button>
            <MobileMenu categories={categories} />
          </div>
        </div>
      </header>
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        items={commands}
        labels={{
          title: t('palette.title'),
          description: t('palette.description'),
          placeholder: t('palette.placeholder'),
          escape: t('palette.escape'),
          noResults: t('palette.noResults'),
          quickActions: t('palette.quickActions'),
          command: t('palette.command'),
          navigate: t('palette.navigate'),
          open: t('palette.open')
        }}
      />
    </>
  );
}

function MobileMenu({
  categories
}: {
  categories: Array<{title: string; detail: string; href: string}>;
}) {
  const t = useTranslations('Navigation');
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="mobile-menu-trigger"
          aria-label={t('openMenu')}
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="end" className="mobile-menu-sheet">
        <SheetTitle>
          <Brand />
        </SheetTitle>
        <SheetDescription>{t('mobileDescription')}</SheetDescription>
        <nav>
          {categories.map((category, index) => {
            const Icon = categoryIcons[index] ?? Sparkles;
            return (
              <Link key={category.title} href={category.href}>
                <Icon aria-hidden="true" />
                <span>
                  <strong>{category.title}</strong>
                  <small>{category.detail}</small>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="mobile-menu-controls">
          <CurrencySwitcher />
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
        <Button variant="gradient" size="lg" className="w-full">
          <WalletCards aria-hidden="true" />
          {t('wallet')}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

function StorefrontFooter() {
  const t = useTranslations('Footer');
  const columns = [
    {title: t('shop'), links: [t('topups'), t('subscriptions'), t('giftCards'), t('services')]},
    {title: t('platform'), links: [t('wallet'), t('resellers'), t('affiliates'), t('api')]},
    {title: t('company'), links: [t('about'), t('support'), t('blog'), t('status')]}
  ];
  return (
    <footer className="store-footer" id="support">
      <div className="site-container">
        <div className="footer-top">
          <div className="footer-brand">
            <Brand />
            <p>{t('tagline')}</p>
            <div className="footer-trust">
              <span>
                <span className="live-dot" />
                {t('online')}
              </span>
              <span>{t('secure')}</span>
            </div>
          </div>
          <div className="footer-links">
            {columns.map((column) => (
              <div key={column.title}>
                <h3>{column.title}</h3>
                {column.links.map((link) => (
                  <a href="#top" key={link}>
                    {link}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div className="footer-newsletter">
            <h3>{t('newsletter')}</h3>
            <p>{t('newsletterDescription')}</p>
            <form>
              <label className="sr-only" htmlFor="footer-email">
                {t('email')}
              </label>
              <input id="footer-email" type="email" placeholder={t('email')} />
              <Button size="icon" variant="gradient" aria-label={t('join')}>
                <ChevronDown aria-hidden="true" className="-rotate-90 rtl:rotate-90" />
              </Button>
            </form>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{t('rights', {year: new Date().getFullYear()})}</span>
          <div>
            <a href="#top">{t('privacy')}</a>
            <a href="#top">{t('terms')}</a>
            <a href="#top">{t('cookies')}</a>
          </div>
          <span>{t('location')}</span>
        </div>
      </div>
    </footer>
  );
}

function MobileTabBar() {
  const t = useTranslations('Navigation');
  return (
    <nav className="mobile-tab-bar" aria-label={t('mobileNavigation')}>
      <a href="#top" className="active">
        <Home />
        <span>{t('home')}</span>
      </a>
      <Link href="/products">
        <PackageSearch />
        <span>{t('products')}</span>
      </Link>
      <Link href="/account/wallet" className="mobile-wallet-action">
        <span>
          <WalletCards />
        </span>
        <small>{t('wallet')}</small>
      </Link>
      <Link href="/account/orders">
        <ShoppingBag />
        <span>{t('orders')}</span>
      </Link>
      <a href="#support">
        <Headphones />
        <span>{t('support')}</span>
      </a>
    </nav>
  );
}
