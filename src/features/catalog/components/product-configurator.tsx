'use client';

import {zodResolver} from '@hookform/resolvers/zod';
import {CheckCircle2, Droplets, FileUp, ShieldCheck, ShoppingBag} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {useMemo, useState, useTransition} from 'react';
import {useForm, type UseFormRegister, type UseFormSetValue} from 'react-hook-form';
import {toast} from 'sonner';

import {PriceDisplay} from '@/components/ui/advanced';
import {Button} from '@/components/ui/button';
import {Checkbox, Input, Textarea} from '@/components/ui/form-controls';
import {Badge} from '@/components/ui/surfaces';
import type {AppLocale} from '@/i18n/routing';
import type {CurrencyCode} from '@/lib/money';
import {calculateSmmPrice} from '../pricing';
import {buildProductInputSchema} from '../schemas/product-input';
import {submitServiceQuote} from '../server/actions';
import type {CatalogInputField, CatalogProduct} from '../types';
import {translate} from '../types';

type DynamicValues = Record<string, unknown>;

export function ProductConfigurator({product}: {product: CatalogProduct}) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('Catalog.product');
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '');
  const [dripFeed, setDripFeed] = useState(false);
  const [pending, startTransition] = useTransition();
  const variant = product.variants.find((item) => item.id === variantId) ?? product.variants[0];
  const fields = product.serviceConfig?.requirementSchema.length
    ? product.serviceConfig.requirementSchema
    : product.inputSchema;
  const schema = useMemo(() => buildProductInputSchema(fields), [fields]);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: {errors}
  } = useForm<DynamicValues>({resolver: zodResolver(schema), mode: 'onBlur'});
  const smmConfig = product.smmConfigs.find((item) => item.variantId === variant?.id);
  const quantityField = fields.find((field) => field.type === 'quantity');
  const quantity = Number(watch(quantityField?.key ?? 'quantity') ?? smmConfig?.minQuantity ?? 0);
  const price = smmConfig
    ? calculateSmmPrice(Number.isFinite(quantity) ? quantity : 0, smmConfig.pricePer1000Amount)
    : (variant?.priceAmount ?? 0);

  const onSubmit = (values: DynamicValues) => {
    if (product.serviceConfig?.customQuoteRequired) {
      startTransition(async () => {
        const result = await submitServiceQuote({
          locale,
          productId: product.id,
          variantId: variant?.id,
          requirements: Object.fromEntries(
            Object.entries(values).filter((entry) => entry[1] !== undefined && entry[1] !== '')
          )
        });
        if (result.ok) toast.success(t('quoteSuccess'));
        else toast.error(t('quoteError'));
      });
      return;
    }
    startTransition(async () => {
      const cartQuantity = quantityField ? Number(values[quantityField.key] ?? 1) : 1;
      const response = await fetch(`/api/cart?locale=${locale}`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          variantId: variant?.id,
          quantity: Number.isSafeInteger(cartQuantity) && cartQuantity > 0 ? cartQuantity : 1,
          optionValues: {...values, ...(smmConfig?.dripFeedEnabled ? {drip_feed: dripFeed} : {})}
        })
      });
      if (response.ok) toast.success(t('addedToCart'));
      else toast.error(t('cartError'));
    });
  };

  if (!variant) return <p>{t('unavailable')}</p>;

  return (
    <form className="product-configurator" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
      <div className="product-configurator-heading">
        <div>
          <span>{t('startingAt')}</span>
          <PriceDisplay amount={price} currency={variant.currencyCode as CurrencyCode} size="lg" />
        </div>
        <Badge tone={product.status === 'active' ? 'success' : 'warning'}>
          {t(`status.${product.status}`)}
        </Badge>
      </div>

      {product.variants.length > 1 ? (
        <fieldset className="variant-picker">
          <legend>{t('chooseVariant')}</legend>
          {product.variants.map((item) => (
            <button
              key={item.id}
              type="button"
              data-selected={item.id === variant.id || undefined}
              onClick={() => setVariantId(item.id)}
            >
              <span>{translate(item.name, locale)}</span>
              <PriceDisplay
                amount={item.priceAmount}
                currency={item.currencyCode as CurrencyCode}
                size="sm"
              />
            </button>
          ))}
        </fieldset>
      ) : null}

      <div className="dynamic-fields">
        {fields.map((field) => (
          <DynamicField
            key={field.key}
            field={field}
            locale={locale}
            error={
              errors[field.key]?.message
                ? t(`validation.${errorText(errors[field.key]?.message)}`)
                : undefined
            }
            register={register}
            setValue={setValue}
          />
        ))}
      </div>

      {smmConfig?.dripFeedEnabled ? (
        <div className="drip-feed-control">
          <Checkbox
            label={t('dripFeed')}
            checked={dripFeed}
            onCheckedChange={(checked) => setDripFeed(checked === true)}
          />
          <span>
            <Droplets aria-hidden="true" />
            {t('dripDetails', {
              runs: smmConfig.maxDripRuns ?? 1,
              minutes: smmConfig.minDripIntervalMinutes ?? 0
            })}
          </span>
        </div>
      ) : null}

      {product.serviceConfig ? (
        <div className="service-details">
          <span>
            <CheckCircle2 aria-hidden="true" />
            {t('revisions', {count: product.serviceConfig.includedRevisions})}
          </span>
          {product.serviceConfig.milestoneTemplates.map((milestone) => (
            <span key={translate(milestone.title, locale)}>
              <ShieldCheck aria-hidden="true" />
              {translate(milestone.title, locale)} · {milestone.percentage}%
            </span>
          ))}
        </div>
      ) : null}

      <Button
        type="submit"
        variant="gradient"
        size="lg"
        loading={pending}
        disabled={product.status !== 'active'}
      >
        <ShoppingBag aria-hidden="true" />
        {product.serviceConfig?.customQuoteRequired ? t('requestQuote') : t('continue')}
      </Button>
      <p className="product-fulfillment-note">
        <ShieldCheck aria-hidden="true" />
        {t(`fulfillment.${product.fulfillmentMode}`)}
      </p>
    </form>
  );
}

