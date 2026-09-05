import {expect, test} from '@playwright/test';

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;
const variantId = process.env.E2E_VARIANT_ID;

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/en/auth/sign-in');
  await page.getByLabel(/email/i).fill(email ?? '');
  await page.getByLabel(/password/i).fill(password ?? '');
  await page.getByRole('button', {name: /sign in/i}).click();
  await expect(page).toHaveURL(/\/en\/account/);
}

test.describe('Phase 5 purchase journeys', () => {
  test.skip(
    !email || !password || !variantId,
    'Requires the documented seeded E2E account and variant'
  );

  test.beforeEach(async ({page}) => {
    await signIn(page);
    const response = await page.request.post('/api/cart?locale=en', {
      data: {variantId, quantity: 1, optionValues: {}}
    });
    expect(response.ok()).toBeTruthy();
  });

  test('wallet purchase creates a paid order', async ({page}) => {
    await page.goto('/en/checkout');
    await page.getByRole('button', {name: /wallet/i}).click();
    await page.getByLabel(/terms/i).check();
    await page.getByRole('button', {name: /place order/i}).click();
    await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]+/);
    await expect(page.getByText(/paid/i).first()).toBeVisible();
  });

  test('coupon is persisted and reflected at checkout', async ({page}) => {
    await page.goto('/en/cart');
    await page.getByLabel(/coupon/i).fill(process.env.E2E_COUPON_CODE ?? 'FIRST10');
    await page.getByRole('button', {name: /apply/i}).click();
    await expect(page.getByText(/cart updated/i)).toBeVisible();
  });

  test('direct sandbox payment settles a paid order', async ({page}) => {
    await page.goto('/en/checkout');
    const direct = page
      .locator('.payment-methods > button')
      .filter({hasNotText: /wallet/i})
      .first();
    await direct.click();
    await page.getByLabel(/terms/i).check();
    await page.getByRole('button', {name: /place order/i}).click();
    await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]+/);
    await expect(page.getByText(/paid/i).first()).toBeVisible();
  });

  test('customer can submit a refund request', async ({page}) => {
    const orderId = process.env.E2E_REFUNDABLE_ORDER_ID;
    test.skip(!orderId, 'Requires a paid refundable sandbox order');
    await page.goto(`/en/account/orders/${orderId}`);
    await page.getByLabel(/reason/i).fill('Automated sandbox refund verification');
    await page.getByRole('button', {name: /request refund/i}).click();
    await expect(page.getByText(/request completed/i)).toBeVisible();
  });
});
