'use client';

import {
  Box,
  Check,
  ChevronDown,
  Command,
  CreditCard,
  Gamepad2,
  LayoutDashboard,
  Mail,
  Menu,
  Package,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  User,
  WalletCards,
  Zap
} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {useMemo, useState, type CSSProperties, type ReactNode} from 'react';

import {Brand} from '@/components/brand';
import {
  FadeInUp,
  HoverLift,
  PageTransition,
  ShineSweep,
  StaggerItem,
  StaggerList,
  TiltCard
} from '@/components/motion';
import {
  AnimatedCounter,
  CommandPalette,
  CopyButton,
  CountdownTimer,
  PriceDisplay,
  StatCard
} from '@/components/ui/advanced';
import {ChartCard} from '@/components/ui/chart-card';
import {Button} from '@/components/ui/button';
import {
  Checkbox,
  Combobox,
  FileUpload,
  Input,
  OtpField,
  RadioGroup,
  RadioItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
  Textarea
} from '@/components/ui/form-controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
  Dropdown,
  DropdownCheckboxItem,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownShortcut,
  DropdownTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/overlays';
import {
  Alert,
  Avatar,
  Badge,
  Breadcrumb,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  Progress,
  Rating,
  showToastExample,
  Skeleton,
  Stepper,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  Timeline,
  type TableColumn
} from '@/components/ui/surfaces';
import {CurrencySwitcher} from '@/features/preferences/components/currency-switcher';
import {LocaleSwitcher} from '@/features/preferences/components/language-switcher';
import {ThemeSwitcher} from '@/features/preferences/components/theme-switcher';

const colorScales = ['violet', 'cyan'] as const;
const colorSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const tableRows = [
  {
    id: 'NX-1042',
    product: 'PUBG Mobile UC',
    category: 'Top-up',
    price: '$24.99',
    status: 'Delivered'
  },
  {
    id: 'NX-1043',
    product: 'Netflix Premium',
    category: 'Subscription',
    price: '$13.50',
    status: 'Processing'
  },
  {
    id: 'NX-1044',
    product: 'PlayStation Store',
    category: 'Gift card',
    price: '$50.00',
    status: 'On hold'
  }
];
const tableColumns: TableColumn<(typeof tableRows)[number]>[] = [
  {key: 'id', label: 'Order', value: (row) => row.id, sortable: true},
  {key: 'product', label: 'Product', value: (row) => row.product, sortable: true, editable: true},
  {key: 'category', label: 'Category', value: (row) => row.category},
  {key: 'price', label: 'Total', value: (row) => row.price, align: 'end'},
  {
    key: 'status',
    label: 'Status',
    value: (row) => row.status,
    render: (row) => (
      <Badge
        tone={
          row.status === 'Delivered' ? 'success' : row.status === 'Processing' ? 'info' : 'warning'
        }
      >
        {row.status}
      </Badge>
    )
  }
];

export function DesignSystemPage() {
  const t = useTranslations('DesignSystem');
  const [commandOpen, setCommandOpen] = useState(false);
  const sections = t.raw('nav') as string[];
  const commands = sections.map((label, index) => ({
    id: label,
    label,
    detail: t('jumpTo'),
    icon: <Command aria-hidden="true" />,
    onSelect: () =>
      document.getElementById(`section-${index}`)?.scrollIntoView({behavior: 'smooth'})
  }));
  return (
    <PageTransition>
      <div className="design-system">
        <aside className="ds-sidebar">
          <a href="#top">
            <Brand />
          </a>
          <nav>
            {sections.map((section, index) => (
              <a key={section} href={`#section-${index}`}>
                {section}
              </a>
            ))}
          </nav>
          <div>
            <span>{t('version')}</span>
            <Badge tone="success">0.5</Badge>
          </div>
        </aside>
        <div className="ds-main">
          <header className="ds-header">
            <div>
              <Breadcrumb items={[{label: 'Nexora'}, {label: t('title')}]} />
            </div>
            <div>
              <CurrencySwitcher compact />
              <LocaleSwitcher />
              <ThemeSwitcher />
              <Button size="sm" variant="outline" onClick={() => setCommandOpen(true)}>
                <Command />
                {t('command')}
                <kbd>⌘K</kbd>
              </Button>
            </div>
          </header>
          <main id="top">
            <section className="ds-hero">
              <div className="ds-hero-orb" />
              <span className="section-kicker">
                <Sparkles />
                OBSIDIAN AURORA
              </span>
              <h1>{t('title')}</h1>
              <p>{t('description')}</p>
              <div>
                <Badge tone="accent">{t('darkFirst')}</Badge>
                <Badge tone="info">RTL / LTR</Badge>
                <Badge tone="success">WCAG AA</Badge>
                <Badge>v0.5</Badge>
              </div>
            </section>
            <TokenSection index={0} />
            <TypographySection index={1} />
            <ActionsSection index={2} />
            <FormsSection index={3} />
            <SurfacesSection index={4} />
            <NavigationSection index={5} />
            <FeedbackSection index={6} />
            <DataSection index={7} />
            <MotionSection index={8} />
            <ShellSection index={9} />
          </main>
        </div>
        <CommandPalette
          items={commands}
          open={commandOpen}
          onOpenChange={setCommandOpen}
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
      </div>
    </PageTransition>
  );
}