function DynamicField({
  field,
  locale,
  error,
  register,
  setValue
}: {
  field: CatalogInputField;
  locale: string;
  error?: string;
  register: UseFormRegister<DynamicValues>;
  setValue: UseFormSetValue<DynamicValues>;
}) {
  const label = translate(field.label, locale);
  const helper = field.help ? translate(field.help, locale) : undefined;
  const placeholder = field.placeholder ? translate(field.placeholder, locale) : undefined;
  if (field.type === 'notes') {
    return (
      <Textarea
        label={label}
        helper={helper}
        placeholder={placeholder}
        required={field.required}
        error={error}
        {...register(field.key)}
      />
    );
  }
  if (field.type === 'file_upload') {
    return (
      <label className="dynamic-upload">
        <span>{label}</span>
        <span>
          <FileUp aria-hidden="true" />
          {helper}
        </span>
        <input
          type="file"
          required={field.required}
          accept={field.acceptedTypes?.join(',')}
          onChange={(event) =>
            setValue(field.key, event.target.files?.[0]?.name ?? '', {shouldValidate: true})
          }
        />
        {error ? <small>{error}</small> : null}
      </label>
    );
  }
  return (
    <Input
      label={label}
      helper={helper}
      placeholder={placeholder}
      required={field.required}
      error={error}
      type={
        field.type === 'email'
          ? 'email'
          : field.type === 'quantity'
            ? 'number'
            : field.type === 'profile_url'
              ? 'url'
              : 'text'
      }
      min={field.min}
      max={field.max}
      step={field.step}
      {...register(field.key)}
    />
  );
}

function errorText(value: unknown): string {
  return typeof value === 'string' ? value : 'invalid';
}
