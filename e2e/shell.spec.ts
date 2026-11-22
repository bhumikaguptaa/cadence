import { expect, test } from '@playwright/test';

test('home shell renders the headline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Subscriptions you can actually see.',
  );
});

test('tokens page renders and every contrast pair passes', async ({ page }) => {
  await page.goto('/dev/tokens');
  await expect(page.getByRole('heading', { level: 1, name: 'Design tokens' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('cell', { name: /FAIL/ })).toHaveCount(0);
});

test('no horizontal scroll at this viewport', async ({ page }) => {
  for (const path of ['/', '/dev/tokens']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});
