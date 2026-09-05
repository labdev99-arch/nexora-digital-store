import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';

test.setTimeout(120_000);

for (const locale of ['en', 'ar'] as const) {
  test(`${locale} homepage and legal pages meet automated WCAG AA checks`, async ({page}) => {
    for (const path of ['', '/legal/privacy', '/legal/terms', '/legal/refund']) {
      await page.goto(`/${locale}${path}`);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      const results = await new AxeBuilder({page})
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('.cf-turnstile')
        .analyze();
      expect(results.violations).toEqual([]);
    }
  });

  test(`${locale} has no horizontal overflow at 320px`, async ({page}) => {
    await page.setViewportSize({width: 320, height: 800});
    await page.goto(`/${locale}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
