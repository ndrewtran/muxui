import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { Button, Checkbox, FileTrigger, IconButton } from '../../generated/index.mjs';
import { CheckboxField } from '../../generated/supplemental.mjs';
import { MUXUI_THEME_PRESETS } from '../../generated/themes.mjs';
import { launchBrowser } from './harness.mjs';

const packageRoot = resolve(import.meta.dirname, '../..');

function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const channels = color.match(/[\d.]+/gu)?.slice(0, 3).map(Number);
    assert.ok(channels?.length === 3, `expected a computed RGB color, got ${color}`);
    const linear = channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function waitForTokenProperty(page, selector, property, token) {
  await page.waitForFunction(({ targetSelector, propertyName, tokenName }) => {
    const target = document.querySelector(targetSelector);
    if (!target) return false;
    const probe = document.createElement('span');
    probe.style.setProperty(propertyName, `var(--muxui-${tokenName.replaceAll('.', '-')})`);
    document.body.append(probe);
    const expected = getComputedStyle(probe).getPropertyValue(propertyName);
    probe.remove();
    return getComputedStyle(target).getPropertyValue(propertyName) === expected;
  }, { targetSelector: selector, propertyName: property, tokenName: token });
}

test('calendar, field and collection hooks respond independently to gap and inset overrides', { timeout: 30_000 }, async () => {
  const base = await readFile(resolve(packageRoot, 'src/styles/base.css'), 'utf8');
  const css = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');
  const calendarRule = base.match(/\.muxui-calendar,\s*\.muxui-range-calendar\s*\{([^}]+)\}/u)?.[1];
  assert.ok(calendarRule);
  const calendarInset = calendarRule.match(/padding:\s*var\((--muxui-semantic-[\w-]+)\)/u)?.[1];
  const calendarGap = calendarRule.match(/gap:\s*var\((--muxui-semantic-[\w-]+)\)/u)?.[1];
  assert.match(calendarInset, /inset/u);
  assert.match(calendarGap, /gap/u);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // These are the renderer's public styling hooks; DOM/interaction contracts are
    // covered by the component tests. Keep this fixture focused on CSS inheritance.
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>
      <div class="muxui-calendar">Calendar</div><div class="muxui-range-calendar">Range calendar</div>
      <input class="muxui-input" aria-label="Name"><div class="muxui-list-box-item">Item</div>
    </body></html>`);
    const observe = () => page.evaluate(() => Object.fromEntries(['.muxui-calendar', '.muxui-range-calendar', '.muxui-input', '.muxui-list-box-item'].map((selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return [selector, { padding: style.padding, gap: style.gap, color: style.color, radius: style.borderRadius }];
    })));
    const override = (variable, value) => page.evaluate(([name, next]) => document.documentElement.style.setProperty(name, next), [variable, value]);
    for (const mode of ['light', 'dark']) {
      await page.evaluate((scheme) => {
        document.documentElement.removeAttribute('style');
        document.documentElement.setAttribute('data-muxui-color-scheme', scheme);
      }, mode);
      const initial = await observe();
      for (const name of ['--muxui-semantic-layout-section-gap', '--muxui-semantic-layout-control-gap', '--muxui-semantic-layout-group-gap']) await override(name, '41px');
      const gapsChanged = await observe();
      for (const selector of Object.keys(initial)) assert.equal(gapsChanged[selector].padding, initial[selector].padding, `${mode}: gaps must not change ${selector} padding`);
      await override(calendarInset, '23px');
      const insetChanged = await observe();
      for (const selector of ['.muxui-calendar', '.muxui-range-calendar']) {
        assert.equal(insetChanged[selector].padding, '23px');
        assert.equal(insetChanged[selector].gap, gapsChanged[selector].gap);
        assert.equal(insetChanged[selector].color, initial[selector].color);
        assert.equal(insetChanged[selector].radius, initial[selector].radius);
      }
      await override(calendarGap, '17px');
      const final = await observe();
      for (const selector of ['.muxui-calendar', '.muxui-range-calendar']) {
        assert.equal(final[selector].gap, '17px');
        assert.equal(final[selector].padding, '23px');
      }
    }
  } finally {
    await browser.close();
  }
});

test('generated aliases rebind through combined and nested mode scopes', { timeout: 30_000 }, async () => {
  const css = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>
      <section id="default-scope">
        <div id="default-calendar" class="muxui-calendar">Calendar</div>
        <button id="default-button" class="muxui-button">Button</button>
        <div id="default-title" class="muxui-text--title-lg">Title</div>
      </section>
      <section id="combined-scope" data-muxui-color-scheme="dark" data-muxui-density="compact" data-muxui-responsive>
        <div id="combined-calendar" class="muxui-calendar">Calendar</div>
        <button id="combined-button" class="muxui-button">Button</button>
        <div id="combined-title" class="muxui-text--title-lg">Title</div>
        <section id="nested-scope" data-muxui-color-scheme="light" data-muxui-density="comfortable" data-muxui-responsive>
          <div id="nested-calendar" class="muxui-calendar">Calendar</div>
          <button id="nested-button" class="muxui-button">Button</button>
          <div id="nested-title" class="muxui-text--title-lg">Title</div>
        </section>
      </section>
    </body></html>`);
    const observe = (ids) => page.evaluate((elementIds) => Object.fromEntries(elementIds.map((id) => {
      const style = getComputedStyle(document.getElementById(id));
      return [id, {
        padding: style.padding,
        paddingInline: style.paddingLeft,
        background: style.backgroundColor,
        fontSize: style.fontSize,
      }];
    })), ids);

    const baseline = await observe(['default-calendar', 'default-button', 'default-title']);
    assert.equal(baseline['default-calendar'].paddingInline, '14px');
    assert.equal(baseline['default-button'].paddingInline, '14px');
    assert.equal(baseline['default-title'].fontSize, '24.09px');

    const combined = await observe(['combined-calendar', 'combined-button', 'combined-title']);
    assert.equal(combined['combined-calendar'].paddingInline, '12.68px', 'responsive inset follows its reference alias');
    assert.equal(combined['combined-button'].paddingInline, '6.88px', 'compact control padding follows responsive space-3xs');
    assert.equal(combined['combined-button'].background, 'rgb(83, 145, 152)', 'dark mode rebinds the action target');
    assert.equal(combined['combined-title'].fontSize, '21.318px', 'descendant title uses responsive formula inputs');

    const nested = await observe(['nested-calendar', 'nested-button', 'nested-title']);
    assert.equal(nested['nested-calendar'].paddingInline, '12.68px', 'nested responsive scope retains responsive inset');
    assert.equal(nested['nested-button'].paddingInline, '12.68px', 'comfortable reset rebinds control padding');
    assert.equal(nested['nested-button'].background, 'rgb(2, 87, 104)', 'nested light scope rebinds the mode target');
    assert.equal(nested['nested-title'].fontSize, '21.318px', 'nested title inherits responsive formula inputs');

    await page.evaluate(() => {
      document.documentElement.style.setProperty('--muxui-reference-dimension-space-xs', '19px');
      document.documentElement.style.setProperty('--muxui-semantic-control-padding-inline', '17px');
    });
    const componentPadding = await page.evaluate(() => getComputedStyle(document.documentElement)
      .getPropertyValue('--muxui-component-button-padding-inline').trim());
    assert.equal(componentPadding, '17px', 'the component alias itself follows the overridden semantic role');
    const overrides = await observe(['default-calendar', 'default-button']);
    assert.equal(overrides['default-calendar'].paddingInline, '19px', 'reference spacing propagates through the calendar inset alias');
    assert.equal(overrides['default-button'].paddingInline, '17px', 'semantic control padding propagates to the button');

    await page.evaluate(() => document.getElementById('nested-scope').style.setProperty('--muxui-reference-dimension-text-xl', '18px'));
    const formulaOverride = await observe(['nested-title', 'combined-title']);
    assert.equal(formulaOverride['nested-title'].fontSize, '19.8px', 'nested formula responds to its local reference input');
    assert.equal(formulaOverride['combined-title'].fontSize, '21.318px', 'nested formula override does not repaint its ancestor scope');
  } finally {
    await browser.close();
  }
});

