import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { awaitFontsAndFrames, launchBrowser, pageShell, startServer } from './harness.mjs';

function indicatorPaint(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      opacity: style.opacity,
    };
  });
}

async function settledIndicatorPaint(locator) {
  await locator.evaluate(async (element) => {
    await Promise.all([...element.getAnimations()].map((animation) => animation.finished.catch(() => undefined)));
  });
  return indicatorPaint(locator);
}

async function resolvedTokenPaint(page, token) {
  return page.evaluate((tokenName) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${tokenName})`;
    probe.style.borderColor = `var(${tokenName})`;
    probe.style.position = 'absolute';
    probe.style.inlineSize = '1px';
    probe.style.blockSize = '1px';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const paint = { backgroundColor: style.backgroundColor, borderColor: style.borderColor };
    probe.remove();
    return paint;
  }, token);
}

async function resolvedHoverOverlay(page) {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.backgroundImage = 'linear-gradient(color-mix(in srgb, var(--muxui-semantic-surface-strong) 8%, transparent), color-mix(in srgb, var(--muxui-semantic-surface-strong) 8%, transparent))';
    document.body.append(probe);
    const backgroundImage = getComputedStyle(probe).backgroundImage;
    probe.remove();
    return backgroundImage;
  });
}

function assertPaintMatchesToken(paint, tokens, label) {
  assert.equal(paint.backgroundColor, tokens.backgroundColor, `${label} background`);
  assert.equal(paint.borderColor, tokens.borderColor, `${label} border`);
}

function assertNoFocusPaint(paint, label) {
  assert.equal(paint.boxShadow, 'none', `${label} pointer focus shadow`);
  assert.ok(paint.outlineStyle === 'none' || paint.outlineWidth === '0px', `${label} pointer focus outline`);
}

function assertKeyboardFocusPaint(paint, label) {
  assert.notEqual(paint.boxShadow, 'none', `${label} keyboard focus shadow`);
}

test('Checkbox and CheckboxField share pointer and keyboard focus modality in light, dark, and forced colors', { timeout: 120_000 }, async () => {
  const entry = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { Checkbox } from '/src/components.ts';
    import { CheckboxField } from '/src/supplemental/checkbox-field.ts';
    import '/generated/styles.css';
    const h = React.createElement;
    function App() {
      return h('main', { 'data-checkbox-focus-fixture': true },
        h('button', { type: 'button', 'data-focus-start': true }, 'Start'),
        h(Checkbox, { 'data-testid': 'core', defaultChecked: false }, 'Core'),
        h(CheckboxField.Root, { 'data-testid': 'field', defaultChecked: false },
          h(CheckboxField.Button, null, h(CheckboxField.Indicator, null), h('span', null, 'Field'))),
        h(Checkbox, { 'data-testid': 'core-indeterminate', indeterminate: true }, 'Core indeterminate'),
        h(CheckboxField.Root, { 'data-testid': 'field-indeterminate', indeterminate: true },
          h(CheckboxField.Button, null, h(CheckboxField.Indicator, null), h('span', null, 'Field indeterminate'))),
        h(Checkbox, { 'data-testid': 'core-invalid', invalid: true }, 'Core invalid'),
        h(CheckboxField.Root, { 'data-testid': 'field-invalid', invalid: true },
          h(CheckboxField.Button, null, h(CheckboxField.Indicator, null), h('span', null, 'Field invalid'))),
        h(Checkbox, { 'data-testid': 'core-disabled', defaultChecked: true, disabled: true }, 'Core disabled'),
        h(CheckboxField.Root, { 'data-testid': 'field-disabled', defaultChecked: true, disabled: true },
          h(CheckboxField.Button, null, h(CheckboxField.Indicator, null), h('span', null, 'Field disabled'))));
    }
    createRoot(document.getElementById('root')).render(h(App));`;
  const html = pageShell({ head: `<style>
    html, body { min-height: 100%; margin: 0; }
    body { padding: 48px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong); }
    main { display: grid; gap: 12px; }
  </style>`, body: '<div id="root"></div>', entry: '/checkbox-focus-states-entry.mjs' });
  const { url, close } = await startServer({
    entries: ['src/components.ts', 'src/supplemental/checkbox-field.ts'],
    pages: { '/checkbox-focus.html': html },
    modules: { '/checkbox-focus-states-entry.mjs': entry },
  });
  let browser;
  const evidenceDir = process.env.MUXUI_CHECKBOX_FOCUS_EVIDENCE_DIR ?? '/tmp/muxui-checkbox-focus-evidence';
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/checkbox-focus.html`, { waitUntil: 'load' });
    try {
      await page.locator('[data-checkbox-focus-fixture]').waitFor();
    } catch (error) {
      throw new Error(`${error.message}\n${errors.join('\n')}`);
    }
    await awaitFontsAndFrames(page);
    const core = page.locator('[data-testid="core"]');
    const coreIndicator = core.locator('.muxui-checkbox__indicator');
    const field = page.locator('[data-testid="field"]');
    const fieldButton = field.locator('.muxui-checkbox-field__button');
    const fieldIndicator = field.locator('.muxui-checkbox-field__indicator');
    const coreIndeterminate = page.locator('[data-testid="core-indeterminate"]');
    const coreIndeterminateIndicator = coreIndeterminate.locator('.muxui-checkbox__indicator');
    const fieldIndeterminate = page.locator('[data-testid="field-indeterminate"]');
    const fieldIndeterminateIndicator = fieldIndeterminate.locator('.muxui-checkbox-field__indicator');
    const coreInvalid = page.locator('[data-testid="core-invalid"]');
    const coreInvalidIndicator = coreInvalid.locator('.muxui-checkbox__indicator');
    const fieldInvalid = page.locator('[data-testid="field-invalid"]');
    const fieldInvalidIndicator = fieldInvalid.locator('.muxui-checkbox-field__indicator');
    const coreDisabled = page.locator('[data-testid="core-disabled"]');
    const fieldDisabledButton = page.locator('[data-testid="field-disabled"] .muxui-checkbox-field__button');
    await coreIndicator.waitFor();
    await fieldIndicator.waitFor();
    await mkdir(evidenceDir, { recursive: true });

    for (const mode of ['light', 'dark']) {
      await page.reload({ waitUntil: 'load' });
      await page.locator('[data-checkbox-focus-fixture]').waitFor();
      await awaitFontsAndFrames(page);
      await page.emulateMedia({ forcedColors: 'none', colorScheme: mode });
      await page.evaluate((scheme) => {
        document.documentElement.setAttribute('data-muxui-color-scheme', scheme);
        document.documentElement.style.setProperty('--muxui-semantic-motion-interaction-duration', '0ms');
        document.documentElement.style.setProperty('--muxui-semantic-motion-interaction-transition-duration', '0ms');
        document.documentElement.style.setProperty('--muxui-semantic-motion-state-duration', '0ms');
        document.documentElement.style.setProperty('--muxui-semantic-motion-state-transition-duration', '0ms');
      }, mode);
      await page.locator('[data-focus-start]').click();

      // Each state paints one mode-aware token in both schemes.
      const expectedTokens = {
        selected: '--muxui-component-checkbox-selected-background',
        selectedHover: '--muxui-semantic-color-color-50',
        unchecked: ['--muxui-component-checkbox-indicator-background', '--muxui-component-checkbox-indicator-border'],
        uncheckedHover: ['--muxui-component-checkbox-indicator-background', '--muxui-component-checkbox-indicator-border-hover'],
        invalid: ['--muxui-component-checkbox-indicator-background', '--muxui-semantic-feedback-invalid-border'],
      };
      const expectedSelected = await resolvedTokenPaint(page, expectedTokens.selected);
      const expectedSelectedHover = await resolvedTokenPaint(page, expectedTokens.selectedHover);
      const expectedUnchecked = {
        backgroundColor: (await resolvedTokenPaint(page, expectedTokens.unchecked[0])).backgroundColor,
        borderColor: (await resolvedTokenPaint(page, expectedTokens.unchecked[1])).borderColor,
      };
      const expectedUncheckedHover = {
        backgroundColor: (await resolvedTokenPaint(page, expectedTokens.uncheckedHover[0])).backgroundColor,
        borderColor: (await resolvedTokenPaint(page, expectedTokens.uncheckedHover[1])).borderColor,
      };
      const expectedUncheckedHoverImage = await resolvedHoverOverlay(page);
      const expectedInvalid = {
        backgroundColor: (await resolvedTokenPaint(page, expectedTokens.invalid[0])).backgroundColor,
        borderColor: (await resolvedTokenPaint(page, expectedTokens.invalid[1])).borderColor,
      };

      await core.click();
      await page.mouse.move(0, 0);
      const coreSelected = await settledIndicatorPaint(coreIndicator);
      assertNoFocusPaint(coreSelected, `${mode} core checked`);
      await fieldButton.click();
      await page.mouse.move(0, 0);
      const fieldSelected = await settledIndicatorPaint(fieldIndicator);
      assertNoFocusPaint(fieldSelected, `${mode} field checked`);
      assert.deepEqual(
        { backgroundColor: fieldSelected.backgroundColor, borderColor: fieldSelected.borderColor },
        { backgroundColor: coreSelected.backgroundColor, borderColor: coreSelected.borderColor },
        `${mode} selected indicator paint`,
      );
      assertPaintMatchesToken(coreSelected, expectedSelected, `${mode} selected token`);
      await core.hover();
      const coreSelectedHover = await settledIndicatorPaint(coreIndicator);
      await fieldButton.hover();
      const fieldSelectedHover = await settledIndicatorPaint(fieldIndicator);
      assert.deepEqual(
        { backgroundColor: fieldSelectedHover.backgroundColor, borderColor: fieldSelectedHover.borderColor },
        { backgroundColor: coreSelectedHover.backgroundColor, borderColor: coreSelectedHover.borderColor },
        `${mode} selected hover indicator paint`,
      );
      assertPaintMatchesToken(coreSelectedHover, expectedSelectedHover, `${mode} selected hover token`);

      await core.click();
      await page.mouse.move(0, 0);
      const coreUnchecked = await settledIndicatorPaint(coreIndicator);
      assertNoFocusPaint(coreUnchecked, `${mode} core unchecked`);
      await fieldButton.click();
      await page.mouse.move(0, 0);
      const fieldUnchecked = await settledIndicatorPaint(fieldIndicator);
      assertNoFocusPaint(fieldUnchecked, `${mode} field unchecked`);
      assert.deepEqual(
        { backgroundColor: fieldUnchecked.backgroundColor, borderColor: fieldUnchecked.borderColor },
        { backgroundColor: coreUnchecked.backgroundColor, borderColor: coreUnchecked.borderColor },
        `${mode} unchecked indicator paint`,
      );
      assertPaintMatchesToken(coreUnchecked, expectedUnchecked, `${mode} unchecked token`);
      await core.hover();
      const coreUncheckedHover = await settledIndicatorPaint(coreIndicator);
      await fieldButton.hover();
      const fieldUncheckedHover = await settledIndicatorPaint(fieldIndicator);
      assert.deepEqual(
        { backgroundColor: fieldUncheckedHover.backgroundColor, backgroundImage: fieldUncheckedHover.backgroundImage, borderColor: fieldUncheckedHover.borderColor },
        { backgroundColor: coreUncheckedHover.backgroundColor, backgroundImage: coreUncheckedHover.backgroundImage, borderColor: coreUncheckedHover.borderColor },
        `${mode} unchecked hover indicator paint`,
      );
      assertPaintMatchesToken(coreUncheckedHover, expectedUncheckedHover, `${mode} unchecked hover token`);
      assert.equal(coreUncheckedHover.backgroundImage, expectedUncheckedHoverImage, `${mode} unchecked hover overlay token`);

      const coreIndeterminatePaint = await settledIndicatorPaint(coreIndeterminateIndicator);
      const fieldIndeterminatePaint = await settledIndicatorPaint(fieldIndeterminateIndicator);
      assert.deepEqual(
        { backgroundColor: fieldIndeterminatePaint.backgroundColor, borderColor: fieldIndeterminatePaint.borderColor },
        { backgroundColor: coreIndeterminatePaint.backgroundColor, borderColor: coreIndeterminatePaint.borderColor },
        `${mode} indeterminate indicator paint`,
      );
      assertPaintMatchesToken(coreIndeterminatePaint, expectedSelected, `${mode} indeterminate token`);

      const coreInvalidPaint = await settledIndicatorPaint(coreInvalidIndicator);
      const fieldInvalidPaint = await settledIndicatorPaint(fieldInvalidIndicator);
      assert.deepEqual(
        { backgroundColor: fieldInvalidPaint.backgroundColor, borderColor: fieldInvalidPaint.borderColor },
        { backgroundColor: coreInvalidPaint.backgroundColor, borderColor: coreInvalidPaint.borderColor },
        `${mode} invalid indicator paint`,
      );
      assertPaintMatchesToken(coreInvalidPaint, expectedInvalid, `${mode} invalid token`);

      await page.locator('[data-focus-start]').focus();
      await page.keyboard.press('Tab');
      assert.equal(await core.evaluate((element) => element.contains(document.activeElement)), true, `${mode} core receives keyboard focus`);
      await page.keyboard.press('Space');
      const coreKeyboard = await settledIndicatorPaint(coreIndicator);
      assertKeyboardFocusPaint(coreKeyboard, `${mode} core checked`);
      await page.keyboard.press('Tab');
      assert.equal(await field.evaluate((element) => element.contains(document.activeElement)), true, `${mode} field receives keyboard focus`);
      await page.keyboard.press('Space');
      const fieldKeyboard = await settledIndicatorPaint(fieldIndicator);
      assertKeyboardFocusPaint(fieldKeyboard, `${mode} field checked`);
      assert.equal(fieldKeyboard.boxShadow, coreKeyboard.boxShadow, `${mode} shared keyboard focus shadow`);
      await page.screenshot({ path: join(evidenceDir, `checkbox-focus-${mode}.png`), fullPage: true });
    }

    await page.emulateMedia({ forcedColors: 'active' });
    await page.evaluate(() => document.documentElement.setAttribute('data-muxui-color-scheme', 'light'));
    assert.equal((await indicatorPaint(coreDisabled)).opacity, '1', 'forced-colors core disabled opacity');
    assert.equal((await indicatorPaint(fieldDisabledButton)).opacity, '1', 'forced-colors field disabled opacity');
    await page.locator('[data-focus-start]').focus();
    await page.keyboard.press('Tab');
    const forcedCore = await indicatorPaint(coreIndicator);
    assert.equal(forcedCore.boxShadow, 'none', 'forced-colors core shadow');
    assert.notEqual(forcedCore.outlineStyle, 'none', 'forced-colors core focus outline');
    assert.notEqual(forcedCore.outlineWidth, '0px', 'forced-colors core focus outline width');
    await page.keyboard.press('Tab');
    const forcedField = await indicatorPaint(fieldIndicator);
    assert.equal(forcedField.boxShadow, 'none', 'forced-colors field shadow');
    assert.notEqual(forcedField.outlineStyle, 'none', 'forced-colors field focus outline');
    assert.notEqual(forcedField.outlineWidth, '0px', 'forced-colors field focus outline width');
    assert.equal(forcedField.outlineStyle, forcedCore.outlineStyle, 'forced-colors shared focus outline style');
    assert.equal(forcedField.outlineWidth, forcedCore.outlineWidth, 'forced-colors shared focus outline width');
    assert.equal(forcedField.borderColor, forcedCore.borderColor, 'forced-colors shared indicator border');
    assert.equal(forcedField.backgroundColor, forcedCore.backgroundColor, 'forced-colors shared indicator background');
    await page.screenshot({ path: join(evidenceDir, 'checkbox-focus-forced-colors.png'), fullPage: true });
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});

test('Checkbox, CheckboxField, Switch, SwitchField, RadioGroup, and RadioField paint the invalid edge in every state and scheme', { timeout: 180_000 }, async () => {
  const entry = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { Checkbox } from '/src/components.ts';
    import { RadioGroup } from '/src/collections.mjs';
    import { Switch } from '/src/fields.ts';
    import { CheckboxField } from '/src/supplemental/checkbox-field.ts';
    import { RadioField } from '/src/supplemental/radio-field.ts';
    import { SwitchField } from '/src/supplemental/switch-field.ts';
    import '/generated/styles.css';
    const h = React.createElement;
    const field = (testId, props) => h(CheckboxField.Root, { 'data-testid': testId, invalid: true, ...props },
      h(CheckboxField.Button, null, h(CheckboxField.Indicator, null), h('span', null, 'Field')));
    const switchField = (testId, props) => h(SwitchField.Root, { 'data-testid': testId, invalid: true, ...props },
      h(SwitchField.Button, null, h(SwitchField.Thumb), 'Switch field'));
    const radioField = (value) => h(RadioField.Root, { value, invalid: true },
      h(RadioField.Button, null, h(RadioField.Indicator, null, h(RadioField.Dot)), value));
    function App() {
      return h('main', { 'data-invalid-fixture': true },
        h(Checkbox, { 'data-testid': 'core-selected', defaultChecked: true, invalid: true }, 'Core selected'),
        h(Checkbox, { 'data-testid': 'core-unchecked', invalid: true }, 'Core unchecked'),
        h(Checkbox, { 'data-testid': 'core-indeterminate', indeterminate: true, invalid: true }, 'Core indeterminate'),
        field('field-selected', { defaultChecked: true }),
        field('field-unchecked', {}),
        field('field-indeterminate', { indeterminate: true }),
        h(Switch, { 'data-testid': 'switch-selected', label: 'Switch selected', defaultSelected: true, invalid: true }),
        h(Switch, { 'data-testid': 'switch-unchecked', label: 'Switch unchecked', invalid: true }),
        switchField('switch-field-selected', { defaultChecked: true }),
        switchField('switch-field-unchecked', {}),
        h('div', { 'data-testid': 'radio' }, h(RadioGroup, { 'aria-label': 'Radio', invalid: true, defaultValue: 'selected', options: [{ value: 'selected' }, { value: 'unchecked' }] })),
        h('div', { 'data-testid': 'radio-field' }, h(RadioGroup, { 'aria-label': 'Radio field', invalid: true, defaultValue: 'selected' }, radioField('selected'), radioField('unchecked'))));
    }
    createRoot(document.getElementById('root')).render(h(App));`;
  const html = pageShell({ head: `<style>
    *, *::before, *::after { transition: none !important; }
    body { margin: 0; padding: 48px; }
    main { display: grid; gap: 12px; justify-items: start; }
  </style>`, body: '<div id="root"></div>', entry: '/checkbox-invalid-states-entry.mjs' });
  const { url, close } = await startServer({
    entries: ['src/components.ts', 'src/collections.mjs', 'src/fields.ts', 'src/supplemental/checkbox-field.ts', 'src/supplemental/radio-field.ts', 'src/supplemental/switch-field.ts'],
    pages: { '/checkbox-invalid.html': html },
    modules: { '/checkbox-invalid-states-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/checkbox-invalid.html`, { waitUntil: 'load' });
    await page.locator('[data-invalid-fixture]').waitFor();
    await awaitFontsAndFrames(page);
    // Each part is [hovered host, painted descendant]; a null descendant paints the host's ::before.
    // The Switch root forwards its test id to the outer field wrapper.
    const parts = {
      'core-selected': ['[data-testid="core-selected"]', '.muxui-checkbox__indicator'],
      'core-unchecked': ['[data-testid="core-unchecked"]', '.muxui-checkbox__indicator'],
      'core-indeterminate': ['[data-testid="core-indeterminate"]', '.muxui-checkbox__indicator'],
      'field-selected': ['[data-testid="field-selected"] .muxui-checkbox-field__button', '.muxui-checkbox-field__indicator'],
      'field-unchecked': ['[data-testid="field-unchecked"] .muxui-checkbox-field__button', '.muxui-checkbox-field__indicator'],
      'field-indeterminate': ['[data-testid="field-indeterminate"] .muxui-checkbox-field__button', '.muxui-checkbox-field__indicator'],
      'switch-selected': ['[data-testid="switch-selected"] .muxui-switch, [data-testid="switch-selected"].muxui-switch', null],
      'switch-unchecked': ['[data-testid="switch-unchecked"] .muxui-switch, [data-testid="switch-unchecked"].muxui-switch', null],
      'switch-field-selected': ['[data-testid="switch-field-selected"] .muxui-switch-field__button', null],
      'switch-field-unchecked': ['[data-testid="switch-field-unchecked"] .muxui-switch-field__button', null],
      'radio-selected': ['[data-testid="radio"] .muxui-radio-group__radio[data-muxui-state-selected]', '.muxui-radio-group__indicator'],
      'radio-unchecked': ['[data-testid="radio"] .muxui-radio-group__radio:not([data-muxui-state-selected])', '.muxui-radio-group__indicator'],
      'radio-field-selected': ['[data-testid="radio-field"] .muxui-radio-field__button[data-muxui-state-selected]', '.muxui-radio-field__indicator'],
      'radio-field-unchecked': ['[data-testid="radio-field"] .muxui-radio-field__button:not([data-muxui-state-selected])', '.muxui-radio-field__indicator'],
    };
    const host = (name) => page.locator(parts[name][0]).first();
    const paint = (name) => host(name).evaluate((element, part) => {
      const node = part ? element.querySelector(part) : element;
      const style = getComputedStyle(node, part ? null : '::before');
      const glyph = part ? node.querySelector('svg') : null;
      return {
        hovered: element.hasAttribute('data-muxui-state-hovered'),
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        glyph: glyph ? getComputedStyle(glyph).color : null,
      };
    }, parts[name][1]);
    const token = (name) => resolvedTokenPaint(page, name).then(({ backgroundColor }) => backgroundColor);
    const families = [
      ['checkbox', 'core-selected', 'core-unchecked', 'core-indeterminate'],
      ['checkbox', 'field-selected', 'field-unchecked', 'field-indeterminate'],
      ['switch', 'switch-selected', 'switch-unchecked'],
      ['edge', 'switch-field-selected', 'switch-field-unchecked'],
      ['edge', 'radio-selected', 'radio-unchecked'],
      ['edge', 'radio-field-selected', 'radio-field-unchecked'],
    ];

    // null leaves the document without a scheme attribute, so unscoped rules paint.
    for (const mode of [null, 'light', 'dark']) {
      await page.reload({ waitUntil: 'load' });
      await page.locator('[data-invalid-fixture]').waitFor();
      await awaitFontsAndFrames(page);
      await page.emulateMedia({ forcedColors: 'none', colorScheme: mode ?? 'light' });
      await page.evaluate((scheme) => {
        if (scheme) document.documentElement.setAttribute('data-muxui-color-scheme', scheme);
        else document.documentElement.removeAttribute('data-muxui-color-scheme');
      }, mode);
      await page.mouse.move(0, 0);

      // The invalid edge wins over every selected and hover edge in both schemes.
      // Checkbox and Switch also prove their fills; other families prove the edge only.
      const invalidEdge = await token('--muxui-semantic-feedback-invalid-border');
      const checkboxSelected = { backgroundColor: await token('--muxui-component-checkbox-selected-background'), borderColor: invalidEdge, glyph: await token('--muxui-component-checkbox-selected-foreground') };
      const checkboxUnchecked = { backgroundColor: await token('--muxui-component-checkbox-indicator-background'), borderColor: invalidEdge };
      const expectedPaint = {
        checkbox: {
          rest: checkboxUnchecked,
          selected: checkboxSelected,
          selectedHover: { backgroundColor: await token('--muxui-semantic-color-color-50'), borderColor: invalidEdge, glyph: await token('--muxui-component-checkbox-selected-foreground-hover') },
          uncheckedHover: { ...checkboxUnchecked, glyph: null },
          indeterminate: checkboxSelected,
          indeterminateHover: { borderColor: invalidEdge },
        },
        switch: {
          rest: { backgroundColor: await token('--muxui-semantic-color-neutral-20'), borderColor: invalidEdge },
          selected: { backgroundColor: await token('--muxui-component-switch-selected-track'), borderColor: invalidEdge, glyph: null },
          selectedHover: { backgroundColor: await token('--muxui-component-switch-selected-track-hover'), borderColor: invalidEdge, glyph: null },
          uncheckedHover: { backgroundColor: await token('--muxui-semantic-color-neutral-20'), borderColor: invalidEdge, glyph: null },
        },
        edge: Object.fromEntries(['rest', 'selected', 'selectedHover', 'uncheckedHover'].map((state) => [state, { borderColor: invalidEdge }])),
      };

      // Collect every state first so one failure reports the full set of mismatches.
      const actual = {};
      const expected = {};
      const record = async (family, part, state) => {
        const { hovered, ...observed } = await paint(part);
        const want = expectedPaint[family][state];
        const label = `${mode ?? 'no-scheme'} ${part} ${state}`;
        expected[label] = { hovered: state.endsWith('Hover'), ...want };
        actual[label] = { hovered, ...Object.fromEntries(Object.keys(want).map((key) => [key, observed[key]])) };
      };
      for (const [family, selectedPart, uncheckedPart, indeterminatePart] of families) {
        await record(family, uncheckedPart, 'rest');
        await record(family, selectedPart, 'selected');
        await host(selectedPart).hover();
        await record(family, selectedPart, 'selectedHover');
        await host(uncheckedPart).hover();
        await record(family, uncheckedPart, 'uncheckedHover');
        await page.mouse.move(0, 0);
        if (indeterminatePart) {
          await record(family, indeterminatePart, 'indeterminate');
          await host(indeterminatePart).hover();
          await record(family, indeterminatePart, 'indeterminateHover');
          await page.mouse.move(0, 0);
        }
      }
      assert.deepEqual(actual, expected);
    }
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});

// React Aria marks a required Checkbox invalid when a blocked submit reports it, unless the component tells it the
// Checkbox is controlled-valid. Native validation runs only in a real browser, so this is a browser test: the blocked
// submit must give the plain Checkbox aria-invalid, the invalid state attribute and the invalid edge, as it does
// CheckboxField, ticking it must clear all three, and an explicit invalid must still show.
test('a required Checkbox is marked invalid after a blocked submit and clears once ticked', { timeout: 120_000 }, async () => {
  const entry = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { Checkbox } from '/src/components.ts';
    import { Form } from '/src/fields.ts';
    import '/generated/styles.css';
    const h = React.createElement;
    window.__submits = 0;
    function App() {
      // The explicitly invalid Checkbox sits outside the form: React Aria gives it a custom validity, which would block the submit.
      return h('main', { 'data-required-fixture': true },
        h(Form, { onSubmit: (event) => { event.preventDefault(); window.__submits += 1; } },
          h(Checkbox, { 'data-testid': 'required', name: 'terms', required: true }, 'Accept the terms'),
          h('button', { type: 'submit' }, 'Send')),
        h(Checkbox, { 'data-testid': 'flagged', name: 'flagged', invalid: true }, 'Flagged'));
    }
    createRoot(document.getElementById('root')).render(h(App));`;
  const html = pageShell({ head: '<style>body { margin: 24px; background: var(--muxui-semantic-surface-canvas); }</style>', body: '<div id="root"></div>', entry: '/checkbox-required-entry.mjs' });
  const { url, close } = await startServer({
    entries: ['src/components.ts', 'src/fields.ts'],
    pages: { '/checkbox-required.html': html },
    modules: { '/checkbox-required-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${url}/checkbox-required.html`, { waitUntil: 'load' });
    await page.locator('[data-required-fixture]').waitFor();
    await awaitFontsAndFrames(page);
    const invalidEdge = (await resolvedTokenPaint(page, '--muxui-semantic-feedback-invalid-border')).borderColor;
    const state = (testId) => page.locator(`[data-testid="${testId}"]`).evaluate(async (label) => {
      const indicator = label.querySelector('.muxui-checkbox__indicator');
      await Promise.all(indicator.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
      return {
        ariaInvalid: label.querySelector('input').getAttribute('aria-invalid'),
        invalid: label.getAttribute('data-muxui-state-invalid'),
        edge: getComputedStyle(indicator).borderColor,
      };
    });
    const marked = { ariaInvalid: 'true', invalid: 'true', edge: invalidEdge };

    const before = await state('required');
    assert.deepEqual([before.ariaInvalid, before.invalid], [null, null], 'a required Checkbox starts unmarked');
    assert.notEqual(before.edge, invalidEdge, 'and without the invalid edge');
    assert.deepEqual(await state('flagged'), marked, 'an explicit invalid marks the Checkbox');

    await page.getByRole('button', { name: 'Send' }).click();
    assert.equal(await page.evaluate(() => window.__submits), 0, 'the unticked required Checkbox blocks the submit');
    // React Aria commits the reported validity in an effect after the invalid event, so wait for it before reading.
    await page.locator('[data-testid="required"][data-muxui-state-invalid]').waitFor({ timeout: 5_000 }).catch(() => undefined);
    assert.deepEqual(await state('required'), marked, 'the blocked submit marks it invalid, with its invalid edge');

    await page.locator('[data-testid="required"]').click();
    await page.locator('[data-testid="required"]:not([data-muxui-state-invalid])').waitFor({ timeout: 5_000 }).catch(() => undefined);
    const ticked = await state('required');
    assert.deepEqual([ticked.ariaInvalid, ticked.invalid], [null, null], 'ticking it clears the invalid state');
    assert.notEqual(ticked.edge, invalidEdge, 'and the invalid edge');
    await page.getByRole('button', { name: 'Send' }).click();
    assert.equal(await page.evaluate(() => window.__submits), 1, 'the ticked Checkbox submits');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await close();
  }
});
