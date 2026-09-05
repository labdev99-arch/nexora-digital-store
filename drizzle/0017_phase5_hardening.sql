-- Phase 5 advisor hardening: cover every commerce FK and avoid duplicate
-- permissive SELECT policies for authenticated staff.

CREATE INDEX carts_converted_order_idx ON carts(converted_order_id) WHERE converted_order_id IS NOT NULL;
CREATE INDEX carts_currency_idx ON carts(currency_code);
CREATE INDEX carts_locale_idx ON carts(locale_code);
CREATE INDEX country_prices_currency_idx ON country_prices(currency_code);
CREATE INDEX coupon_redemptions_currency_idx ON coupon_redemptions(currency_code);
CREATE INDEX coupon_redemptions_order_idx ON coupon_redemptions(order_id);
CREATE INDEX coupons_currency_idx ON coupons(currency_code) WHERE currency_code IS NOT NULL;
CREATE INDEX coupons_free_variant_idx ON coupons(free_variant_id) WHERE free_variant_id IS NOT NULL;
CREATE INDEX order_refunds_payment_refund_idx ON order_refund_requests(payment_refund_id) WHERE payment_refund_id IS NOT NULL;
CREATE INDEX order_refunds_wallet_transaction_idx ON order_refund_requests(wallet_transaction_id) WHERE wallet_transaction_id IS NOT NULL;
CREATE INDEX orders_currency_idx ON orders(currency_code);
CREATE INDEX orders_locale_idx ON orders(locale_code);
CREATE INDEX tier_prices_currency_idx ON tier_prices(currency_code);

DROP POLICY commerce_pricing_staff_all ON tier_prices;
DROP POLICY country_prices_staff_all ON country_prices;
DROP POLICY quantity_discounts_staff_all ON quantity_discounts;
DROP POLICY flash_sales_staff_all ON flash_sales;
DROP POLICY flash_scopes_staff_all ON flash_sale_scopes;
DROP POLICY tax_rules_staff_all ON tax_rules;

CREATE POLICY tier_prices_staff_insert ON tier_prices FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY tier_prices_staff_update ON tier_prices FOR UPDATE TO authenticated
  USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY tier_prices_staff_delete ON tier_prices FOR DELETE TO authenticated
  USING ((SELECT private.app_can('catalog.manage')));

CREATE POLICY country_prices_staff_insert ON country_prices FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY country_prices_staff_update ON country_prices FOR UPDATE TO authenticated
  USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY country_prices_staff_delete ON country_prices FOR DELETE TO authenticated
  USING ((SELECT private.app_can('catalog.manage')));

CREATE POLICY quantity_discounts_staff_insert ON quantity_discounts FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY quantity_discounts_staff_update ON quantity_discounts FOR UPDATE TO authenticated
  USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY quantity_discounts_staff_delete ON quantity_discounts FOR DELETE TO authenticated
  USING ((SELECT private.app_can('catalog.manage')));

CREATE POLICY flash_sales_staff_insert ON flash_sales FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY flash_sales_staff_update ON flash_sales FOR UPDATE TO authenticated
  USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY flash_sales_staff_delete ON flash_sales FOR DELETE TO authenticated
  USING ((SELECT private.app_can('catalog.manage')));

CREATE POLICY flash_scopes_staff_insert ON flash_sale_scopes FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY flash_scopes_staff_update ON flash_sale_scopes FOR UPDATE TO authenticated
  USING ((SELECT private.app_can('catalog.manage'))) WITH CHECK ((SELECT private.app_can('catalog.manage')));
CREATE POLICY flash_scopes_staff_delete ON flash_sale_scopes FOR DELETE TO authenticated
  USING ((SELECT private.app_can('catalog.manage')));

CREATE POLICY tax_rules_staff_insert ON tax_rules FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.app_can('finance.manage')));
CREATE POLICY tax_rules_staff_update ON tax_rules FOR UPDATE TO authenticated
  USING ((SELECT private.app_can('finance.manage'))) WITH CHECK ((SELECT private.app_can('finance.manage')));
CREATE POLICY tax_rules_staff_delete ON tax_rules FOR DELETE TO authenticated
  USING ((SELECT private.app_can('finance.manage')));
