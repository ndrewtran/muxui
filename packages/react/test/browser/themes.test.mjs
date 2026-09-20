import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { compileScalePresetTheme } from '@muxui/tokens/authoring';
import { cssName, cssValue } from '@muxui/tokens/core';
import source from '../../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { Button, Meter, TextField } from '../../generated/index.mjs';
import { MUXUI_THEME_PRESETS, MUXUI_THEME_PRESETS_BY_ID } from '../../generated/themes.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const themeModes = [
  ['light', 'standard'],
  ['light', 'more'],
  ['dark', 'standard'],
  ['dark', 'more'],
];
const colorRoles = [
  'component.button.background',
  'component.button.foreground',
  'semantic.color.color-60',
  'semantic.color.color-60-fg',
  'semantic.content.default',
  'semantic.surface.canvas',
  'semantic.border.default',
  'semantic.field.background',
  'semantic.field.content',
  'semantic.selection.track',
];

async function findChrome() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for theme browser verification.');
}

function expectedThemeCases() {
  assert.equal(MUXUI_THEME_PRESETS.length, 15, 'browser proof uses all exported Mux theme presets');
  assert.equal(Object.keys(MUXUI_THEME_PRESETS_BY_ID).length, 15, 'browser proof uses the exported lookup table');
  return MUXUI_THEME_PRESETS.flatMap((preset) => themeModes.map(([colorScheme, contrast]) => {
    const compiled = compileScalePresetTheme({
      source,
      collection: preset.collection,
      presetId: preset.presetId,
      modes: { colorScheme, contrast },
    });
    const values = Object.fromEntries(colorRoles.map((role) => {
      const token = compiled.compiled.tokens[role];
      assert.ok(token, `${preset.id}/${colorScheme}/${contrast}: compiler exposes ${role}`);
      return [cssName(role), cssValue(token)];
    }));
    return {
      id: preset.id,
      colorScheme,
      contrast,
      values,
      probeId: `probe-${preset.id}-${colorScheme}-${contrast}`,
    };
  }));
}

function normalizeColor(value) {
  return value.replaceAll(/\s+/gu, '').toLowerCase();
}

function caseFor(cases, id, colorScheme, contrast) {
  const match = cases.find((item) => item.id === id && item.colorScheme === colorScheme && item.contrast === contrast);
  assert.ok(match, `compiler case exists for ${id}/${colorScheme}/${contrast}`);
  return match;
}

function valueFor(themeCase, role) {
  const value = themeCase.values[cssName(role)];
  assert.ok(value, `${themeCase.id}/${themeCase.colorScheme}/${themeCase.contrast} has ${role}`);
  return value;
}

function probeMarkup(cases) {
  return cases.map(({ probeId, id, colorScheme, contrast }) => (
    `<div id="${probeId}" data-muxui-theme="${id}" data-muxui-color-scheme="${colorScheme}" data-muxui-contrast="${contrast}"></div>`
  )).join('');
}

function renderThemeFixture() {
  const h = React.createElement;
  return renderToString(h('main', { id: 'theme-fixture' },
    h('section', {
      id: 'root-scope',
      'data-muxui-theme': 'standard-harbour',
      'data-muxui-color-scheme': 'light',
      'data-muxui-contrast': 'standard',
      'data-muxui-density': 'comfortable',
    },
    h(Button, { id: 'harbour-button' }, 'Save'),
    h(TextField, { id: 'harbour-field', label: 'Name', defaultValue: 'Ada' }),
    h('section', {
      id: 'nested-scope',
      'data-muxui-theme': 'standard-lagoon',
      'data-muxui-color-scheme': 'dark',
      'data-muxui-contrast': 'more',
      'data-muxui-density': 'compact',
      style: {
        '--muxui-semantic-layout-control-gap': '31px',
        '--muxui-semantic-typography-body-size': '19px',
        '--muxui-semantic-typography-label-m-font-size': '19px',
        '--muxui-field-font-size': '19px',
        '--muxui-semantic-motion-interaction-duration': '123ms',
      },
    },
    h(Button, { id: 'nested-button' }, 'Save'),
    h(TextField, { id: 'nested-field', label: 'Name', defaultValue: 'Ada' }),
    ),
    h('section', { id: 'unknown-scope', 'data-muxui-theme': 'unknown-preset' },
      h(Button, { id: 'unknown-button' }, 'Save'),
      h(TextField, { id: 'unknown-field', label: 'Name', defaultValue: 'Ada' }),
    ),
    h('section', {
      id: 'mode-outer-dark',
      'data-muxui-theme': 'standard-harbour',
      'data-muxui-color-scheme': 'dark',
      'data-muxui-contrast': 'standard',
    },
    h(Meter, { id: 'outer-dark-meter', label: 'Outer', value: 50 }),
    h('section', {
      id: 'mode-inner-light',
      'data-muxui-theme': 'standard-lagoon',
      'data-muxui-color-scheme': 'light',
      'data-muxui-contrast': 'standard',
    },
    h(Meter, { id: 'inner-light-meter', label: 'Inner', value: 50 }),
    h('section', {
      id: 'mode-deep-dark',
      'data-muxui-theme': 'standard-violet-dusk',
      'data-muxui-color-scheme': 'dark',
      'data-muxui-contrast': 'more',
    },
    h(Meter, { id: 'deep-dark-meter', label: 'Deep', value: 50 }),
    ),
    ),
    ),
    ),
  ));
}

