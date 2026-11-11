import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Page, errorFields } from './choice-state-fixture.mjs';
import { awaitFontsAndFrames, launchBrowser, pageShell, startServer } from './harness.mjs';

// Choice controls draw their state from the native input until React takes over, and field
// errors and validation follow what the visitor does once it has.

const fixtureModule = '/test/browser/choice-state-fixture.mjs';
const entry = `import React from 'react';
  import { hydrateRoot } from 'react-dom/client';
  import { Page } from '${fixtureModule}';
  import '/generated/styles.css';
  window.__errors = [];
  hydrateRoot(document.getElementById('root'), React.createElement(Page), { onRecoverableError: (error) => window.__errors.push(error.message) });
  requestAnimationFrame(() => document.documentElement.setAttribute('data-hydrated', ''));`;

// Reduced motion settles every transition at once, so a measure after a click is the end state.
const shell = (scheme, script) => pageShell({
  attributes: `lang="en" data-muxui-color-scheme="${scheme}" data-muxui-motion="reduced"`,
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  body: `<div id="root">${renderToString(React.createElement(Page))}</div>`,
  entry: script ? '/choice-entry.mjs' : undefined,
});

// The kinds of single control in the fixture, and the kinds of group (first option selected).
const singles = ['checkbox', 'switch', 'checkbox-field', 'switch-field'];
const groups = ['checkbox-group', 'radio-group', 'radio-field'];

/**
 * What the control at `label` draws: its box (or track) colours, focus shadow and outline, whether its
 * mark (tick, dot, or thumb at the far end) shows, and whether it is `seen`: drawn in a colour other than
 * its box's, which forced colours can take away. Runs in the page.
 */
function paintOf(label) {
  const style = (node, pseudo) => (node ? getComputedStyle(node, pseudo) : null);
  const shown = (node, pseudo) => {
    const value = style(node, pseudo);
    return Boolean(value && value.display !== 'none' && value.visibility !== 'hidden' && Number(value.opacity) > 0
      && value.transform !== 'matrix(0, 0, 0, 0, 0, 0)' && (!pseudo || value.content !== 'none'));
  };
  if (label.matches('.muxui-switch')) {
    const track = style(label, '::before');
    const thumb = label.querySelector('.muxui-switch__indicator');
    return {
      background: track.backgroundColor, border: track.borderColor, shadow: track.boxShadow,
      outline: track.outlineStyle === 'none' ? 'none' : `${track.outlineStyle} ${track.outlineWidth} ${track.outlineColor}`,
      mark: new DOMMatrix(style(thumb).transform).m41 > 4, thumb: style(thumb).backgroundColor, seen: style(thumb).backgroundColor !== track.backgroundColor,
    };
  }
  const box = label.querySelector('.muxui-checkbox__indicator, .muxui-checkbox-field__indicator, .muxui-radio-group__indicator, .muxui-radio-field__indicator');
  const value = style(box);
  // The colour each drawn mark paints in: the tick's stroke, or the background of a masked tick or a dot.
  const colours = [];
  if (box.matches('.muxui-checkbox__indicator, .muxui-checkbox-field__indicator')) {
    const tick = box.querySelector('svg');
    if (tick !== null && shown(tick)) colours.push(style(tick).color);
    if (shown(box, '::after') && style(box, '::after').maskImage !== 'none') colours.push(style(box, '::after').backgroundColor);
  } else {
    // Before hydration the dot is the indicator's ::after or RadioField.Dot; after it, RadioGroup's motion dot may draw it.
    for (const dot of box.querySelectorAll('.muxui-radio-field__dot, .muxui-radio-group__motion-dot')) if (shown(dot)) colours.push(style(dot).backgroundColor);
    if (shown(box, '::after')) colours.push(style(box, '::after').backgroundColor);
  }
  return {
    background: value.backgroundColor, border: value.borderColor, shadow: value.boxShadow,
    outline: value.outlineStyle === 'none' ? 'none' : `${value.outlineStyle} ${value.outlineWidth} ${value.outlineColor}`,
    mark: colours.length > 0, seen: colours.some((colour) => colour !== value.backgroundColor),
  };
}

/**
 * What each control draws, by `<probe>`, or `<probe>/<index>` for a group's options. One evaluation measures them
 * all; transitions are finished first, since a page without scripts runs no frame callbacks.
 */
function paints(page) {
  return page.evaluate(`(() => {
    const paintOf = ${paintOf};
    for (const animation of document.getAnimations()) animation.finish();
    return Object.fromEntries([...document.querySelectorAll('[data-probe]')].flatMap((probe) => {
      const found = [...probe.querySelectorAll('label')];
      return found.map((label, index) => {
        return [found.length === 1 ? probe.dataset.probe : probe.dataset.probe + '/' + index, paintOf(label)];
      });
    }));
  })()`);
}

/** The paint each control should have after it is clicked once: its twin's, or its group neighbour's. */
function expectedAfterClick(before) {
  const expected = {};
  for (const suffix of ['', '-invalid']) {
    for (const kind of singles) {
      expected[`${kind}-off${suffix}`] = before[`${kind}-on${suffix}`];
      expected[`${kind}-on${suffix}`] = before[`${kind}-off${suffix}`];
    }
  }
  return expected;
}