test('immediate action labels and selection marks retain contrast in every interactive state', { timeout: 30_000 }, async () => {
  const css = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');
  const markup = renderToString(React.createElement('main', null,
    React.createElement(Button, { id: 'action' }, 'Save'),
    React.createElement(Button, { id: 'disabled-action', disabled: true }, 'Unavailable'),
    React.createElement(Checkbox, { defaultChecked: true }, 'Selected choice'),
    React.createElement(CheckboxField.Root, { defaultChecked: true },
      React.createElement(CheckboxField.Button, null,
        React.createElement(CheckboxField.Indicator), 'Selected field choice')),
    React.createElement('span', { id: 'selected-tag', className: 'muxui-tag', 'data-selected': true }, 'Selected tag')));
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.setContent(`<!doctype html><html data-muxui-color-scheme="light"><head><style>${css}</style></head><body>${markup}</body></html>`);
    const action = page.locator('#action');
    const disabledAction = page.locator('#disabled-action');
    const checkbox = page.locator('.muxui-checkbox');
    const checkboxFieldButton = page.locator('.muxui-checkbox-field__button');
    const tag = page.locator('#selected-tag');
    assert.equal(await disabledAction.isDisabled(), true);

    const assertTextContrast = async (foregroundSelector, backgroundSelector, label, mode, state) => {
      const paint = await page.evaluate(([foregroundTarget, backgroundTarget]) => {
        const foreground = document.querySelector(foregroundTarget);
        const background = document.querySelector(backgroundTarget);
        const foregroundStyle = getComputedStyle(foreground);
        const backgroundStyle = getComputedStyle(background);
        return { foreground: foregroundStyle.color, background: backgroundStyle.backgroundColor };
      }, [foregroundSelector, backgroundSelector]);
      const ratio = contrastRatio(paint.foreground, paint.background);
      assert.ok(ratio >= 4.5, `${mode} ${state} ${label} contrast ${ratio.toFixed(2)}:1 (${paint.foreground} on ${paint.background})`);
    };

    for (const mode of ['light', 'dark']) {
      await page.mouse.move(880, 580);
      await page.evaluate((scheme) => document.documentElement.setAttribute('data-muxui-color-scheme', scheme), mode);
      await waitForTokenProperty(page, '#action', 'background-color', 'semantic.selection.track');
      await waitForTokenProperty(page, '#action .muxui-button-content', 'color', 'semantic.action.foreground');
      await assertTextContrast('#action .muxui-button-content', '#action', 'primary Button', mode, 'rest');

      await action.hover();
      await waitForTokenProperty(page, '#action', 'background-color', 'semantic.action.background-hover');
      await waitForTokenProperty(page, '#action .muxui-button-content', 'color', 'semantic.action.foreground');
      await assertTextContrast('#action .muxui-button-content', '#action', 'primary Button', mode, 'hover');

      await page.mouse.down();
      await waitForTokenProperty(page, '#action', 'background-color', 'semantic.action.background-pressed');
      await waitForTokenProperty(page, '#action .muxui-button-content', 'color', 'semantic.action.foreground');
      await assertTextContrast('#action .muxui-button-content', '#action', 'primary Button', mode, 'pressed');
      await page.mouse.up();
      await page.mouse.move(880, 580);

      await action.evaluate((element) => element.setAttribute('data-hovered', ''));
      await waitForTokenProperty(page, '#action', 'background-color', 'semantic.action.background-hover');
      await waitForTokenProperty(page, '#action .muxui-button-content', 'color', 'semantic.action.foreground');
      await assertTextContrast('#action .muxui-button-content', '#action', 'primary Button', mode, 'data-hovered');
      await action.evaluate((element) => {
        element.removeAttribute('data-hovered');
        element.setAttribute('data-pressed', '');
      });
      await waitForTokenProperty(page, '#action', 'background-color', 'semantic.action.background-pressed');
      await waitForTokenProperty(page, '#action .muxui-button-content', 'color', 'semantic.action.foreground');
      await assertTextContrast('#action .muxui-button-content', '#action', 'primary Button', mode, 'data-pressed');
      await action.evaluate((element) => element.removeAttribute('data-pressed'));

      await disabledAction.evaluate((element) => {
        element.setAttribute('data-hovered', '');
        element.setAttribute('data-pressed', '');
      });
      await waitForTokenProperty(page, '#disabled-action', 'background-color', 'semantic.selection.track');
      await waitForTokenProperty(page, '#disabled-action .muxui-button-content', 'color', 'semantic.action.foreground');
      await assertTextContrast('#disabled-action .muxui-button-content', '#disabled-action', 'disabled Button', mode, 'hover and pressed attributes');

      await checkbox.evaluate((element) => element.setAttribute('data-hovered', ''));
      await checkbox.locator('.muxui-checkbox-indicator svg').evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
      });
      await assertTextContrast('.muxui-checkbox-indicator svg', '.muxui-checkbox-indicator', 'selected Checkbox mark', mode, 'hover');

      await checkboxFieldButton.evaluate((element) => element.setAttribute('data-hovered', ''));
      await waitForTokenProperty(page, '.muxui-checkbox-field__indicator svg', 'color', 'component.checkbox.selected-foreground-hover');
      await assertTextContrast('.muxui-checkbox-field__indicator svg', '.muxui-checkbox-field__indicator', 'selected CheckboxField mark', mode, 'hover');

      await tag.evaluate((element) => element.setAttribute('data-hovered', ''));
      await waitForTokenProperty(page, '#selected-tag', 'color', 'component.taggroup.selected-foreground-hover');
      await assertTextContrast('#selected-tag', '#selected-tag', 'selected TagGroup item', mode, 'hover');
    }

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-reduced-motion', 'true');
      // Dark once painted the pressed primary fill over the forced-colors system colours.
      document.documentElement.setAttribute('data-muxui-color-scheme', 'dark');
    });
    await page.emulateMedia({ forcedColors: 'active' });
    await action.hover();
    const systemButtonText = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'ButtonText';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await page.waitForFunction((expected) => getComputedStyle(document.querySelector('#action')).color === expected, systemButtonText);
    assert.equal(await action.evaluate((element) => getComputedStyle(element).color), systemButtonText,
      'primary Button hover keeps its forced-colors system foreground');
    await page.mouse.down();
    assert.equal(await action.evaluate((element) => getComputedStyle(element).color), systemButtonText,
      'primary Button pressed keeps its forced-colors system foreground');
    // This markup is not hydrated, so set the React Aria pressed attribute directly.
    await action.evaluate((element) => element.setAttribute('data-pressed', ''));
    const systemButtonFace = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'ButtonFace';
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    assert.equal(await action.evaluate((element) => getComputedStyle(element).backgroundColor), systemButtonFace,
      'primary Button pressed keeps its forced-colors system background in the dark scheme');
    await action.evaluate((element) => element.removeAttribute('data-pressed'));
    await page.mouse.up();

    await page.evaluate(() => {
      const tagList = document.createElement('div');
      tagList.className = 'muxui-tag-list';
      tagList.tabIndex = 0;
      tagList.setAttribute('data-focus-visible', '');
      document.body.append(tagList);
      const tag = document.getElementById('selected-tag');
      tag.setAttribute('data-hovered', '');
    });
    assert.equal(await page.locator('.muxui-tag-list').last().evaluate((element) => getComputedStyle(element).outlineColor),
      await page.evaluate(() => { const probe = document.createElement('span'); probe.style.outlineColor = 'Highlight'; document.body.append(probe); const color = getComputedStyle(probe).outlineColor; probe.remove(); return color; }),
      'TagGroup keyboard focus uses the forced-colors highlight');
    const highlightColors = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'HighlightText';
      probe.style.backgroundColor = 'Highlight';
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const colors = { foreground: style.color, background: style.backgroundColor };
      probe.remove();
      return colors;
    });
    assert.equal(await tag.evaluate((element) => getComputedStyle(element).color), highlightColors.foreground,
      'selected TagGroup text uses HighlightText while hovered in forced colors');
    assert.equal(await tag.evaluate((element) => getComputedStyle(element).backgroundColor), highlightColors.background,
      'selected TagGroup background uses Highlight while hovered in forced colors');
  } finally {
    await browser.close();
  }
});

