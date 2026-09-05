'use client';

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Gamepad2,
  Gift,
  Globe2,
  Headphones,
  HeartHandshake,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Tv,
  UsersRound,
  WalletCards,
  Zap
} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useMemo, useRef, useState} from 'react';

import {
  FadeInUp,
  HoverLift,
  ShineSweep,
  StaggerItem,
  StaggerList,
  TiltCard
} from '@/components/motion';
import {AnimatedCounter, CountdownTimer, PriceDisplay} from '@/components/ui/advanced';
import {Button} from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge
} from '@/components/ui/surfaces';
import {useCurrencyStore} from '@/features/preferences/stores/currency-store';
import {Link, useRouter} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';
import {RecommendationRail} from '@/features/ai/components/recommendation-rail';

export type ManagedHomepageSection = {
  id: string;
  section_type: 'hero' | 'banner' | 'product_carousel' | 'categories_grid' | 'testimonials' | 'faq';
  content: unknown;
  configuration: unknown;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
};

type ManagedContent = {
  eyebrow?: string;
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  items?: Array<{title?: string; description?: string; name?: string; quote?: string}>;
};

const categoryIcons = [Gamepad2, Tv, Gift, UsersRound, HeartHandshake];
const productAccents = ['violet', 'cyan', 'rose', 'amber', 'emerald'] as const;

export function MarketingHome({
  managedSections = []
}: {
  managedSections?: ManagedHomepageSection[];
}) {
  if (managedSections.length > 0) {
    return (
      <main id="main" className="managed-homepage">
        {managedSections.map((section) => (
          <ManagedSection key={section.id} section={section} />
        ))}
        <RecommendationRail />
      </main>
    );
  }
  return (
    <main id="main">
      <MarketingHero />
      <TrustBand />
      <CategoryShowcase />
      <FeaturedProducts />
      <RecommendationRail />
      <HowItWorks />
      <WalletStory />
      <PaymentStrip />
      <Testimonials />
      <FaqSection />
      <ClosingCta />
    </main>
  );
}

function ManagedSection({section}: {section: ManagedHomepageSection}) {
  const locale = useLocale();
  const content = localizedManagedContent(section.content, locale);
  const items = Array.isArray(content.items) ? content.items : [];
  const isHero = section.section_type === 'hero';
  return (
    <section className="managed-home-section" data-section={section.section_type}>
      {isHero ? (
        <div className="aurora-mesh" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : null}
      <div className="site-container managed-home-section-inner">
        <FadeInUp>
          {content.eyebrow ? <span className="section-eyebrow">{content.eyebrow}</span> : null}
          {content.title ? (
            <h2 className={isHero ? 'display-hero' : undefined}>{content.title}</h2>
          ) : null}
          {content.description ? <p>{content.description}</p> : null}
          {content.ctaLabel ? (
            <Button asChild variant="gradient" size={isHero ? 'lg' : 'md'}>
              <Link href={safeManagedHref(content.ctaHref)}>
                {content.ctaLabel}
                <ArrowUpRight aria-hidden="true" className="rtl:-scale-x-100" />
              </Link>
            </Button>
          ) : null}
        </FadeInUp>
        {items.length > 0 ? (
          <StaggerList className="managed-home-items">
            {items.map((item, index) => (
              <StaggerItem key={`${section.id}-${index}`}>
                <HoverLift className="managed-home-item">
                  <Sparkles aria-hidden="true" />
                  <strong>{item.title ?? item.name ?? ''}</strong>
                  <p>{item.description ?? item.quote ?? ''}</p>
                </HoverLift>
              </StaggerItem>
            ))}
          </StaggerList>
        ) : null}
      </div>
    </section>
  );
}

function localizedManagedContent(value: unknown, locale: string): ManagedContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const localized = value as Record<string, unknown>;
  const candidate = localized[locale] ?? localized.en ?? localized.ar ?? value;
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? (candidate as ManagedContent)
    : {};
}

function safeManagedHref(value: string | undefined): '/products' | '/categories' {
  return value === '/categories' ? '/categories' : '/products';
}

