import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

const entry = '/packages/react/test/fixtures/color-area-browser-entry.mjs';
const documentHtml = () => pageShell({
  head: '<style>body { margin: 0; } .muxui-color-area { width: 200px; height: 200px; }</style>',
  body: '<div id="root"></div>',
  entry,
});

test('real browser maps pointer x to saturation and y to brightness without losing the hue at black', { timeout: 90_000 }, async () => {
  const { url, close } = await startServer({ root: 'repository', entries: [entry.slice(1)], pages: { '/color-area.html': documentHtml } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/color-area.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.muxuiColorAreaReady === 'true');
    const box = await page.locator('.muxui-color-area').boundingBox();
    const inputs = page.locator('.muxui-color-area input[type="range"]');
    const last = () => page.evaluate(() => globalThis.__muxuiColorAreaChanges.at(-1));
    const channels = () => inputs.evaluateAll((nodes) => nodes.map((node) => Number(node.value)));
    const drag = async (x, y) => { await page.mouse.move(box.x + x * box.width, box.y + y * box.height); };

    // Pressing inside the area and dragging past an edge clamps to that edge.
    await drag(0.5, 0.5);
    await page.mouse.down();
    await drag(-0.2, -0.2);
    assert.equal(await last(), 'rgba(255, 255, 255, 1)', 'top left is no saturation at full brightness');
    assert.deepEqual(await channels(), [0, 100]);
    await drag(1.2, -0.2);
    assert.equal(await last(), 'rgba(0, 128, 255, 1)', 'top right is full saturation at full brightness, in the hue of #336699');
    await drag(1.2, 1.2);
    assert.equal(await last(), 'rgba(0, 0, 0, 1)', 'the bottom edge is black');
    assert.deepEqual(await channels(), [100, 0]);
    await drag(1.2, -0.2);
    assert.equal(await last(), 'rgba(0, 128, 255, 1)', 'the hue survives a pass through black');
    assert.deepEqual(await channels(), [100, 100]);
    await page.mouse.up();
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
