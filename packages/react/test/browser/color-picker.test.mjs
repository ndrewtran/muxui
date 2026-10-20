import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

const entry = '/packages/react/test/fixtures/color-picker-browser-entry.mjs';
const documentHtml = () => pageShell({
  head: '<style>body { margin: 0; padding: 16px; } .muxui-color-area { width: 200px; height: 200px; } .muxui-color-slider { width: 240px; } .muxui-color-slider-track { height: 24px; }</style>',
  body: '<div id="root"></div>',
  entry,
});

test('real browser drags a hue slider off black in a hex picker, then the area edits in that hue', { timeout: 90_000 }, async () => {
  const { url, close } = await startServer({ root: 'repository', entries: [entry.slice(1)], pages: { '/color-picker.html': documentHtml } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 400, height: 500 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/color-picker.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.muxuiColorPickerReady === 'true');
    const last = () => page.evaluate(() => globalThis.__muxuiColorPickerChanges.at(-1));
    const hue = () => page.locator('.muxui-color-slider input[type="range"]').inputValue();

    // Black has no hue in hex, yet the thumb follows the pointer and the picker still reports rgba().
    const track = await page.locator('.muxui-color-slider-track').boundingBox();
    await page.mouse.move(track.x + 0.5 * track.width, track.y + track.height / 2);
    await page.mouse.down();
    await page.mouse.move(track.x + 0.25 * track.width, track.y + track.height / 2);
    const dragged = Number(await hue());
    assert.ok(Math.abs(dragged - 90) <= 3, `the thumb follows the drag to about 90, not ${dragged}`);
    assert.equal(await last(), 'rgba(0, 0, 0, 1)');
    await page.mouse.up();
    assert.equal(Number(await hue()), dragged, 'the thumb stays after release');

    // Full saturation and brightness in the slider's hue.
    const area = await page.locator('.muxui-color-area').boundingBox();
    await page.mouse.move(area.x + 0.5 * area.width, area.y + 0.5 * area.height);
    await page.mouse.down();
    await page.mouse.move(area.x + 1.2 * area.width, area.y - 0.2 * area.height);
    await page.mouse.up();
    const [red, green, blue] = (await last()).match(/\d+/gu).map(Number);
    assert.equal(Math.max(red, green, blue), 255);
    const areaHue = await page.evaluate(([r, g, b]) => {
      const max = Math.max(r, g, b);
      const delta = max - Math.min(r, g, b);
      const sector = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
      return (sector * 60 + 360) % 360;
    }, [red, green, blue]);
    assert.ok(Math.abs(areaHue - dragged) <= 2, `the area edits in the hue ${dragged}, not ${areaHue} (${await last()})`);
    assert.equal(Number(await hue()), dragged, 'the slider keeps its hue');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