function MarketingHero() {
  const t = useTranslations('Marketing.hero');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const products = t.raw('searchItems') as Array<{name: string; category: string; price: string}>;
  const results = useMemo(
    () =>
      query.trim().length < 2
        ? []
        : products
            .filter((item) =>
              `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase())
            )
            .slice(0, 4),
    [products, query]
  );
  return (
    <section className="marketing-hero" id="top">
      <div className="aurora-mesh" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="hero-grid" aria-hidden="true" />
      <div className="site-container marketing-hero-inner">
        <FadeInUp eager className="hero-availability">
          <span className="live-dot" />
          {t('eyebrow')}
          <Badge tone="accent">{t('new')}</Badge>
        </FadeInUp>
        <FadeInUp eager delay={0.04}>
          <h1 className="display-hero">
            <span>{t('title')}</span>
            <span className="gradient-text">{t('accent')}</span>
          </h1>
        </FadeInUp>
        <FadeInUp eager delay={0.08}>
          <p className="hero-lead">{t('description')}</p>
        </FadeInUp>
        <FadeInUp eager delay={0.12} className="live-search-wrap">
          <form
            className="live-search"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(
                query.trim() ? `/products?q=${encodeURIComponent(query.trim())}` : '/products'
              );
            }}
          >
            <Search aria-hidden="true" />
            <label className="sr-only" htmlFor="live-product-search">
              {t('searchLabel')}
            </label>
            <input
              id="live-product-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              autoComplete="off"
            />
            <kbd>⌘K</kbd>
            <Button variant="gradient" size="md" type="submit">
              {t('searchAction')}
              <ArrowUpRight aria-hidden="true" className="rtl:-scale-x-100" />
            </Button>
          </form>
          {results.length > 0 ? (
            <div className="live-search-results" role="listbox">
              {results.map((result) => (
                <button
                  key={result.name}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => router.push(`/products?q=${encodeURIComponent(result.name)}`)}
                >
                  <span className="result-mark">{result.name.slice(0, 1)}</span>
                  <span>
                    <strong>{result.name}</strong>
                    <small>{result.category}</small>
                  </span>
                  <b>{result.price}</b>
                </button>
              ))}
            </div>
          ) : null}
          <div className="search-chips">
            <span>{t('trending')}</span>
            {(t.raw('trendingItems') as string[]).map((item) => (
              <button key={item} type="button" onClick={() => setQuery(item)}>
                {item}
              </button>
            ))}
          </div>
        </FadeInUp>
        <FadeInUp eager delay={0.16} className="hero-actions">
          <Button asChild variant="gradient" size="lg">
            <Link href="/products">
              {t('primary')}
              <ShoppingBag aria-hidden="true" />
            </Link>
          </Button>
          <Button variant="outline" size="lg">
            {t('secondary')}
            <WalletCards aria-hidden="true" />
          </Button>
        </FadeInUp>
        <div className="hero-proof">
          <span className="avatar-stack">
            <i>AM</i>
            <i>RK</i>
            <i>JN</i>
            <i>+</i>
          </span>
          <span>
            <span className="stars" role="img" aria-label="4.9 out of 5">
              <Star />
              <Star />
              <Star />
              <Star />
              <Star />
            </span>
            <small>{t('socialProof')}</small>
          </span>
          <span className="hero-proof-divider" />
          <span>
            <ShieldCheck />
            <small>{t('protected')}</small>
          </span>
        </div>
      </div>
    </section>
  );
}

function TrustBand() {
  const t = useTranslations('Marketing.trust');
  const stats = [
    {value: 24, suffix: 'K+', label: t('orders'), icon: CheckCircle2},
    {value: 48, suffix: 's', label: t('delivery'), icon: Zap},
    {value: 4.9, suffix: '/5', label: t('rating'), icon: Star, decimals: 1},
    {value: 24, suffix: '/7', label: t('support'), icon: Headphones}
  ];
  return (
    <section className="trust-band" aria-label={t('label')}>
      <div className="site-container trust-grid">
        {stats.map(({value, suffix, label, icon: Icon, decimals}) => (
          <div key={label}>
            <Icon aria-hidden="true" />
            <span>
              <AnimatedCounter value={value} suffix={suffix} decimals={decimals} />
              <small>{label}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CategoryShowcase() {
  const t = useTranslations('Marketing.categories');
  const items = t.raw('items') as Array<{title: string; description: string; meta: string}>;
  return (
    <section className="marketing-section" id="categories">
      <div className="site-container">
        <SectionHeading eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
        <StaggerList className="marketing-category-grid">
          {items.map((item, index) => {
            const Icon = categoryIcons[index] ?? Sparkles;
            return (
              <StaggerItem key={item.title}>
                <HoverLift>
                  <article
                    className={`marketing-category-card accent-${productAccents[index] ?? 'violet'}`}
                  >
                    <ShineSweep>
                      <div className="marketing-category-icon">
                        <Icon aria-hidden="true" />
                      </div>
                      <Badge>{item.meta}</Badge>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                      <a href="#featured">
                        {t('explore')}
                        <ArrowUpRight aria-hidden="true" className="rtl:-scale-x-100" />
                      </a>
                      <span className="category-orbit" aria-hidden="true" />
                    </ShineSweep>
                  </article>
                </HoverLift>
              </StaggerItem>
            );
          })}
        </StaggerList>
      </div>
    </section>
  );
}

function FeaturedProducts() {
  const t = useTranslations('Marketing.featured');
  const locale = useLocale() as AppLocale;
  const currency = useCurrencyStore((state) => state.currency);
  const scroller = useRef<HTMLDivElement>(null);
  const flashTarget = useMemo(() => new Date(Date.now() + 172_800_000), []);
  const items = t.raw('items') as Array<{
    name: string;
    category: string;
    badge: string;
    mark: string;
    price: number;
    previous: number;
    delivery: string;
  }>;
  const scroll = (direction: number) =>
    scroller.current?.scrollBy({
      left: direction * (locale === 'ar' ? -340 : 340),
      behavior: 'smooth'
    });
  return (
    <section className="marketing-section featured-section" id="featured">
      <div className="site-container">
        <div className="featured-heading">
          <SectionHeading
            eyebrow={t('eyebrow')}
            title={t('title')}
            description={t('description')}
          />
          <div className="carousel-actions">
            <Button
              size="icon"
              variant="outline"
              onClick={() => scroll(-1)}
              aria-label={t('previous')}
            >
              <ArrowLeft className="rtl:-scale-x-100" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => scroll(1)} aria-label={t('next')}>
              <ArrowRight className="rtl:-scale-x-100" />
            </Button>
          </div>
        </div>
        <div className="product-carousel" ref={scroller}>
          {items.map((item, index) => (
            <TiltCard key={item.name} className="product-card-wrap">
              <article className={`product-card accent-${productAccents[index] ?? 'violet'}`}>
                <ShineSweep>
                  <div className="product-card-top">
                    <Badge tone={index === 1 ? 'danger' : 'accent'}>{item.badge}</Badge>
                    <button type="button" aria-label={t('favorite')}>
                      ♡
                    </button>
                  </div>
                  <div className="product-art">
                    <span>{item.mark}</span>
                    <i aria-hidden="true" />
                  </div>
                  <div className="product-info">
                    <small>{item.category}</small>
                    <h3>{item.name}</h3>
                    <div className="product-rating">
                      <span>
                        <Star />
                        <Star />
                        <Star />
                        <Star />
                        <Star />
                      </span>
                      <small>4.9 · 1.2K</small>
                    </div>
                    <div className="product-bottom">
                      <PriceDisplay
                        amount={currency === 'LBP' ? item.price * 895 : item.price}
                        previousAmount={currency === 'LBP' ? item.previous * 895 : item.previous}
                        currency={currency}
                      />
                      <span>
                        <Clock3 />
                        {item.delivery}
                      </span>
                    </div>
                  </div>
                </ShineSweep>
              </article>
            </TiltCard>
          ))}
        </div>
        <div className="flash-strip">
          <span>
            <span className="live-dot" />
            {t('flash')}
          </span>
          <strong>{t('flashDeal')}</strong>
          <CountdownTimer target={flashTarget} compact />
          <Button size="sm" variant="ghost">
            {t('viewDeals')}
            <ArrowUpRight className="rtl:-scale-x-100" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const t = useTranslations('Marketing.steps');
  const steps = t.raw('items') as Array<{title: string; description: string}>;
  const icons = [Search, WalletCards, Zap];
  return (
    <section className="marketing-section process-section" id="how-it-works">
      <div className="site-container">
        <SectionHeading
          eyebrow={t('eyebrow')}
          title={t('title')}
          description={t('description')}
          centered
        />
        <StaggerList className="process-grid">
          {steps.map((step, index) => {
            const Icon = icons[index] ?? Sparkles;
            return (
              <StaggerItem key={step.title}>
                <article className="process-card">
                  <span className="process-number">0{index + 1}</span>
                  <div className="process-icon">
                    <Icon aria-hidden="true" />
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  {index < steps.length - 1 ? (
                    <span className="process-path" aria-hidden="true">
                      <ArrowRight className="rtl:-scale-x-100" />
                    </span>
                  ) : null}
                </article>
              </StaggerItem>
            );
          })}
        </StaggerList>
      </div>
    </section>
  );
}

function WalletStory() {
  const t = useTranslations('Marketing.wallet');
  return (
    <section className="marketing-section" id="wallet">
      <div className="site-container wallet-story">
        <div className="wallet-story-copy">
          <span className="section-kicker">
            <Sparkles />
            {t('eyebrow')}
          </span>
          <h2>{t('title')}</h2>
          <p>{t('description')}</p>
          <ul>
            {(t.raw('benefits') as string[]).map((benefit) => (
              <li key={benefit}>
                <CheckCircle2 />
                {benefit}
              </li>
            ))}
          </ul>
          <Button variant="gradient" size="lg">
            {t('cta')}
            <ArrowUpRight className="rtl:-scale-x-100" />
          </Button>
        </div>
        <TiltCard className="wallet-visual">
          <article className="wallet-card">
            <span className="wallet-glow" />
            <div className="wallet-card-head">
              <span>
                <span className="brand-symbol mini">
                  <span />
                  <span />
                </span>
                NEXORA
              </span>
              <Globe2 />
            </div>
            <div className="wallet-balance">
              <small>{t('balance')}</small>
              <strong>$83.00</strong>
              <Badge tone="success">+ $4.20</Badge>
            </div>
            <div className="wallet-card-foot">
              <span>•••• 9284</span>
              <span>{t('tier')}</span>
            </div>
          </article>
          <div className="wallet-float-card wallet-float-one">
            <Zap />
            <span>
              <strong>{t('instantTitle')}</strong>
              <small>{t('instantDetail')}</small>
            </span>
          </div>
          <div className="wallet-float-card wallet-float-two">
            <BadgeCheck />
            <span>
              <strong>{t('cashbackTitle')}</strong>
              <small>{t('cashbackDetail')}</small>
            </span>
          </div>
        </TiltCard>
      </div>
    </section>
  );
}

function PaymentStrip() {
  const t = useTranslations('Marketing.payments');
  const methods = ['WHISH', 'OMT', 'VISA', 'mastercard.', 'USDT', '₿ Bitcoin', 'Wallet'];
  return (
    <section className="payment-section">
      <div className="site-container">
        <p>{t('title')}</p>
        <div className="payment-methods">
          {methods.map((method) => (
            <span key={method}>{method}</span>
          ))}
        </div>
        <small>
          <ShieldCheck />
          {t('secure')}
        </small>
      </div>
    </section>
  );
}

function Testimonials() {
  const t = useTranslations('Marketing.testimonials');
  const items = t.raw('items') as Array<{
    quote: string;
    name: string;
    role: string;
    initials: string;
  }>;
  return (
    <section className="marketing-section">
      <div className="site-container">
        <SectionHeading
          eyebrow={t('eyebrow')}
          title={t('title')}
          description={t('description')}
          centered
        />
        <StaggerList className="testimonial-grid">
          {items.map((item, index) => (
            <StaggerItem key={item.name}>
              <article className={index === 1 ? 'testimonial-card featured' : 'testimonial-card'}>
                <span className="stars">
                  <Star />
                  <Star />
                  <Star />
                  <Star />
                  <Star />
                </span>
                <blockquote>“{item.quote}”</blockquote>
                <footer>
                  <span>{item.initials}</span>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.role}</small>
                  </div>
                  <BadgeCheck />
                </footer>
              </article>
            </StaggerItem>
          ))}
        </StaggerList>
      </div>
    </section>
  );
}

function FaqSection() {
  const t = useTranslations('Marketing.faq');
  const items = t.raw('items') as Array<{question: string; answer: string}>;
  return (
    <section className="marketing-section faq-section">
      <div className="site-container faq-layout">
        <div>
          <span className="section-kicker">
            <Sparkles />
            {t('eyebrow')}
          </span>
          <h2>{t('title')}</h2>
          <p>{t('description')}</p>
          <Button variant="outline">
            {t('support')}
            <Headphones />
          </Button>
        </div>
        <Accordion type="single" collapsible defaultValue="faq-0">
          {items.map((item, index) => (
            <AccordionItem key={item.question} value={`faq-${index}`}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function ClosingCta() {
  const t = useTranslations('Marketing.cta');
  return (
    <section className="closing-section">
      <div className="site-container">
        <div className="closing-card">
          <div className="closing-aurora" aria-hidden="true" />
          <span className="section-kicker">
            <Sparkles />
            {t('eyebrow')}
          </span>
          <h2>{t('title')}</h2>
          <p>{t('description')}</p>
          <div>
            <Button variant="gradient" size="lg">
              {t('primary')}
              <ArrowUpRight className="rtl:-scale-x-100" />
            </Button>
            <Button variant="outline" size="lg">
              {t('secondary')}
            </Button>
          </div>
          <small>
            <ShieldCheck />
            {t('note')}
          </small>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  centered
}: {
  eyebrow: string;
  title: string;
  description: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? 'marketing-heading centered' : 'marketing-heading'}>
      <div>
        <span className="section-kicker">
          <Sparkles aria-hidden="true" />
          {eyebrow}
        </span>
        <h2>{title}</h2>
      </div>
      <p>{description}</p>
    </div>
  );
}