/** Clicks every single control, then the second option of every group, and checks each lands in its other state. */
async function assertClicksFollow(page, label) {
  const before = await paints(page);
  for (const [name, paint] of Object.entries(before)) {
    if (!name.includes('/')) assert.equal(paint.mark, name.includes('-on'), `${label}: ${name} starts ${name.includes('-on') ? 'on' : 'off'}`);
  }
  const expected = expectedAfterClick(before);
  const clicked = [...Object.keys(expected), ...['', '-invalid'].flatMap((suffix) => groups.map((kind) => `${kind}${suffix}/1`))];
  for (const name of clicked) {
    const [probe, index = 0] = name.split('/');
    await page.locator(`[data-probe="${probe}"] label >> nth=${index}`).click();
  }
  const after = await paints(page);
  for (const [name, paint] of Object.entries(expected)) assert.deepEqual(after[name], paint, `${label}: ${name} after a click`);
  for (const suffix of ['', '-invalid']) {
    for (const kind of groups) {
      const [first, second] = [`${kind}${suffix}/0`, `${kind}${suffix}/1`];
      // A checkbox group's options are independent; a radio group moves its selection.
      if (kind === 'checkbox-group') assert.deepEqual(after[second], before[first], `${label}: ${second} after a click`);
      else assert.deepEqual([after[first], after[second]], [before[second], before[first]], `${label}: ${kind}${suffix} after a click`);
    }
  }
  return { before, after };
}

