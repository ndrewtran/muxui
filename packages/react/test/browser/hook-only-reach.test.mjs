import assert from 'node:assert/strict';
import test from 'node:test';
import { partRows, selectorOf } from '../support/styling-parts.ts';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Twelve documented hooks have no rule in any authored stylesheet (the part map's hookOnly rows): Mux emits the class and styles
// the element another way or not at all. A hook is only useful if a consumer's rule on it reaches the element, so this mounts each
// row's fixture with the shipped stylesheets and support/hook-only.css (one unlayered rule per row that paints a probe outline
// colour) and checks that the probe lands on exactly the elements the selector matches, and on no other element on the page.
// It shows the contract selector works with the real CSS loaded; it does not claim Mux styles the element. Runs in every engine
// named by MUXUI_BROWSER_ENGINES.

const probe = 'rgb(1, 2, 3)';
const hookOnly = partRows.filter((row) => row.hookOnly !== undefined);
assert.equal(hookOnly.length, 12);

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as M from '/generated/index.mjs';
import { Markdown } from '/generated/markdown.js';
import { TextEditor } from '/generated/text-editor.js';
import { hookOnlyFixtures } from '/test/support/styling-fixtures.mjs';

const key = new URLSearchParams(location.search).get('key');
createRoot(document.getElementById('root')).render(hookOnlyFixtures[key].element({ h: React.createElement, M, TextEditor, Markdown }));
// An overlay opens in a later frame, so the page is ready once the fixture has had two.
requestAnimationFrame(() => requestAnimationFrame(() => { document.documentElement.dataset.ready = 'true'; }));
`;

for (const engine of browserEngines()) {
  test(`a consumer's rule on each hookOnly hook reaches exactly its elements in ${engine}`, { timeout: 180_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['generated/index.mjs', 'generated/markdown.js', 'generated/text-editor.js'],
      pages: {
        '/hook-only.html': (request) => pageShell({
          attributes: 'data-muxui-color-scheme="light" data-muxui-motion="reduced"',
          head: `<link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/generated/themes.css">${request.searchParams.get('consumer') === 'off' ? '' : '<link rel="stylesheet" href="/test/support/hook-only.css">'}`,
          body: '<div id="root"></div>',
          entry: '/hook-only-entry.mjs',
        }),
      },
      modules: { '/hook-only-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
      const problems = [];
      page.on('pageerror', (error) => problems.push(error.message));
      const open = async (row, consumer) => {
        await page.goto(`${url}/hook-only.html?key=${row.family}.${row.part}${consumer ? '' : '&consumer=off'}`);
        await page.waitForSelector('html[data-ready="true"]', { timeout: 20_000 });
        await page.waitForSelector(selectorOf(row), { state: 'attached', timeout: 10_000 });
      };
      // Where the probe is painted: every element of the page with the probe outline colour. The elements the row's selector names
      // must all be painted; an element no hookOnly selector names (any row's, since the stylesheet holds all twelve) must not be.
      const everySelector = hookOnly.map(selectorOf);
      const measure = (selector) => page.evaluate(({ selector: target, selectors, colour }) => {
        const name = (element) => `${element.localName}${element.className && typeof element.className === 'string' ? `.${element.className.trim().replace(/\s+/gu, '.')}` : ''}`;
        const targets = new Set(document.querySelectorAll(target));
        const named = new Set(selectors.flatMap((each) => [...document.querySelectorAll(each)]));
        const painted = [...document.querySelectorAll('*')].filter((element) => getComputedStyle(element).outlineColor === colour);
        return {
          targets: targets.size,
          unpainted: [...targets].filter((element) => !painted.includes(element)).map(name),
          stray: painted.filter((element) => !named.has(element)).map(name),
        };
      }, { selector, selectors: everySelector, colour: probe });

      for (const row of hookOnly) {
        const selector = selectorOf(row);
        await open(row, true);
        const { targets, unpainted, stray } = await measure(selector);
        assert.ok(targets > 0, `${selector} names an element in the ${row.family} fixture`);
        assert.deepEqual(unpainted, [], `${selector}: the consumer's rule reaches every element of the selector`);
        assert.deepEqual(stray, [], `${selector}: the probe colour reaches no element that no hookOnly selector names`);
      }
      // Control: without the consumer's stylesheet nothing in any row's fixture paints the probe, so the colour is not one Mux paints.
      for (const row of hookOnly) {
        await open(row, false);
        const baseline = await measure(selectorOf(row));
        assert.deepEqual(baseline.stray, [], `${selectorOf(row)}: no element paints the probe without the consumer stylesheet`);
        assert.equal(baseline.unpainted.length, baseline.targets, `${selectorOf(row)}: no element of the selector paints the probe without the consumer stylesheet`);
      }
      assert.deepEqual(problems, []);
    } finally {
      await browser?.close();
      await close();
    }
  });
}
