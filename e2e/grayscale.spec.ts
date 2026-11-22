import { expect, test } from '@playwright/test';

/**
 * ADR-004: covered and uncovered track segments must stay distinguishable without color.
 * We screenshot each segment with a grayscale filter, decode the pixels in the page, and require:
 * (a) the uncovered segment has strong texture (hatch) while the covered one is flat, and
 * (b) the text label is present.
 */
async function pixelStats(page: import('@playwright/test').Page, png: Buffer) {
  return page.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    let sumSq = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const g = d[i] ?? 0; // grayscale: R == G == B
      sum += g;
      sumSq += g * g;
    }
    const mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
  }, png.toString('base64'));
}

test('uncovered track segment is distinguishable in grayscale and labeled', async ({ page }) => {
  await page.goto('/dev/tokens');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });

  // Inset the clip so rounded corners and borders of the track container are not sampled.
  const sample = async (testId: string) => {
    const el = page.getByTestId(testId);
    await el.scrollIntoViewIfNeeded();
    const box = await el.boundingBox();
    if (!box) throw new Error(`${testId} not visible`);
    const png = await page.screenshot({
      clip: { x: box.x + 12, y: box.y + 4, width: box.width - 24, height: box.height - 8 },
    });
    return pixelStats(page, png);
  };
  const covered = await sample('track-covered');
  const uncovered = await sample('track-uncovered');

  expect(covered.std, 'covered segment should be flat').toBeLessThan(6);
  expect(uncovered.std, 'uncovered segment should be visibly textured').toBeGreaterThan(40);
  await expect(page.getByText('Not covered · $2.89 short')).toBeVisible();
});
