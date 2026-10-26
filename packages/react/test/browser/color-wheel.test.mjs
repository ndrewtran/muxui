import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

const entry = '/packages/react/test/fixtures/color-wheel-browser-entry.mjs';
const documentHtml = () => pageShell({
  head: '<style>body { margin: 0; padding: 16px; }</style>',
  body: '<div id="root"></div>',
  entry,
});

test('real browser drags a hex gray wheel through hues without snapping back or leaving rgb', { timeout: 90_000 }, async () => {
  const { url, close } = await startServer({ root: 'repository', entries: [entry.slice(1)], pages: { '/color-wheel.html': documentHtml } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 600, height: 300 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/color-wheel.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.muxuiColorWheelReady === 'true');
    const gray = 'rgba(128, 128, 128, 1)';
    for (const [name, label] of [['wheel', 'Wheel'], ['picker', 'Picker wheel']]) {
      const track = page.locator(`.muxui-color-wheel:has(input[aria-label="${label}"]) .muxui-color-wheel__track`);
      const box = await track.boundingBox();
      const hue = () => page.locator(`input[aria-label="${label}"]`).inputValue();
      const last = () => page.evaluate((key) => globalThis.__muxuiColorWheelChanges[key].at(-1), name);
      // The wheel's 0 degrees is 3 o'clock and hues grow clockwise; the ring sits at 80px of the 96px outer radius.
      const drag = async (degrees) => {
        const radians = degrees * Math.PI / 180;
        await page.mouse.move(box.x + 96 + 80 * Math.cos(radians), box.y + 96 + 80 * Math.sin(radians));
      };
      await drag(90);
      await page.mouse.down();
      assert.equal(await hue(), '90', `${name} follows the press`);
      for (const degrees of [180, 270, 45]) {
        await drag(degrees);
        assert.equal(await hue(), String(degrees), `${name} follows the drag to ${degrees}`);
        assert.equal(await last(), gray, `${name} reports the rgb gray`);
      }
      await page.mouse.up();
      assert.equal(await hue(), '45', `${name} keeps the hue after release`);
    }
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