const browserEntry = `
import { MUXUI_THEME_PRESETS, MUXUI_THEME_PRESETS_BY_ID } from '/packages/react/generated/themes.mjs';
import '/packages/react/generated/styles.css';
import '/packages/react/generated/themes.css';

document.documentElement.dataset.exportedPresetCount = String(MUXUI_THEME_PRESETS.length);
document.documentElement.dataset.exportedPresetLookupCount = String(Object.keys(MUXUI_THEME_PRESETS_BY_ID).length);
requestAnimationFrame(() => { document.documentElement.dataset.themeReady = 'true'; });
`;

test('Mux preset themes resolve compiler colors and live React scopes in Chrome', { timeout: 120_000 }, async () => {
  const cases = expectedThemeCases();
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,muxui-themes"></head><body>
    ${renderThemeFixture()}
    <section id="compiler-probes">${probeMarkup(cases)}</section>
    <script type="module" src="/muxui-themes-browser-entry.mjs"></script>
  </body></html>`;
  const cacheDir = await mkdtemp(join(tmpdir(), 'muxui-themes-vite-'));
  const virtualEntryId = resolve(import.meta.dirname, '.muxui-themes-browser-entry.mjs');
  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    cacheDir,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{
      name: 'muxui-themes-browser-entry',
      resolveId(id) {
        if (id === '/muxui-themes-browser-entry.mjs') return virtualEntryId;
      },
      load(id) {
        if (id === virtualEntryId) return browserEntry;
      },
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== '/themes-browser.html') return next();
          response.setHeader('content-type', 'text/html');
          response.end(html);
        });
      },
    }],
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address === 'object');
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${address.port}/themes-browser.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1_000);
    if (await page.locator('#harbour-button').count() === 0) {
      const debug = await page.evaluate(() => ({
        url: location.href,
        root: document.getElementById('root')?.innerHTML,
        ready: document.documentElement.dataset.themeReady,
      }));
      assert.fail(`theme fixture did not render: ${JSON.stringify({ errors, debug })}`);
    }
    await page.locator('#harbour-button').waitFor({ timeout: 10_000 });
    await page.waitForFunction(() => document.documentElement.dataset.themeReady === 'true');
    assert.deepEqual(errors, [], errors.join('\n'));
    assert.equal(await page.locator('#harbour-button').getAttribute('data-variant'), 'primary');
    assert.equal(await page.locator('#harbour-field').getAttribute('aria-labelledby') !== null, true);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.exportedPresetCount), '15');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.exportedPresetLookupCount), '15');

    const compilerFailures = await page.evaluate((expectedCases) => expectedCases.flatMap((themeCase) => {
      const probe = document.getElementById(themeCase.probeId);
      if (!probe) return [`${themeCase.probeId}: probe missing`];
      const style = getComputedStyle(probe);
      const resolvedExpected = probe.cloneNode(false);
      resolvedExpected.removeAttribute('id');
      for (const [name, expected] of Object.entries(themeCase.values)) resolvedExpected.style.setProperty(name, expected);
      probe.append(resolvedExpected);
      const expectedStyle = getComputedStyle(resolvedExpected);
      const failures = Object.entries(themeCase.values).flatMap(([name, expected]) => {
        const actual = style.getPropertyValue(name).trim();
        const resolved = expectedStyle.getPropertyValue(name).trim();
        return actual.replace(/\s+/gu, '').toLowerCase() === resolved.replace(/\s+/gu, '').toLowerCase()
          ? []
          : [`${themeCase.id}/${themeCase.colorScheme}/${themeCase.contrast} ${name}: expected ${expected} (resolved ${resolved}), got ${actual}`];
      });
      resolvedExpected.remove();
      return failures;
    }), cases);
    assert.deepEqual(compilerFailures, [], compilerFailures.join('\n'));

    const resolvedRoleColor = (themeCase, role) => page.evaluate(({ probeId, name }) => {
      const probe = document.getElementById(probeId);
      if (!probe) throw new Error(`${probeId}: probe missing while resolving ${name}`);
      const sample = document.createElement('span');
      sample.style.backgroundColor = `var(${name})`;
      probe.append(sample);
      const color = getComputedStyle(sample).backgroundColor;
      sample.remove();
      return color;
    }, { probeId: themeCase.probeId, name: cssName(role) });

    const readScope = (scope) => page.evaluate((name) => {
      const button = document.getElementById(`${name}-button`);
      const field = document.getElementById(`${name}-field`);
      const fieldRoot = field?.closest('.muxui-text-field');
      if (!button || !field || !fieldRoot) throw new Error(`${name}: rendered Button/TextField fixture is incomplete`);
      const buttonStyle = getComputedStyle(button);
      const fieldStyle = getComputedStyle(field);
      return {
        button: {
          background: buttonStyle.backgroundColor,
          color: buttonStyle.color,
          selectionToken: buttonStyle.getPropertyValue('--muxui-semantic-selection-track').trim(),
          buttonBackgroundToken: buttonStyle.getPropertyValue('--muxui-button-background').trim(),
          paddingInline: buttonStyle.paddingInline,
          fontSize: buttonStyle.fontSize,
          transitionDuration: buttonStyle.transitionDuration,
        },
        field: {
          background: fieldStyle.backgroundColor,
          color: fieldStyle.color,
          fontSize: fieldStyle.fontSize,
          gap: getComputedStyle(fieldRoot).gap,
        },
        scope: {
          theme: document.getElementById(`${name === 'nested' ? 'nested' : 'root'}-scope`)?.getAttribute('data-muxui-theme'),
          scheme: document.getElementById(`${name === 'nested' ? 'nested' : 'root'}-scope`)?.getAttribute('data-muxui-color-scheme'),
        },
      };
      }, scope);

    const settleThemeTransitions = async (scopeId = 'nested-scope') => {
      await page.evaluate(async (id) => {
        const scope = document.getElementById(id);
        if (!scope) return;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await Promise.all(scope.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
      }, scopeId);
    };

    const readMeterNesting = () => page.evaluate(() => Object.fromEntries(
      [['outer', 'outer-dark'], ['inner', 'inner-light'], ['deep', 'deep-dark']].map(([name, id]) => {
        const fill = document.querySelector(`#${id}-meter .muxui-meter-fill`);
        if (!fill) throw new Error(`${name} meter fill is missing`);
        return [name, getComputedStyle(fill).backgroundColor];
      }),
    ));

    const expectedHarbourLight = caseFor(cases, 'standard-harbour', 'light', 'standard');
    const expectedHarbourDark = caseFor(cases, 'standard-harbour', 'dark', 'standard');
    const expectedLagoonDark = caseFor(cases, 'standard-lagoon', 'dark', 'more');
    const expectedLagoonLight = caseFor(cases, 'standard-lagoon', 'light', 'standard');
    const expectedLagoonDarkStandard = caseFor(cases, 'standard-lagoon', 'dark', 'standard');
    const expectedVioletDarkMore = caseFor(cases, 'standard-violet-dusk', 'dark', 'more');
    const initial = {
      harbour: await readScope('harbour'),
      nested: await readScope('nested'),
      unknown: await readScope('unknown'),
    };
    assert.equal(normalizeColor(initial.harbour.button.background), normalizeColor(await resolvedRoleColor(expectedHarbourLight, 'component.button.background')));
    assert.equal(normalizeColor(initial.harbour.button.color), normalizeColor(await resolvedRoleColor(expectedHarbourLight, 'component.button.foreground')));
    assert.equal(normalizeColor(initial.harbour.field.background), normalizeColor(await resolvedRoleColor(expectedHarbourLight, 'semantic.field.background')));
    assert.equal(normalizeColor(initial.harbour.field.color), normalizeColor(await resolvedRoleColor(expectedHarbourLight, 'semantic.field.content')));
    assert.equal(normalizeColor(initial.nested.button.background), normalizeColor(await resolvedRoleColor(expectedLagoonDark, 'component.button.background')));
    assert.equal(normalizeColor(initial.nested.button.color), normalizeColor(await resolvedRoleColor(expectedLagoonDark, 'component.button.foreground')));
    assert.notEqual(normalizeColor(initial.nested.button.background), normalizeColor(initial.harbour.button.background), 'nested explicit theme changes the action background');
    assert.deepEqual(
      {
        buttonBackground: initial.unknown.button.background,
        buttonColor: initial.unknown.button.color,
        fieldBackground: initial.unknown.field.background,
        fieldColor: initial.unknown.field.color,
      },
      {
        buttonBackground: initial.harbour.button.background,
        buttonColor: initial.harbour.button.color,
        fieldBackground: initial.harbour.field.background,
        fieldColor: initial.harbour.field.color,
      },
      'unknown theme IDs inherit the nearest known scope normally',
    );

    const nestedMeters = await readMeterNesting();
    assert.equal(normalizeColor(nestedMeters.outer), normalizeColor(await resolvedRoleColor(expectedHarbourDark, 'semantic.color.neutral-default-5')));
    assert.equal(normalizeColor(nestedMeters.inner), normalizeColor(await resolvedRoleColor(expectedLagoonLight, 'semantic.color.neutral-default-100')));
    assert.equal(normalizeColor(nestedMeters.deep), normalizeColor(await resolvedRoleColor(expectedVioletDarkMore, 'semantic.color.neutral-default-5')));

    await page.evaluate(() => document.getElementById('mode-inner-light')?.setAttribute('data-muxui-color-scheme', 'dark'));
    await settleThemeTransitions('mode-inner-light');
    const inverseMeters = await readMeterNesting();
    assert.equal(normalizeColor(inverseMeters.outer), normalizeColor(nestedMeters.outer), 'outer dark scope remains authoritative');
    assert.equal(normalizeColor(inverseMeters.inner), normalizeColor(await resolvedRoleColor(expectedLagoonDarkStandard, 'semantic.color.neutral-default-5')), 'inner dark scope overrides outer dark by proximity');
    assert.equal(normalizeColor(inverseMeters.deep), normalizeColor(nestedMeters.deep), 'deep dark scope remains authoritative');

    await page.evaluate(() => document.getElementById('mode-inner-light')?.setAttribute('data-muxui-color-scheme', 'light'));
    await settleThemeTransitions('mode-inner-light');
    const restoredMeters = await readMeterNesting();
    assert.deepEqual(restoredMeters, nestedMeters, 'restoring the inverse mode returns every nested meter to its nearest scope');

    const retainedBeforeSwitch = {
      buttonPadding: initial.nested.button.paddingInline,
      buttonFontSize: initial.nested.button.fontSize,
      buttonTransition: initial.nested.button.transitionDuration,
      fieldFontSize: initial.nested.field.fontSize,
      fieldGap: initial.nested.field.gap,
    };
    assert.equal(retainedBeforeSwitch.buttonFontSize, '19px', JSON.stringify(initial.nested));
    assert.match(retainedBeforeSwitch.buttonTransition, /^0\.123s(?:,\s*0\.123s){3}$/u, JSON.stringify(initial.nested));
    assert.equal(retainedBeforeSwitch.fieldFontSize, '19px', JSON.stringify(initial.nested));
    assert.equal(retainedBeforeSwitch.fieldGap, '31px', JSON.stringify(initial.nested));
    assert.notEqual(retainedBeforeSwitch.buttonPadding, initial.harbour.button.paddingInline, 'compact density remains independent of the theme palette');

    await page.evaluate(() => {
      const nested = document.getElementById('nested-scope');
      nested.setAttribute('data-muxui-theme', 'standard-harbour');
      nested.setAttribute('data-muxui-color-scheme', 'light');
      nested.setAttribute('data-muxui-contrast', 'standard');
    });
    await settleThemeTransitions();
    const switched = await readScope('nested');
    assert.equal(normalizeColor(switched.button.background), normalizeColor(initial.harbour.button.background), JSON.stringify({ initial: initial.harbour, switched }));
    assert.equal(normalizeColor(switched.button.color), normalizeColor(initial.harbour.button.color), JSON.stringify({ initial: initial.harbour, switched }));
    assert.equal(normalizeColor(switched.field.background), normalizeColor(initial.harbour.field.background), JSON.stringify({ initial: initial.harbour, switched }));
    assert.equal(normalizeColor(switched.field.color), normalizeColor(initial.harbour.field.color), JSON.stringify({ initial: initial.harbour, switched }));
    assert.deepEqual(
      {
        buttonPadding: switched.button.paddingInline,
        buttonFontSize: switched.button.fontSize,
        buttonTransition: switched.button.transitionDuration,
        fieldFontSize: switched.field.fontSize,
        fieldGap: switched.field.gap,
      },
      retainedBeforeSwitch,
      'spacing, density, typography, and motion overrides survive a nested theme switch',
    );

    await page.evaluate(() => {
      const nested = document.getElementById('nested-scope');
      nested.removeAttribute('data-muxui-theme');
      nested.removeAttribute('data-muxui-color-scheme');
      nested.removeAttribute('data-muxui-contrast');
    });
    await settleThemeTransitions();
    const reset = await readScope('nested');
    assert.equal(normalizeColor(reset.button.background), normalizeColor(initial.harbour.button.background));
    assert.equal(normalizeColor(reset.button.color), normalizeColor(initial.harbour.button.color));
    assert.equal(normalizeColor(reset.field.background), normalizeColor(initial.harbour.field.background));
    assert.equal(normalizeColor(reset.field.color), normalizeColor(initial.harbour.field.color));

    await page.evaluate(() => {
      const nested = document.getElementById('nested-scope');
      nested.setAttribute('data-muxui-theme', 'standard-lagoon');
      nested.setAttribute('data-muxui-color-scheme', 'dark');
      nested.setAttribute('data-muxui-contrast', 'more');
    });
    await page.emulateMedia({ forcedColors: 'active' });
    await settleThemeTransitions();
    const forcedBefore = await page.evaluate(() => {
      const button = document.getElementById('nested-button');
      const style = getComputedStyle(button);
      return {
        mediaActive: matchMedia('(forced-colors: active)').matches,
        background: style.backgroundColor,
        color: style.color,
        border: style.borderTopColor,
        buttonBackgroundToken: style.getPropertyValue('--muxui-button-background').trim(),
        buttonForegroundToken: style.getPropertyValue('--muxui-button-foreground').trim(),
      };
    });
    assert.equal(forcedBefore.mediaActive, true);
    assert.equal(forcedBefore.buttonBackgroundToken, 'ButtonFace');
    assert.equal(forcedBefore.buttonForegroundToken, 'ButtonText');
    await page.evaluate(() => {
      const nested = document.getElementById('nested-scope');
      nested.setAttribute('data-muxui-theme', 'standard-harbour');
      nested.setAttribute('data-muxui-color-scheme', 'light');
      nested.setAttribute('data-muxui-contrast', 'standard');
    });
    await settleThemeTransitions();
    const forcedAfter = await page.evaluate(() => {
      const button = document.getElementById('nested-button');
      const style = getComputedStyle(button);
      return {
        mediaActive: matchMedia('(forced-colors: active)').matches,
        background: style.backgroundColor,
        color: style.color,
        border: style.borderTopColor,
        buttonBackgroundToken: style.getPropertyValue('--muxui-button-background').trim(),
        buttonForegroundToken: style.getPropertyValue('--muxui-button-foreground').trim(),
      };
    });
    assert.deepEqual(forcedAfter, forcedBefore, 'forced-colors system treatment remains independent of preset theme switching');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