test('Button-family labels keep their rest colour and 4.5:1 contrast while only fills change', { timeout: 120_000 }, async () => {
  const css = (await Promise.all(['generated/styles.css', 'generated/supplemental.css', 'generated/themes.css']
    .map((path) => readFile(resolve(packageRoot, path), 'utf8')))).join('\n');
  const variants = ['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse'];
  const h = React.createElement;
  const markup = renderToString(h('main', null,
    ...variants.flatMap((variant) => [
      h(Button, { key: `button-${variant}`, variant, className: `case-button-${variant}` }, 'Save'),
      h(IconButton, { key: `icon-${variant}`, variant, className: `case-icon-button-${variant}`, 'aria-label': 'Add' }, '+'),
    ]),
    h(FileTrigger, null, 'Upload')));
  const targets = [...variants.flatMap((variant) => [`.case-button-${variant}`, `.case-icon-button-${variant}`]), '.muxui-file-trigger'];
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 600 } });
    await page.setContent(`<!doctype html><html data-muxui-motion="reduced"><head><style>${css}</style></head><body style="margin:0;background:var(--muxui-semantic-surface-canvas)">${markup}</body></html>`);
    // Label and fill as painted: translucent fills are composited over the canvas.
    const paint = (selector) => page.locator(selector).evaluate((element) => {
      const context = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
      const flatten = (layers) => {
        context.clearRect(0, 0, 1, 1);
        for (const layer of layers) { context.fillStyle = layer; context.fillRect(0, 0, 1, 1); }
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
      };
      const fill = flatten([getComputedStyle(document.body).backgroundColor, getComputedStyle(element).backgroundColor]);
      return { label: flatten([fill, getComputedStyle(element).color]), fill };
    });
    const setState = (selector, attributes) => page.locator(selector).evaluate((element, names) => {
      for (const name of ['data-hovered', 'data-pressed', 'data-focus-visible']) element.removeAttribute(name);
      for (const name of names) element.setAttribute(name, '');
    }, attributes);
    const focus = async (selector, context) => {
      await page.keyboard.press('Shift');
      await page.locator(selector).evaluate((element) => element.focus());
      assert.equal(await page.locator(selector).evaluate((element) => element.matches(':focus-visible')), true, `${context} keyboard focus`);
      await setState(selector, ['data-focus-visible']);
      const value = await paint(selector);
      await page.locator(selector).evaluate((element) => element.blur());
      await setState(selector, []);
      return value;
    };
    const verify = (context, rest, states) => {
      for (const [state, value] of Object.entries({ rest, ...states })) {
        assert.equal(value.label, rest.label, `${context} ${state} keeps the rest label colour`);
        const ratio = contrastRatio(value.label, value.fill);
        assert.ok(ratio >= 4.5, `${context} ${state} label contrast ${ratio.toFixed(2)}:1 (${value.label} on ${value.fill})`);
      }
      for (const state of Object.keys(states).filter((name) => name !== 'focus-visible')) {
        assert.notEqual(states[state].fill, rest.fill, `${context} ${state} changes the fill`);
      }
    };
    const scopes = [undefined, ...MUXUI_THEME_PRESETS.map(({ id }) => id)];
    assert.equal(scopes.length, 16, 'default theme plus every shipped preset');
    for (const theme of scopes) {
      for (const scheme of ['light', 'dark']) {
        for (const contrast of ['standard', 'more']) {
          await page.evaluate(([themeId, colorScheme, level]) => {
            const root = document.documentElement;
            if (themeId) root.setAttribute('data-muxui-theme', themeId); else root.removeAttribute('data-muxui-theme');
            root.setAttribute('data-muxui-color-scheme', colorScheme);
            root.setAttribute('data-muxui-contrast', level);
          }, [theme, scheme, contrast]);
          for (const selector of targets) {
            const context = `${theme ?? 'default'} ${scheme}/${contrast} ${selector}`;
            await page.mouse.move(1190, 590);
            const rest = await paint(selector);
            const states = {};
            // Pointer states once per mode on the default theme; presets reuse the same selectors.
            if (!theme) {
              await page.locator(selector).hover();
              states.hover = await paint(selector);
              await page.mouse.down();
              states.active = await paint(selector);
              await page.mouse.up();
              await page.mouse.move(1190, 590);
            }
            // Unhydrated markup: apply the React Aria state attributes directly.
            await setState(selector, ['data-hovered']);
            states['data-hovered'] = await paint(selector);
            await setState(selector, ['data-hovered', 'data-pressed']);
            states['data-pressed'] = await paint(selector);
            await setState(selector, []);
            states['focus-visible'] = await focus(selector, context);
            verify(context, rest, states);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
});

test('focus, choice geometry, and validation text have independent semantic overrides', { timeout: 30_000 }, async () => {
  const css = (await Promise.all(['generated/styles.css', 'generated/supplemental.css', 'src/text-editor/text-editor.css']
    .map((path) => readFile(resolve(packageRoot, path), 'utf8')))).join('\n');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>
      <label class="muxui-radio muxui-radio--sm" data-focus-visible><span class="muxui-radio-indicator"></span></label>
      <div class="muxui-radio-field muxui-radio-field--sm"><label class="muxui-radio-field__button" data-focus-visible><span class="muxui-radio-field__indicator"></span></label></div>
      <div class="muxui-text-editor" data-invalid><label class="muxui-text-editor__label">Label</label><p class="muxui-text-editor__description">Validation</p></div>
    </body></html>`);
    for (const mode of ['light', 'dark']) {
    await page.evaluate((scheme) => {
      const root = document.documentElement;
      root.setAttribute('data-muxui-color-scheme', scheme);
        root.style.setProperty('--muxui-semantic-layout-inset-medium', '41px');
        root.style.setProperty('--muxui-semantic-layout-icon-size', '19px');
        root.style.setProperty('--muxui-semantic-focus-inner', '#ff00ff');
        root.style.setProperty('--muxui-semantic-feedback-invalid-border', '#00ff00');
        root.style.setProperty('--muxui-semantic-feedback-invalid', '#ff8000');
      }, mode);
      for (const selector of ['.muxui-radio-indicator', '.muxui-radio-field__indicator']) {
        const style = await page.locator(selector).evaluate(async (element) => {
          await Promise.all(element.getAnimations().map((animation) => animation.finished));
          const computed = getComputedStyle(element);
          return { width: computed.width, height: computed.height, shadow: computed.boxShadow };
        });
        assert.equal(style.width, '19px', `${mode}: ${selector} width follows indicator size, not inset`);
        assert.equal(style.height, style.width, `${mode}: ${selector} remains circular`);
        assert.match(style.shadow, /rgb\(255, 0, 255\)/u, `${mode}: ${selector} uses the inner focus role`);
      }
      for (const selector of ['.muxui-text-editor__label', '.muxui-text-editor__description']) {
        assert.equal(await page.locator(selector).evaluate((element) => getComputedStyle(element).color), 'rgb(255, 128, 0)', `${mode}: ${selector} follows semantic.feedback.invalid, not the border role`);
      }
    }
  } finally {
    await browser.close();
  }
});