test('choice controls follow the native input before hydration and validate and link errors after it', { timeout: 180_000 }, async (t) => {
  const { url, close } = await startServer({
    entries: [fixtureModule.slice(1)],
    pages: { '/light.html': shell('light', true), '/dark.html': shell('dark', true) },
    modules: { '/choice-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const open = async (path, javaScriptEnabled, forced = false) => {
      const context = await browser.newContext({ javaScriptEnabled, forcedColors: forced ? 'active' : 'none', viewport: { width: 1000, height: 900 } });
      // An action that cannot happen fails in seconds, not at the file's timeout.
      context.setDefaultTimeout(10_000);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${url}${path}`, { waitUntil: 'load' });
      await page.locator('#controls').waitFor();
      // A page without scripts runs no frame callbacks; its fixture loads no web fonts.
      if (javaScriptEnabled) {
        await page.locator('html[data-hydrated]').waitFor({ state: 'attached' });
        await awaitFontsAndFrames(page);
      }
      return { page, errors, close: () => context.close() };
    };

    // In forced colours a box, tick, dot and thumb take system colours unless a rule keeps them apart, so every
    // checkbox and radio that is on must show a mark of another colour than its box, and every switch its thumb
    // against its track: on or off, the thumb's place is the state. A disabled switch draws its thumb in GrayText.
    const assertMarksSeen = async (page, paints, label) => {
      const grayText = await page.evaluate(() => {
        const probe = document.body.appendChild(document.createElement('span'));
        probe.style.color = 'GrayText';
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
      });
      for (const [name, paint] of Object.entries(paints)) {
        if (name.startsWith('switch')) {
          assert.ok(paint.seen, `${label}: ${name} shows its thumb`);
          assert.equal(paint.thumb === grayText, name.includes('-disabled-'), `${label}: ${name} thumb is GrayText only while disabled`);
        } else if (paint.mark) assert.ok(paint.seen, `${label}: ${name} shows its mark`);
      }
      for (const kind of ['switch', 'switch-field']) {
        for (const state of ['', '-invalid']) {
          const [off, on] = [paints[`${kind}-off${state}`], paints[`${kind}-on${state}`]];
          assert.notDeepEqual(off, on, `${label}: ${kind}${state} on and off differ`);
        }
        assert.notDeepEqual(paints[`${kind}-disabled-off`], paints[`${kind}-disabled-on`], `${label}: ${kind} disabled on and off differ`);
      }
    };
    const results = {};
    for (const [mode, scheme, forced] of [['light', 'light', false], ['dark', 'dark', false], ['forced colours', 'light', true]]) {
      await t.test(`${mode}: without JavaScript a click draws the state the input is in`, async () => {
        const { page, close: done } = await open(`/${scheme}.html`, false, forced);
        results[mode] = await assertClicksFollow(page, `${mode}, no script`);
        if (forced) {
          await assertMarksSeen(page, results[mode].before, `${mode}, no script, as served`);
          await assertMarksSeen(page, results[mode].after, `${mode}, no script, clicked`);
        }
        await done();
      });

      await t.test(`${mode}: after hydration the controls look as they did and as the native rules drew them`, async () => {
        const { page, errors, close: done } = await open(`/${scheme}.html`, true, forced);
        const { before, after } = await assertClicksFollow(page, `${mode}, hydrated`);
        if (forced) {
          await assertMarksSeen(page, before, `${mode}, hydrated, as served`);
          await assertMarksSeen(page, after, `${mode}, hydrated, clicked`);
        }
        // Hydration changes nothing the server drew, and React's state draws what the native input did.
        assert.deepEqual(before, results[mode].before);
        assert.deepEqual(after, results[mode].after);
        assert.deepEqual(await page.evaluate(() => window.__errors), []);
        assert.deepEqual(errors, [], errors.join('\n'));
        await done();
      });
    }

    for (const forced of [false, true]) {
      await t.test(`keyboard focus draws the hydrated focus ring before hydration${forced ? ', in forced colours' : ''}`, async () => {
        const rings = {};
        for (const javaScriptEnabled of [false, true]) {
          const { page, close: done } = await open('/light.html', javaScriptEnabled, forced);
          const seen = {};
          const ring = async (name) => {
            const { shadow, outline } = (await paints(page))[name];
            return { shadow, outline };
          };
          await page.mouse.click(1, 1);
          // Tab through the first row: Checkbox, Switch, CheckboxField, SwitchField.
          for (const name of ['checkbox-off', 'switch-off', 'checkbox-field-off', 'switch-field-off']) {
            await page.keyboard.press('Tab');
            seen[name] = await ring(name);
          }
          // Focus moved by script after a key press is keyboard focus for the browser and for React Aria.
          for (const name of ['radio-group/0', 'radio-field/0']) {
            const [probe, index] = name.split('/');
            await page.evaluate(([group, nth]) => document.querySelectorAll(`[data-probe="${group}"] input`)[Number(nth)].focus(), [probe, index]);
            seen[name] = await ring(name);
          }
          rings[javaScriptEnabled ? 'hydrated' : 'native'] = seen;
          await done();
        }
        // Every control draws a ring: a box shadow, or in forced colours, which drop shadows, an outline.
        const drawn = Object.entries(rings.hydrated).filter(([, { shadow, outline }]) => (forced ? outline : shadow) !== 'none').map(([name]) => name);
        assert.deepEqual(drawn, Object.keys(rings.hydrated));
        assert.deepEqual(rings.native, rings.hydrated);
      });
    }

    await t.test('a required box clears its invalid state and error when it is ticked', async () => {
      const { page, errors, close: done } = await open('/light.html', true);
      // The plain Checkbox is left out: it passes isInvalid false to React Aria, so a blocked submit never marks it.
      const kinds = ['switch', 'checkbox-field', 'switch-field'];
      const invalid = () => page.evaluate((names) => names.map((name) => document.querySelector(`[data-probe="required-${name}"] input`).getAttribute('aria-invalid')), kinds);
      // React Aria commits validation in the render after the event, with nothing else to set it off.
      const settled = (marked) => page.waitForFunction(([names, want]) => names.every((name) => document.querySelector(`[data-probe="required-${name}"] input`).hasAttribute('aria-invalid') === want), [kinds, marked]);
      const shownErrors = () => page.locator('#required [slot="errorMessage"]').allTextContents();
      await page.locator('#required-submit').click();
      await settled(true);
      assert.deepEqual(await invalid(), ['true', 'true', 'true']);
      // The plain Switch shows the browser's own message, in the browser's language.
      const shownAtSubmit = await shownErrors();
      assert.deepEqual([shownAtSubmit.length, ...shownAtSubmit.slice(1)], [3, 'Tick this box.', 'Turn this on.']);
      // A pointer press on the first two, the keyboard on the last.
      await page.locator('[data-probe="required-switch"] label').click();
      await page.locator('[data-probe="required-checkbox-field"] label').click();
      await page.locator('[data-probe="required-switch-field"] input').focus();
      await page.keyboard.press('Space');
      await settled(false);
      assert.deepEqual(await invalid(), [null, null, null]);
      assert.deepEqual(await shownErrors(), []);
      assert.deepEqual(errors, [], errors.join('\n'));
      await done();
    });

    await t.test('an error that appears after hydration describes its control', async () => {
      const { page, errors, close: done } = await open('/light.html', true);
      const links = () => page.evaluate((fields) => Object.fromEntries(Object.entries(fields).map(([name, { control, error }]) => {
        const section = document.getElementById(`late-${name}`);
        const shown = section.querySelector(error);
        const ids = section.querySelector(control)?.getAttribute('aria-describedby')?.split(/\s+/u) ?? [];
        return [name, shown ? Boolean(shown.id) && ids.includes(shown.id) : 'absent'];
      })), Object.fromEntries(Object.entries(errorFields).map(([name, { control, error }]) => [name, { control, error }])));
      assert.ok(Object.values(await links()).every((link) => link === 'absent'));
      await page.evaluate(() => window.__showErrors(true));
      assert.deepEqual(await links(), Object.fromEntries(Object.keys(errorFields).map((name) => [name, true])));
      await page.evaluate(() => window.__showErrors(false));
      await page.evaluate(() => window.__showErrors(true));
      assert.deepEqual(await links(), Object.fromEntries(Object.keys(errorFields).map((name) => [name, true])));
      assert.deepEqual(errors, [], errors.join('\n'));
      await done();
    });
  } finally {
    await browser?.close();
    await close();
  }
});
