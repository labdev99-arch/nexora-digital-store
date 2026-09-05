'use client';

import {Command as CommandRoot} from 'cmdk';
import {animate, m as motion, useMotionValue, useTransform} from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Command as CommandIcon,
  Copy,
  Search,
  TrendingUp
} from 'lucide-react';
import {useLocale} from 'next-intl';
import {useEffect, useState, type ReactNode} from 'react';
import {toast} from 'sonner';

import type {AppLocale} from '@/i18n/routing';
import {formatMinorUnits, type CurrencyCode} from '@/lib/money';
import {cn} from '@/lib/utils';
import {Button} from './button';
import {Dialog, DialogContent, DialogDescription, DialogTitle} from './overlays';
import {Card} from './surfaces';

export type CommandItem = {
  id: string;
  label: string;
  detail?: string;
  shortcut?: string;
  icon?: ReactNode;
  onSelect?: () => void;
};
export function CommandPalette({
  items,
  open,
  onOpenChange,
  labels
}: {
  items: CommandItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: {
    title: string;
    description: string;
    placeholder: string;
    escape: string;
    noResults: string;
    quickActions: string;
    command: string;
    navigate: string;
    open: string;
  };
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ui-command-dialog">
        <DialogTitle className="sr-only">{labels.title}</DialogTitle>
        <DialogDescription className="sr-only">{labels.description}</DialogDescription>
        <CommandRoot className="ui-command">
          <div className="ui-command-input">
            <Search aria-hidden="true" />
            <CommandRoot.Input placeholder={labels.placeholder} autoFocus />
            <kbd>{labels.escape}</kbd>
          </div>
          <CommandRoot.List>
            <CommandRoot.Empty>{labels.noResults}</CommandRoot.Empty>
            <CommandRoot.Group heading={labels.quickActions}>
              {items.map((item) => (
                <CommandRoot.Item
                  key={item.id}
                  value={`${item.label} ${item.detail ?? ''}`}
                  onSelect={() => {
                    item.onSelect?.();
                    onOpenChange(false);
                  }}
                >
                  {item.icon}
                  <span>
                    <strong>{item.label}</strong>
                    {item.detail ? <small>{item.detail}</small> : null}
                  </span>
                  {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                </CommandRoot.Item>
              ))}
            </CommandRoot.Group>
          </CommandRoot.List>
          <div className="ui-command-footer">
            <span>
              <CommandIcon aria-hidden="true" />
              {labels.command}
            </span>
            <span>
              <kbd>↑↓</kbd> {labels.navigate} <kbd>↵</kbd> {labels.open}
            </span>
          </div>
        </CommandRoot>
      </DialogContent>
    </Dialog>
  );
}

export function CopyButton({
  value,
  label,
  copiedMessage
}: {
  value: string;
  label: string;
  copiedMessage: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(copiedMessage);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  return (
    <Button size="sm" variant="ghost" onClick={() => void copy()}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

export function PriceDisplay({
  amount,
  currency,
  previousAmount,
  size = 'md',
  suffix
}: {
  amount: number;
  currency: CurrencyCode;
  previousAmount?: number;
  size?: 'sm' | 'md' | 'lg';
  suffix?: string;
}) {
  const locale = useLocale() as AppLocale;
  return (
    <span className={cn('ui-price', `ui-price-${size}`)}>
      <strong dir="ltr">{formatMinorUnits(amount, currency, locale)}</strong>
      {previousAmount ? (
        <del dir="ltr">{formatMinorUnits(previousAmount, currency, locale)}</del>
      ) : null}
      {suffix ? <small>{suffix}</small> : null}
    </span>
  );
}

export function CountdownTimer({target, compact}: {target: Date; compact?: boolean}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, target.getTime() - Date.now()));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [target]);
  const totalSeconds = Math.floor((remaining ?? 0) / 1_000);
  const values = [
    Math.floor(totalSeconds / 86_400),
    Math.floor((totalSeconds % 86_400) / 3_600),
    Math.floor((totalSeconds % 3_600) / 60),
    totalSeconds % 60
  ];
  const labels = ['D', 'H', 'M', 'S'];
  if (compact)
    return (
      <time className="ui-countdown-compact" dateTime={target.toISOString()}>
        {remaining === null
          ? '--:--:--'
          : values
              .slice(1)
              .map((value) => String(value).padStart(2, '0'))
              .join(':')}
      </time>
    );
  return (
    <div className="ui-countdown" aria-label="Time remaining">
      {values.map((value, index) => (
        <span key={labels[index]}>
          <strong>{remaining === null ? '--' : String(value).padStart(2, '0')}</strong>
          <small>{labels[index]}</small>
        </span>
      ))}
    </div>
  );
}

export function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  className
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(
    motionValue,
    (latest) =>
      `${prefix}${latest.toLocaleString(undefined, {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}${suffix}`
  );
  useEffect(() => {
    const controls = animate(motionValue, value, {duration: 0.8, ease: [0.16, 1, 0.3, 1]});
    return controls.stop;
  }, [motionValue, value]);
  return <motion.span className={className}>{rounded}</motion.span>;
}

export function StatCard({
  label,
  value,
  change,
  trend = 'up',
  icon
}: {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down';
  icon?: ReactNode;
}) {
  const TrendIcon = trend === 'up' ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="ui-stat-card" interactive>
      <div className="ui-stat-icon">{icon ?? <TrendingUp aria-hidden="true" />}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {change ? (
        <small data-trend={trend}>
          <TrendIcon aria-hidden="true" />
          {change}
        </small>
      ) : null}
    </Card>
  );
}
