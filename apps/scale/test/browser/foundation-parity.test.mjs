import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { compileWebTheme } from '@muxui/tokens';
import source from '../../../../catalog/tokens/default-theme.json' with { type: 'json' };
import reference from '../../../../packages/tokens/test/fixtures/foundation-reference.json' with { type: 'json' };
import { chromeExecutable } from './chrome.mjs';

test('all mapped foundation variables match retained donor values across modes, viewport and root font sizes', { timeout: 90_000 }, async () => {
  const crosswalk = source.extensions['muxui.experimental.tale-token-crosswalk'];
  assert.equal(reference.donor.commit, crosswalk.revision);
  assert.equal(reference.mappings.length, 644);
  assert.equal(reference.cases.length, 48);
  assert.deepEqual(Object.fromEntries(reference.mappings.map(({ variable, id }) => [variable, id])),
    Object.fromEntries(Object.entries(crosswalk.tokens).map(([variable, { muxuiTokenId }]) => [variable, muxuiTokenId])));
  assert.deepEqual(Object.keys(reference.baseExpected).sort(), reference.mappings.map(({ id }) => id).sort());
  const browser = await chromium.launch({ executablePath: await chromeExecutable(), headless: true });
  try {
    const page = await browser.newPage();
    const differences = [];
    for (const scenario of reference.cases) {
      const { colorScheme, motion, responsive, rootSize, viewport } = scenario;
      const expected = { ...reference.baseExpected, ...scenario.expectedOverrides };
      const { css } = compileWebTheme(source, { modes: { colorScheme, motion }, responsive });
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.setContent(`<style>${css}\nhtml { font-size: ${rootSize}px; } .probe { position: absolute; height: 1px; }</style><div id="probes"></div>`);
      const actual = await page.evaluate((mappings) => Object.fromEntries(mappings.map(({ id, property }) => {
        const name = `--muxui-${id.replaceAll('.', '-')}`;
        const probe = document.createElement('div');
        probe.className = 'probe';
        if (property) probe.style.setProperty(property, `var(${name})`);
        document.getElementById('probes').append(probe);
        const value = getComputedStyle(probe).getPropertyValue(property ?? name).trim().replace(/\s+/g, ' ');
        probe.remove();
        return [id, value];
      })), reference.mappings);
      for (const { id } of reference.mappings) {
        if (actual[id] !== expected[id]) differences.push({ case: scenario.id, id, expected: expected[id], actual: actual[id] });
      }
    }
    assert.deepEqual(differences, [], `${differences.length} differences from the retained donor foundation values`);
  } finally {
    await browser.close();
  }
});