function Section({
  index,
  title,
  description,
  children
}: {
  index: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="ds-section" id={`section-${index}`}>
      <div className="ds-section-heading">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function TokenSection({index}: {index: number}) {
  const t = useTranslations('DesignSystem.tokens');
  return (
    <Section index={index} title={t('title')} description={t('description')}>
      <div className="ds-token-panel">
        <h3>{t('colorScales')}</h3>
        {colorScales.map((scale) => (
          <div className="ds-color-scale" key={scale}>
            <strong>{scale}</strong>
            <div>
              {colorSteps.map((step) => (
                <span key={step} style={{'--swatch': `var(--${scale}-${step})`} as CSSProperties}>
                  <i />
                  <small>{step}</small>
                </span>
              ))}
            </div>
          </div>
        ))}
        <h3>{t('semantic')}</h3>
        <div className="ds-semantic-grid">
          {[
            'background',
            'surface',
            'surface-raised',
            'border',
            'text',
            'text-muted',
            'accent',
            'success',
            'warning',
            'danger',
            'info'
          ].map((token) => (
            <span key={token} style={{'--swatch': `var(--${token})`} as CSSProperties}>
              <i />
              <small>{token}</small>
            </span>
          ))}
        </div>
        <h3>{t('foundations')}</h3>
        <div className="ds-foundations">
          <div className="ds-radius-demo">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="ds-shadow-demo">
            <span />
            <span />
            <span />
          </div>
          <div className="ds-spacing-demo">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
      <Snippet code=":root { --accent: var(--violet-500); --surface-raised: ... }" />
    </Section>
  );
}

function TypographySection({index}: {index: number}) {
  const t = useTranslations('DesignSystem.typography');
  return (
    <Section index={index} title={t('title')} description={t('description')}>
      <div className="ds-type-specimen">
        <div>
          <small>Display / Geist 760</small>
          <p className="display-xl">
            Digital life,
            <br />
            <span className="gradient-text">beautifully simple.</span>
          </p>
        </div>
        <div>
          <small>{t('arabic')}</small>
          <p className="display-lg" lang="ar" dir="rtl">
            عالمك الرقمي،
            <br />
            <span className="gradient-text">ببساطة أجمل.</span>
          </p>
        </div>
        <div className="ds-type-grid">
          <span>
            <small>Heading 1</small>
            <b className="heading-1">Build trust at every pixel.</b>
          </span>
          <span>
            <small>Heading 2</small>
            <b className="heading-2">Premium by design.</b>
          </span>
          <span>
            <small>Body large</small>
            <p className="body-lg">
              Clarity, rhythm, and generous space make complex commerce feel effortless.
            </p>
          </span>
          <span>
            <small>Body Arabic</small>
            <p className="body-lg" lang="ar" dir="rtl">
              الوضوح والإيقاع والمساحات المدروسة تجعل التجارة الرقمية أكثر سهولة.
            </p>
          </span>
        </div>
      </div>
      <Snippet code={'className="display-xl" // fluid clamp() preset'} />
    </Section>
  );
}

function ActionsSection({index}: {index: number}) {
  const t = useTranslations('DesignSystem.actions');
  return (
    <Section index={index} title={t('title')} description={t('description')}>
      <Specimen title={t('buttons')}>
        <div className="ds-row wrap">
          <Button variant="default">Primary</Button>
          <Button variant="gradient">
            <Sparkles />
            Gradient CTA
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
        <div className="ds-row wrap">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Cart">
            <ShoppingBag />
          </Button>
          <Button loading>Processing</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Specimen>
      <Specimen title={t('badges')}>
        <div className="ds-row wrap">
          <Badge>Neutral</Badge>
          <Badge tone="accent">Featured</Badge>
          <Badge tone="success">Delivered</Badge>
          <Badge tone="warning">Pending</Badge>
          <Badge tone="danger">Failed</Badge>
          <Badge tone="info">New</Badge>
          <Tag removable>Gift card</Tag>
          <Tag tone="accent">Platinum</Tag>
        </div>
      </Specimen>
      <Snippet code={'<Button variant="gradient" size="lg" loading={pending}>Continue</Button>'} />
    </Section>
  );
}

function FormsSection({index}: {index: number}) {
  const t = useTranslations('DesignSystem.forms');
  const [slider, setSlider] = useState([48]);
  return (
    <Section index={index} title={t('title')} description={t('description')}>
      <div className="ds-form-grid">
        <Specimen title={t('fields')}>
          <Input
            label={t('email')}
            placeholder="hello@nexora.store"
            leadingIcon={<Mail />}
            helper={t('helper')}
          />
          <Input label={t('playerId')} value="NX-884210" readOnly trailingIcon={<Check />} />
          <Input label={t('invalid')} value="invalid-id" readOnly error={t('error')} />
          <Textarea label={t('notes')} placeholder={t('notesPlaceholder')} />
          <Select defaultValue="private">
            <SelectTrigger>
              <SelectValue placeholder={t('select')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">{t('privateAccount')}</SelectItem>
              <SelectItem value="shared">{t('sharedAccount')}</SelectItem>
            </SelectContent>
          </Select>
          <Combobox
            label={t('combobox')}
            options={[
              {value: 'lb', label: t('countries.lb'), detail: 'LBP · USD'},
              {value: 'ae', label: t('countries.ae'), detail: 'AED'},
              {value: 'sa', label: t('countries.sa'), detail: 'SAR'}
            ]}
            value="lb"
            searchPlaceholder={t('comboboxSearch')}
            emptyMessage={t('comboboxEmpty')}
          />
        </Specimen>
        <Specimen title={t('choices')}>
          <Checkbox label={t('save')} defaultChecked />
          <Checkbox label={t('disabled')} disabled />
          <RadioGroup defaultValue="instant" className="ds-choice-stack">
            <RadioItem value="instant" label={t('instant')} />
            <RadioItem value="manual" label={t('manual')} />
          </RadioGroup>
          <Switch label={t('notifications')} defaultChecked />
          <Switch label={t('dripFeed')} />
          <Slider
            label={t('quantity')}
            valueLabel={`${slider[0] ?? 0}%`}
            value={slider}
            onValueChange={setSlider}
            max={100}
            step={1}
          />
          <div>
            <span className="ui-label">{t('otp')}</span>
            <OtpField value="492831" readOnly />
          </div>
        </Specimen>
      </div>
      <Specimen title={t('upload')}>
        <FileUpload
          label={t('dropzone')}
          description={t('dropzoneDescription')}
          limits={t('dropzoneLimits')}
          previewAlt={t('dropzonePreview')}
          removeLabel={t('dropzoneRemove')}
        />
      </Specimen>
      <Snippet code={'<Input label="Player ID" error={errors.playerId?.message} />'} />
    </Section>
  );
}

function SurfacesSection({index}: {index: number}) {
  const t = useTranslations('DesignSystem.surfaces');
  return (
    <Section index={index} title={t('title')} description={t('description')}>
      <div className="ds-card-grid">
        <Card>
          <CardHeader>
            <CardTitle>{t('cardTitle')}</CardTitle>
            <CardDescription>{t('cardDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={72} label="VIP progress" />
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm">
              View details
            </Button>
          </CardFooter>
        </Card>
        <HoverLift>
          <Card interactive>
            <CardHeader>
              <div className="ui-stat-icon">
                <WalletCards />
              </div>
              <CardTitle>Nexora Wallet</CardTitle>
              <CardDescription>{t('walletCard')}</CardDescription>
            </CardHeader>
            <CardContent>
              <PriceDisplay amount={8_300} currency="USD" size="lg" />
            </CardContent>
          </Card>
        </HoverLift>
        <TiltCard>
          <Card className="ds-tilt-demo">
            <ShineSweep>
              <div className="product-art">
                <span>UC</span>
              </div>
              <CardHeader>
                <Badge tone="accent">Best seller</Badge>
                <CardTitle>PUBG Mobile 600 UC</CardTitle>
              </CardHeader>
            </ShineSweep>
          </Card>
        </TiltCard>
      </div>
      <div className="ds-row">
        <Avatar fallback="AM" status="online" size="lg" />
        <Avatar fallback="RK" status="away" />
        <Avatar fallback="NX" size="sm" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">{t('hover')}</Button>
          </TooltipTrigger>
          <TooltipContent>{t('tooltip')}</TooltipContent>
        </Tooltip>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              Popover
              <ChevronDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <strong>{t('popoverTitle')}</strong>
            <p className="ui-field-helper">{t('popoverDescription')}</p>
          </PopoverContent>
        </Popover>
      </div>
    </Section>
  );
}

function NavigationSection({index}: {index: number}) {
  const t = useTranslations('DesignSystem.navigation');
  const [page, setPage] = useState(2);
  return (
    <Section index={index} title={t('title')} description={t('description')}>
      <Specimen title={t('tabs')}>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <p className="ui-field-helper">{t('tabContent')}</p>
          </TabsContent>
          <TabsContent value="activity">Activity</TabsContent>
          <TabsContent value="settings">Settings</TabsContent>
        </Tabs>
      </Specimen>
      <Specimen title={t('menus')}>
        <div className="ds-row wrap">
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="outline">
                Actions
                <ChevronDown />
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownLabel>Order actions</DropdownLabel>
              <DropdownItem>
                <Package />
                Open order<DropdownShortcut>↵</DropdownShortcut>
              </DropdownItem>
              <DropdownCheckboxItem checked>Live updates</DropdownCheckboxItem>
              <DropdownSeparator />
              <DropdownItem>
                <Settings />
                Settings
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="gradient">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('dialogTitle')}</DialogTitle>
                <DialogDescription>{t('dialogDescription')}</DialogDescription>
              </DialogHeader>
              <Input label="Reference" placeholder="NX-1042" />
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button variant="gradient">Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Menu />
                Open sheet
              </Button>
            </SheetTrigger>
            <SheetContent side="end">
              <SheetTitle>{t('sheetTitle')}</SheetTitle>
              <SheetDescription>{t('sheetDescription')}</SheetDescription>
              <div className="ds-choice-stack">
                <a href="#">Overview</a>
                <a href="#">Orders</a>
                <a href="#">Wallet</a>
              </div>
            </SheetContent>
          </Sheet>
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline">Open drawer</Button>
            </DrawerTrigger>
            <DrawerContent>
              <div className="ui-drawer-body">
                <DrawerTitle>{t('drawerTitle')}</DrawerTitle>
                <DrawerDescription>{t('drawerDescription')}</DrawerDescription>
                <Button variant="gradient">Continue</Button>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </Specimen>
      <div className="ds-row between">
        <Breadcrumb
          items={[{label: 'Home', href: '#'}, {label: 'Orders', href: '#'}, {label: 'NX-1042'}]}
        />
        <Pagination page={page} pages={5} onPageChange={setPage} />
      </div>
      <Snippet code={'<Tabs defaultValue="overview"><TabsList>…</TabsList></Tabs>'} />
    </Section>
  );
}

function FeedbackSection({index}: {index: number}) {
  const t = useTranslations('DesignSystem.feedback');
  const [rating, setRating] = useState(4);
  return (
    <Section index={index} title={t('title')} description={t('description')}>
      <div className="ds-alert-grid">
        <Alert tone="success" title={t('success')}>
          {t('successDetail')}
        </Alert>
        <Alert tone="info" title={t('info')}>
          {t('infoDetail')}
        </Alert>
        <Alert tone="warning" title={t('warning')}>
          {t('warningDetail')}
        </Alert>
        <Alert tone="danger" title={t('danger')}>
          {t('dangerDetail')}
        </Alert>
      </div>
      <Specimen title={t('progress')}>
        <div className="ds-progress-grid">
          <Progress value={68} label="Gold tier" />
          <Stepper
            current={1}
            steps={[
              {title: 'Payment', description: 'Confirmed'},
              {title: 'Processing', description: 'In progress'},
              {title: 'Delivery', description: 'Next'}
            ]}
          />
          <Rating value={rating} onChange={setRating} />
          <Button onClick={showToastExample}>Show rich toast</Button>
        </div>
      </Specimen>
      <div className="ds-state-grid">
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={<Button variant="gradient">Browse products</Button>}
        />
        <ErrorState
          title={t('errorTitle')}
          description={t('errorDescription')}
          onRetry={() => undefined}
        />
        <div className="ds-skeleton-card">
          <Skeleton className="h-36" />
          <Skeleton className="mt-4 h-4 w-2/3" />
          <Skeleton className="mt-3 h-4 w-full" />
        </div>
      </div>
    </Section>
  );
}

function DataSection({index}: {index: number}) {
  const t = useTranslations('DesignSystem.data');
  const target = useMemo(() => new Date(Date.now() + 180_000_000), []);
  return (
    <Section index={index} title={t('title')} description={t('description')}>
      <div className="ds-stats-grid">
        <StatCard label="Revenue" value="$28,420" change="18.4%" />
        <StatCard label="Orders" value="1,284" change="12.1%" icon={<ShoppingBag />} />
        <StatCard label="Wallet volume" value="$84.2K" change="7.8%" icon={<WalletCards />} />
      </div>
      <div className="ds-data-grid">
        <ChartCard />
        <Card className="ds-live-card">
          <CardHeader>
            <CardTitle>Flash sale</CardTitle>
            <CardDescription>{t('countdown')}</CardDescription>
          </CardHeader>
          <CardContent>
            <CountdownTimer target={target} />
            <div className="ds-counter">
              <AnimatedCounter value={24_890} suffix="+" />
              <small>{t('animated')}</small>
            </div>
          </CardContent>
        </Card>
      </div>
      <DataTable rows={tableRows} columns={tableColumns} />
      <Timeline
        events={[
          {
            title: 'Payment confirmed',
            detail: 'Wallet debit posted',
            time: '10:42',
            state: 'complete'
          },
          {
            title: 'Processing',
            detail: 'Supplier accepted the order',
            time: '10:43',
            state: 'current'
          },
          {
            title: 'Delivery',
            detail: 'Expected in under one minute',
            time: 'Next',
            state: 'upcoming'
          }
        ]}
      />
    </Section>
  );
}

function MotionSection({index}: {index: number}) {
  const t = useTranslations('DesignSystem.motion');
  return (
    <Section index={index} title={t('title')} description={t('description')}>
      <StaggerList className="ds-motion-grid">
        <StaggerItem>
          <HoverLift>
            <Card>
              <Zap />
              <strong>HoverLift</strong>
              <small>{t('hoverLift')}</small>
            </Card>
          </HoverLift>
        </StaggerItem>
        <StaggerItem>
          <TiltCard>
            <Card>
              <Gamepad2 />
              <strong>TiltCard</strong>
              <small>{t('tilt')}</small>
            </Card>
          </TiltCard>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <ShineSweep>
              <Sparkles />
              <strong>ShineSweep</strong>
              <small>{t('shine')}</small>
            </ShineSweep>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <FadeInUp>
            <Card>
              <Box />
              <strong>FadeInUp</strong>
              <small>{t('fade')}</small>
            </Card>
          </FadeInUp>
        </StaggerItem>
      </StaggerList>
      <Snippet code="<StaggerList><StaggerItem><HoverLift>…</HoverLift></StaggerItem></StaggerList>" />
    </Section>
  );
}

function ShellSection({index}: {index: number}) {
  const t = useTranslations('DesignSystem.shells');
  return (
    <Section index={index} title={t('title')} description={t('description')}>
      <div className="ds-shell-grid">
        <ShellPreview type="store" title={t('store')} />
        <ShellPreview type="account" title={t('account')} />
        <ShellPreview type="admin" title={t('admin')} />
      </div>
    </Section>
  );
}

function ShellPreview({type, title}: {type: 'store' | 'account' | 'admin'; title: string}) {
  const icons =
    type === 'store'
      ? [Search, ShoppingBag, WalletCards]
      : [LayoutDashboard, Package, CreditCard, User, Settings];
  return (
    <article className={`ds-shell-preview ds-shell-${type}`}>
      <header>
        <Brand compact />
        <strong>{title}</strong>
        <span />
      </header>
      <div>
        {type !== 'store' ? (
          <aside>
            {icons.map((Icon, index) => (
              <i key={index}>
                <Icon />
              </i>
            ))}
          </aside>
        ) : null}
        <main>
          <span />
          <span />
          <span />
          <div>
            <span />
            <span />
          </div>
        </main>
      </div>
    </article>
  );
}

function Specimen({title, children}: {title: string; children: ReactNode}) {
  return (
    <div className="ds-specimen">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
function Snippet({code}: {code: string}) {
  const t = useTranslations('DesignSystem');
  return (
    <div className="ds-snippet">
      <pre>
        <code>{code}</code>
      </pre>
      <CopyButton value={code} label={t('copy')} copiedMessage={t('copied')} />
    </div>
  );
}
