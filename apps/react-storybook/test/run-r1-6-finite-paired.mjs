import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { dirname, relative, resolve } from 'node:path';
import { arch as osArch, release as osRelease, version as osVersion } from 'node:os';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { fixtureContractFor, migrationFrame, noApplicableDonorFamilies } from '../src/visual-migration-contract.mjs';
import {
  FINITE_CAPTURE_MODES,
  FINITE_CAPTURE_REPORT_SCHEMA,
  PINNED_FINITE_DONOR,
  artifactRecord,
  assertAllowedRequests,
  assertFiniteInventory,
  assertFiniteReportSchema,
  assertMuxOnlyRuntimeClosure,
  assertPinnedFiniteDonor,
  assertReferenceBinding,
  assertReplayFactShape,
  assertStableCaptureFingerprint,
  buildContentManifest,
  compareReplayFacts as compareStrictReplayFacts,
  readRetainedArtifact,
} from './finite-capture-integrity.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const appRoot = resolve(repositoryRoot, 'apps/react-storybook');
const muxRequire = createRequire(resolve(repositoryRoot, 'packages/react/package.json'));
const finiteFixturePath = resolve(repositoryRoot, 'catalog/react-r1-6/finite-fixtures.json');
const current = process.argv.includes('--current');
const finiteMuxEntryPath = resolve(appRoot, (current)
  ? 'visual-migration/bootstrap/r1-6-mux-entry.mjs'
  : 'visual-migration/bootstrap/finite-mux-entry.mjs');
const taleEntryPath = resolve(appRoot, 'visual-migration/bootstrap/donor-entry.mjs');
const currentTaleEntryPath = resolve(appRoot, 'visual-migration/bootstrap/r1-6-donor-entry.mjs');
const host = '127.0.0.1';
const timeoutMs = 30_000;
const motionStates = new Set(['opening', 'closing', 'timed', 'pending', 'submitting', 'drop-target', 'indeterminate']);

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const finiteRunnerFlags = new Set(['--current', '--mux-only', '--strict', '--require-reference', '--diagnostic', '--help']);
const finiteRunnerValueArgs = new Set(['--output-dir', '--family', '--scenario', '--mode', '--limit', '--reference-report', '--tale-root']);

function printRunnerHelp() {
  console.log('Usage: node run-r1-6-finite-paired.mjs [--current] [--mux-only --reference-report path] [--strict|--require-reference] [--family name|--scenario id|--limit n] [--mode light|dark] [--output-dir path] [--diagnostic]');
}

function validateRunnerArguments(args) {
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === '--help') {
      if (seen.has(name)) throw new Error(`duplicate finite runner flag: ${name}`);
      seen.add(name);
      continue;
    }
    if (finiteRunnerFlags.has(name)) {
      if (seen.has(name)) throw new Error(`duplicate finite runner flag: ${name}`);
      seen.add(name);
      continue;
    }
    if (!finiteRunnerValueArgs.has(name)) throw new Error(`unknown finite runner argument: ${name}`);
    if (seen.has(name)) throw new Error(`duplicate finite runner argument: ${name}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`finite runner argument ${name} needs a value`);
    seen.add(name);
    index += 1;
  }
}

function familySlug(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function cssEscape(value) {
  return String(value).replaceAll(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.codePointAt(0).toString(16)} `);
}

const localFontFaces = Object.freeze([
  { family: 'Inter', style: 'normal', weight: '100 900', file: 'Inter[opsz,wght].ttf' },
  { family: 'Inter', style: 'italic', weight: '100 900', file: 'Inter-Italic[opsz,wght].ttf' },
  { family: 'Playfair Display', style: 'normal', weight: '400 900', file: 'PlayfairDisplay[wght].ttf' },
  { family: 'Playfair Display', style: 'italic', weight: '400 900', file: 'PlayfairDisplay-Italic[wght].ttf' },
  { family: 'Roboto Mono', style: 'normal', weight: '100 700', file: 'RobotoMono[wght].ttf' },
  { family: 'Roboto Mono', style: 'italic', weight: '100 700', file: 'RobotoMono-Italic[wght].ttf' },
]);

function localFontStyles(origin) {
  return localFontFaces.map(({ family, style, weight, file }) => `@font-face { font-family: '${family}'; font-style: ${style}; font-weight: ${weight}; font-display: block; src: url('${origin}/mux-fonts/${encodeURIComponent(file)}') format('truetype'); }`).join('\n');
}

async function assertLocalFonts(page, renderer) {
  const faces = await page.evaluate(async (fontFaces) => Promise.all(fontFaces.map(async ({ family, style, weight, file }) => {
    const descriptor = `${style === 'italic' ? 'italic ' : ''}${weight.split(' ')[0]} 16px "${family}"`;
    try {
      const loaded = await document.fonts.load(descriptor);
      return { family, style, weight, file, descriptor, loaded: loaded.length > 0, checked: document.fonts.check(descriptor) };
    } catch (error) {
      return { family, style, weight, file, descriptor, loaded: false, checked: false, error: String(error) };
    }
  })), localFontFaces);
  const failures = faces.filter(({ loaded, checked }) => !loaded || !checked);
  if (failures.length > 0) throw new Error(`${renderer} local font proof failed: ${failures.map(({ file, error }) => `${file}${error ? ` (${error})` : ''}`).join(', ')}`);
  return faces;
}

function rendererFamily(family) {
  return family === 'Modal' ? 'Dialog' : family;
}

function finiteScenarios(finite, familyFilter, current) {
  const source = current ? 'current-r1-6' : 'historical-fixed-53';
  const records = finite.components.filter((record) => record.source === source)
    .filter((record) => current || !noApplicableDonorFamilies.includes(record.family))
    .filter((record) => !familyFilter || record.family === familyFilter || record.slug === familyFilter || familySlug(rendererFamily(record.family)) === familyFilter);
  return records.flatMap((record) => [
    ...record.finiteVariants.map((variant) => ({
      id: `${record.slug}--variant-${variant.id}`,
      reportFamily: record.family,
      family: rendererFamily(record.family),
      state: 'idle',
      props: variant.props ?? {},
      action: undefined,
      source: 'finite-variant',
      evidence: variant.evidence,
    })),
    ...record.interactionCases.map((scenario) => ({
      id: scenario.id,
      reportFamily: record.family,
      family: rendererFamily(record.family),
      state: scenario.state,
      props: scenario.props ?? {},
      action: scenario.action,
      source: 'interaction-case',
      evidence: scenario.evidence,
    })),
  ]);
}

function assertCurrentInventory(finite, scenarios, familyFilter, limited) {
  const current = finite.components.filter(({ source }) => source === 'current-r1-6');
  if (current.length !== finite.current?.supplementalCount) {
    throw new Error(`current finite inventory expected ${finite.current?.supplementalCount ?? 'a declared count'} families, found ${current.length}`);
  }
  const expected = new Set(current
    .filter((record) => !familyFilter || record.family === familyFilter || record.slug === familyFilter || familySlug(rendererFamily(record.family)) === familyFilter)
    .flatMap((record) => [
      ...record.finiteVariants.map(({ id }) => `${record.slug}--variant-${id}`),
      ...record.interactionCases.map(({ id }) => id),
    ]));
  if ((!limited && expected.size !== scenarios.length) || scenarios.some(({ id }) => !expected.has(id))) {
    throw new Error(`current finite replay inventory does not match finite-fixtures.json for ${familyFilter ?? 'all families'}`);
  }
  for (const record of current) {
    if (record.finiteVariants.length === 0 || record.interactionCases.length === 0) throw new Error(`${record.family} needs finite variants and interaction cases`);
    const ids = [...record.finiteVariants.map(({ id }) => id), ...record.interactionCases.map(({ id }) => id)];
    if (new Set(ids).size !== ids.length) throw new Error(`${record.family} has duplicate finite fixture IDs`);
    if (record.finiteVariants.some(({ evidence }) => !evidence) || record.interactionCases.some(({ capture, evidence }) => capture?.required !== true || !evidence)) {
      throw new Error(`${record.family} finite proof metadata is incomplete`);
    }
  }
}

function parseJson(value) {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('expected a JSON object');
  return parsed;
}

async function browserExecutable() {
  const candidates = [
    process.env.MUXUI_CHROME_EXECUTABLE,
    process.env.CHROME_BIN,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next capture-environment candidate.
    }
  }
  throw new Error('Chrome or Chromium is required (set MUXUI_CHROME_EXECUTABLE to override)');
}

async function filesUnder(relativeRoot) {
  const root = resolve(repositoryRoot, relativeRoot);
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) files.push(relative(repositoryRoot, absolutePath).split('\\').join('/'));
      else throw new Error(`finite capture content manifest found unsupported entry: ${relative(repositoryRoot, absolutePath)}`);
    }
  }
  await visit(root);
  return files;
}

async function contentPathsFor(finite, scenarios, currentRun) {
  const selectedFamilies = new Set(scenarios.map(({ reportFamily }) => reportFamily));
  const selectedRecords = finite.components.filter(({ family, source }) => source === (currentRun ? 'current-r1-6' : 'historical-fixed-53') && selectedFamilies.has(family));
  const [storybookSource, generatedRuntime, reactSource, tokenSource, fontAssets] = await Promise.all([
    filesUnder('apps/react-storybook/src'),
    filesUnder('packages/react/generated'),
    filesUnder('packages/react/src'),
    filesUnder('packages/tokens/src'),
    filesUnder('packages/react/assets/fonts'),
  ]);
  const bootstrap = currentRun
    ? ['apps/react-storybook/visual-migration/bootstrap/r1-6-mux-entry.mjs', 'apps/react-storybook/visual-migration/bootstrap/r1-6-mux-render-plan.mjs', 'apps/react-storybook/visual-migration/bootstrap/r1-6-current-scene.mjs']
    : ['apps/react-storybook/visual-migration/bootstrap/finite-mux-entry.mjs', 'apps/react-storybook/visual-migration/bootstrap/r1-6-original-finite-facts.mjs'];
  const sourceInput = new Set([
    'catalog/react-r1-6/finite-fixtures.json',
    'catalog/react-r1-6/donor-crosswalk.json',
    'catalog/tokens/default-theme.json',
    ...selectedRecords.flatMap((record) => [record.canonical?.artifact, ...(record.examples ?? [])].filter(Boolean)),
  ]);
  return {
    runtime: [...new Set([...storybookSource, ...generatedRuntime, ...reactSource, ...tokenSource, ...bootstrap])].sort(),
    sourceInput: [...sourceInput].sort(),
    tool: [
      'apps/react-storybook/test/run-r1-6-finite-paired.mjs',
      'apps/react-storybook/test/finite-capture-integrity.mjs',
      'apps/react-storybook/package.json',
      'apps/react-storybook/visual-migration/bootstrap/donor-adapter.mjs',
      'apps/react-storybook/visual-migration/bootstrap/donor-entry.mjs',
      'apps/react-storybook/visual-migration/bootstrap/donor-render-plan.mjs',
      'apps/react-storybook/visual-migration/bootstrap/r1-6-finite-bootstrap.mjs',
      'apps/react-storybook/visual-migration/bootstrap/r1-6-finite-donor-entry.mjs',
      'apps/react-storybook/visual-migration/bootstrap/r1-6-donor-entry.mjs',
      'apps/react-storybook/visual-migration/bootstrap/r1-6-donor-render-plan.mjs',
      'apps/react-storybook/visual-migration/bootstrap/r1-6-original-donor-render-plan.mjs',
      'apps/react-storybook/visual-migration/bootstrap/r1-6-current-scene.mjs',
      'apps/react-storybook/visual-migration/bootstrap/r1-6-mux-entry.mjs',
      'apps/react-storybook/visual-migration/bootstrap/r1-6-mux-render-plan.mjs',
      'catalog/tokens/default-theme.json',
      'package.json',
      'pnpm-lock.yaml',
    ],
    fonts: fontAssets,
  };
}

async function captureBinding(finite, scenarios, currentRun, environment) {
  const paths = await contentPathsFor(finite, scenarios, currentRun);
  const [runtime, sourceInput, tool, fonts] = await Promise.all([
    buildContentManifest(repositoryRoot, paths.runtime),
    buildContentManifest(repositoryRoot, paths.sourceInput),
    buildContentManifest(repositoryRoot, paths.tool),
    buildContentManifest(repositoryRoot, paths.fonts),
  ]);
  return {
    runtime,
    sourceInput,
    tool,
    fonts,
    browser: environment,
  };
}

async function startMuxServer() {
  const temporaryRoot = await mkdtemp('/tmp/muxui-r1-6-finite-mux-');
  const entryUrl = `/@fs/${finiteMuxEntryPath}`;
  await writeFile(resolve(temporaryRoot, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Mux UI R1.6 finite paired capture</title></head><body><main id="root"></main><script type="module" src="${entryUrl}"></script></body></html>\n`);
  const server = await createServer({
    root: temporaryRoot,
    resolve: {
      alias: [
        { find: /^react$/, replacement: muxRequire.resolve('react') },
        { find: /^react-dom\/client$/, replacement: muxRequire.resolve('react-dom/client') },
        { find: /^@internationalized\/date$/, replacement: resolve(dirname(muxRequire.resolve('@internationalized/date')), 'index.mjs') },
      ],
      dedupe: ['react', 'react-dom'],
    },
    // Frozen finite captures do not need module hot replacement. Keeping the
    // proof servers quiet prevents a source watcher update from destroying a
    // page evaluation between the readiness marker and fact snapshot.
    server: { host, port: 0, strictPort: false, hmr: false, watch: null, fs: { allow: [temporaryRoot, appRoot, repositoryRoot] } },
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address !== 'object') throw new Error('Mux finite bootstrap could not reserve a local server port');
  return { server, temporaryRoot, url: `http://${host}:${address.port}` };
}

export function targetSelector(family, renderer) {
  const mux = {
    Button: '.muxui-button', Breadcrumbs: '.muxui-breadcrumbs', Checkbox: '.muxui-checkbox', Disclosure: '.muxui-disclosure', DisclosureGroup: '.muxui-disclosure-group',
    Link: '.muxui-link', Meter: '.muxui-meter', ProgressBar: '.muxui-progress-bar', Separator: '.muxui-separator', ToggleButton: '.muxui-toggle-button',
    Autocomplete: '.muxui-autocomplete-search', CheckboxGroup: '.muxui-checkbox-group', DateField: '.muxui-date-field', DatePicker: '.muxui-date-picker', DateRangePicker: '.muxui-date-range-picker',
    Form: '.muxui-form', NumberField: '.muxui-number-field', SearchField: '.muxui-search-field', Switch: '.muxui-switch', TextField: '.muxui-text-field', TimeField: '.muxui-time-field',
    Calendar: '.muxui-calendar', ColorArea: '.muxui-color-area', ColorField: '.muxui-color-field', ColorPicker: '.muxui-color-picker', ColorSlider: '.muxui-color-slider', ColorSwatch: '.muxui-color-swatch',
    ColorSwatchPicker: '.muxui-color-swatch-picker-item', ColorWheel: '.muxui-color-wheel', ComboBox: '.muxui-combo-box', GridList: '.muxui-grid-list', ListBox: '.muxui-list-box', Menu: '.muxui-menu-item',
    RadioGroup: '.muxui-radio-group', RangeCalendar: '.muxui-range-calendar', Select: '.muxui-select', Slider: '.muxui-slider', Table: '.muxui-table', Tabs: '.muxui-tabs', TagGroup: '.muxui-tag-group', Group: '.muxui-group',
    ToggleButtonGroup: '.muxui-toggle-button-group', Toolbar: '.muxui-toolbar', Tree: '.muxui-tree', Virtualizer: '.muxui-virtualizer', DropZone: '.muxui-drop-zone', FileTrigger: '.muxui-button',
    AlertDialog: '.muxui-alert-dialog', ButtonGroup: '.muxui-button-group', Card: '.muxui-card', CheckboxField: '.muxui-checkbox-field', ColorModeToggle: '.muxui-color-mode-toggle',
    Dialog: '.muxui-dialog', Popover: '.muxui-popover', PreviewTrigger: '.muxui-preview-trigger', CommandPalette: '.muxui-command-palette', HeaderNav: '.muxui-header-nav', InputTags: '.muxui-input-tags', Input: '.muxui-input', Lightbox: '.muxui-lightbox-trigger', Markdown: '.muxui-markdown',
    MultiSelect: '.muxui-multi-select', PaymentInput: '.muxui-payment-input', ProgressCircle: '.muxui-progress-circle', RadioField: '.muxui-radio-field', Resizable: '.muxui-resizable',
    Sidebar: '.muxui-sidebar', SwitchField: '.muxui-switch-field', TagSelect: '.muxui-tag-select', TextArea: '.muxui-text-area', TextEditor: '.muxui-text-editor', Toast: '.muxui-toast', TokenField: '.muxui-token-field', Tooltip: '.muxui-tooltip',
  };
  const tale = Object.fromEntries(Object.entries(mux).map(([familyName, selector]) => [familyName, selector.replaceAll('muxui-', 'tale-').replace('tale-combo-box', 'tale-combobox').replace('tale-color-swatch-picker-item', 'tale-color-swatch-picker__item').replace('tale-preview-trigger', 'tale-preview-card__trigger').replace('tale-tooltip', 'tale-tooltip__popup')]));
  tale.DisclosureGroup = '.tale-accordion';
  tale.AlertDialog = '.tale-alert-dialog__trigger';
  tale.CommandPalette = '.tale-command-palette__trigger';
  tale.Lightbox = '.tale-lightbox__trigger';
  const selector = (renderer === 'mux' ? mux : tale)[family];
  if (!selector) throw new Error(`finite replay facts has no target selector for ${renderer} ${family}`);
  return selector;
}

async function declaredPortalSelectors(page) {
  return page.evaluate(() => {
    const selectors = new Set();
    const add = (value) => {
      if (typeof value === 'string' && value.length > 0) selectors.add(value);
    };
    const provider = window.__coreMigration;
    for (const name of ['lifecycle', 'styleFacts']) {
      try {
        const value = provider?.[name]?.();
        add(value?.selector);
        for (const part of value?.parts ?? []) add(part?.selector);
      } catch {
        // A closed overlay can legitimately have no currently resolvable
        // named parts. The scoped action lookup still handles its trigger;
        // portal actions fail below unless the provider declares live roots.
      }
    }
    return [...selectors];
  });
}

async function visibleDeclaredPortalCount(page, selectors) {
  if (selectors.length === 0) return 0;
  return page.evaluate((declared) => {
    const visible = (element) => {
      if (!element || element.getClientRects().length === 0) return false;
      const styles = getComputedStyle(element);
      return styles.display !== 'none' && styles.visibility !== 'hidden';
    };
    const roots = new Set();
    for (const selector of declared) {
      try {
        for (const element of document.querySelectorAll(selector)) {
          if (visible(element)) roots.add(element);
        }
      } catch {
        // Providers own selector validity; malformed declarations are simply
        // not eligible portal roots and are reported as an absent target.
      }
    }
    return roots.size;
  }, selectors);
}

async function providerNeedsViewport(page, styleFacts, lifecycle, marker) {
  const selectors = [...new Set([
    styleFacts?.selector,
    ...(Array.isArray(styleFacts?.parts) ? styleFacts.parts.map((part) => part?.selector) : []),
    lifecycle?.selector,
  ].filter((selector) => typeof selector === 'string' && selector.length > 0))];
  if (selectors.length === 0) return false;
  return page.evaluate(({ declared, caseMarker }) => {
    const caseRoot = document.querySelector(caseMarker);
    const visible = (element) => {
      if (!element || element.getClientRects().length === 0) return false;
      const styles = getComputedStyle(element);
      return styles.display !== 'none' && styles.visibility !== 'hidden';
    };
    for (const selector of declared) {
      try {
        for (const element of document.querySelectorAll(selector)) {
          if (visible(element) && (!caseRoot || !caseRoot.contains(element))) return true;
        }
      } catch {
        // Provider declarations are authoritative, but an invalid selector
        // cannot authorize a viewport capture or hide a missing-part failure.
      }
    }
    return false;
  }, { declared: selectors, caseMarker: marker });
}

async function actionTargetForSelector(page, scope, selector) {
  const scoped = scope.locator(selector);
  const scopedCount = await scoped.count();
  if (scopedCount > 1) throw new Error(`finite action target is ambiguous inside case: ${selector}`);
  if (scopedCount === 1) return scoped;

  // Portal content is rendered outside the stable case marker. Resolve only
  // through selectors declared by the active renderer provider, and retain
  // one DOM node after deduplicating nested backdrop/popup roots.
  const declared = await declaredPortalSelectors(page);
  const candidates = page.locator(selector).filter({ visible: true });
  const allowedIndices = await candidates.evaluateAll((elements, rootSelectors) => {
    const visible = (element) => {
      if (!element || element.getClientRects().length === 0) return false;
      const styles = getComputedStyle(element);
      return styles.display !== 'none' && styles.visibility !== 'hidden';
    };
    const roots = new Set();
    for (const rootSelector of rootSelectors) {
      try {
        for (const root of document.querySelectorAll(rootSelector)) {
          if (visible(root)) roots.add(root);
        }
      } catch {
        // Invalid provider declarations are ignored and cannot authorize a
        // target outside the case.
      }
    }
    return elements
      .map((element, index) => roots.has(element) || [...roots].some((root) => root.contains(element)) ? index : -1)
      .filter((index) => index >= 0);
  }, declared);
  if (allowedIndices.length !== 1) throw new Error(`finite portal action target must resolve to one visible provider-declared element: ${selector}`);
  return candidates.nth(allowedIndices[0]);
}

async function actionTarget(scope) {
  const target = scope.locator('button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])').first();
  if (await target.count() !== 1) throw new Error('finite action target is absent');
  return target;
}

/**
 * Return the real keyboard owner and position for a listbox option. React
 * Aria uses either a combobox/search input with aria-activedescendant or a
 * focusable listbox owner; focusing the option itself bypasses that contract
 * and can close the popup through its focus-scope.
 */
async function listboxKeyboardContext(page, target) {
  return target.evaluate((element) => {
    const visible = (candidate) => {
      if (!candidate || candidate.getClientRects().length === 0) return false;
      const styles = getComputedStyle(candidate);
      return styles.display !== 'none' && styles.visibility !== 'hidden';
    };
    const option = element.matches('[role="option"]') ? element : element.closest('[role="option"]');
    const listbox = option?.closest('[role="listbox"]');
    if (!option || !listbox) return null;
    const options = [...listbox.querySelectorAll('[role="option"]')].filter((candidate) => visible(candidate)
      && candidate.getAttribute('aria-disabled') !== 'true'
      && candidate.getAttribute('data-disabled') !== 'true'
      && !candidate.disabled);
    const optionIndex = options.indexOf(option);
    if (optionIndex < 0) return null;
    const listboxId = listbox.id;
    const candidates = [...document.querySelectorAll('input, [role="combobox"], button[aria-haspopup="listbox"], [aria-controls]')]
      .filter((candidate) => candidate !== listbox && visible(candidate)
        && !candidate.disabled && candidate.getAttribute('aria-disabled') !== 'true');
    const related = candidates.filter((candidate) => {
      const controls = (candidate.getAttribute('aria-controls') ?? '').split(/\s+/u).filter(Boolean);
      if (listboxId && controls.includes(listboxId)) return true;
      const activeId = candidate.getAttribute('aria-activedescendant');
      const activeOption = activeId ? document.getElementById(activeId) : undefined;
      return Boolean(activeOption && activeOption.closest('[role="listbox"]') === listbox && options.includes(activeOption));
    });
    if (related.length > 1) return { ambiguous: true };
    return {
      optionIndex,
      listboxId,
      targetOptionId: option.id || null,
      ownerKind: related.length === 1 ? 'control' : 'listbox',
    };
  });
}

const listboxOwnerSelector = 'input:not([disabled]):not([aria-disabled="true"]), [role="combobox"]:not([disabled]):not([aria-disabled="true"]), button[aria-haspopup="listbox"]:not([disabled]):not([aria-disabled="true"]), [aria-controls]:not([disabled]):not([aria-disabled="true"])';

async function focusListboxItemWithKeyboard(page, target) {
  const context = await listboxKeyboardContext(page, target);
  if (!context) throw new Error('finite focus action requires an actual listbox option');
  if (context.ambiguous) throw new Error('finite focus action found multiple ARIA owners for its listbox option');
  const owner = context.ownerKind === 'listbox'
    ? target.locator('xpath=ancestor-or-self::*[@role="listbox"][1]')
    : page.locator(listboxOwnerSelector).filter({ visible: true });
  if (context.ownerKind === 'control') {
    const matchingOwners = await owner.evaluateAll((elements, { listboxId, targetOptionId }) => elements.map((candidate, index) => {
      const controls = (candidate.getAttribute('aria-controls') ?? '').split(/\s+/u).filter(Boolean);
      if (listboxId && controls.includes(listboxId)) return index;
      const activeId = candidate.getAttribute('aria-activedescendant');
      const activeOption = activeId ? document.getElementById(activeId) : undefined;
      const targetOption = targetOptionId ? document.getElementById(targetOptionId) : undefined;
      const listbox = activeOption?.closest('[role="listbox"]');
      const targetListbox = targetOption?.closest('[role="listbox"]');
      return activeOption && listbox && targetListbox && (listboxId ? listbox.id === listboxId : listbox === targetListbox) ? index : -1;
    }).filter((index) => index >= 0), context);
    if (matchingOwners.length !== 1) throw new Error('finite focus action could not re-resolve its unique ARIA keyboard owner');
    // Rebind through the same enabled/visible locator after relationship
    // matching so disabled controls cannot skew a positional owner index.
    return focusListboxOwner(page, target, owner.nth(matchingOwners[0]), context);
  }
  if (await owner.count() !== 1) throw new Error('finite listbox keyboard owner disappeared before focus action');
  return focusListboxOwner(page, target, owner, context);
}

async function focusListboxOwner(page, target, owner, context) {
  await owner.focus();

  // Arrow navigation is the RAC contract for aria-activedescendant and
  // roving listbox focus. Never Tab out of the owner or call option.focus():
  // either operation can dismiss a portal before its focused state is read.
  if (context.ownerKind === 'listbox') {
    // Focusing a roving listbox can establish its first item before the next
    // key event. Home makes that browser/RAC state explicit without touching
    // the option node, after which relative ArrowDown navigation is stable.
    await owner.press('Home');
    for (let index = 0; index < context.optionIndex; index += 1) await owner.press('ArrowDown');
  } else {
    const navigation = await target.evaluate((element) => {
      const option = element.matches('[role="option"]') ? element : element.closest('[role="option"]');
      const listbox = option?.closest('[role="listbox"]');
      if (!option || !listbox) return null;
      const visible = (candidate) => {
        if (!candidate || candidate.getClientRects().length === 0) return false;
        const styles = getComputedStyle(candidate);
        return styles.display !== 'none' && styles.visibility !== 'hidden';
      };
      const options = [...listbox.querySelectorAll('[role="option"]')].filter((candidate) => visible(candidate)
        && candidate.getAttribute('aria-disabled') !== 'true'
        && candidate.getAttribute('data-disabled') !== 'true'
        && !candidate.disabled);
      const activeId = document.activeElement?.getAttribute('aria-activedescendant');
      const activeOption = activeId ? document.getElementById(activeId) : undefined;
      return {
        optionIndex: options.indexOf(option),
        currentIndex: activeOption?.closest('[role="listbox"]') === listbox ? options.indexOf(activeOption) : -1,
      };
    });
    if (!navigation || navigation.optionIndex < 0) throw new Error('finite listbox option disappeared before keyboard navigation');
    const steps = navigation.currentIndex >= 0
      ? navigation.optionIndex - navigation.currentIndex
      : navigation.optionIndex + 1;
    if (steps === 0) {
      const cycleKey = navigation.optionIndex === 0 ? 'ArrowDown' : 'ArrowUp';
      const returnKey = navigation.optionIndex === 0 ? 'ArrowUp' : 'ArrowDown';
      await owner.press(cycleKey);
      await owner.press(returnKey);
    }
    const key = steps < 0 ? 'ArrowUp' : 'ArrowDown';
    if (steps !== 0) for (let index = 0; index < Math.abs(steps); index += 1) await owner.press(key);
  }
  await page.evaluate(() => new Promise((resolvePromise) => requestAnimationFrame(resolvePromise)));
  if (await target.count() !== 1) throw new Error('finite keyboard focus action closed or removed its listbox option');
}

async function applyAction(page, scope, scenario, renderer) {
  if (!scenario.action) return { release: async () => {}, status: 'none' };
  const action = typeof scenario.action === 'string' ? scenario.action : scenario.action.type;
  const selector = typeof scenario.action === 'object' ? scenario.action.selector : undefined;
  const actionValue = typeof scenario.action === 'object' ? scenario.action.value : undefined;
  let target = action === 'dismiss'
    ? null
    : action === 'drop'
      ? scope.locator(renderer === 'mux' ? '.muxui-drop-zone' : '.tale-drop-zone')
      : undefined;
  if (action === 'open-and-type') {
    const triggerSelector = typeof scenario.action === 'object' ? scenario.action.triggerSelector : undefined;
    if (!triggerSelector) throw new Error('finite open-and-type action requires triggerSelector');
    const trigger = await actionTargetForSelector(page, scope, triggerSelector);
    const expanded = await trigger.getAttribute('aria-expanded');
    const open = expanded === 'true' || await trigger.getAttribute('data-open') === 'true';
    if (!open) {
      await trigger.click();
      await page.evaluate(() => new Promise((resolvePromise) => requestAnimationFrame(() => requestAnimationFrame(resolvePromise))));
    }
    target = selector ? await actionTargetForSelector(page, scope, selector) : await actionTarget(scope);
  } else if (target === undefined) {
    target = selector ? await actionTargetForSelector(page, scope, selector) : await actionTarget(scope);
  }
  if (selector && await target.count() !== 1) throw new Error(`finite action target is absent: ${selector}`);
  if (action === 'focus') {
    const listboxContext = await listboxKeyboardContext(page, target);
    if (listboxContext) {
      await focusListboxItemWithKeyboard(page, target);
      return { release: async () => {}, status: 'keyboard-focused' };
    }
    // Establish keyboard modality explicitly before focusing so :focus-visible
    // is independent of whichever pointer action preceded this capture.
    await page.keyboard.press('Tab');
    await target.focus();
    return { release: async () => {}, status: 'applied' };
  }
  if (action === 'click') {
    await target.click();
    return { release: async () => {}, status: 'applied' };
  }
  if (action === 'type' || action === 'open-and-type') {
    if (typeof actionValue !== 'string') throw new Error(`finite ${action} action requires a string value`);
    await target.fill(actionValue);
    await settle(page);
    if (typeof scenario.action === 'object' && typeof scenario.action.expectValue === 'string') {
      const actualValue = await target.inputValue();
      if (actualValue !== scenario.action.expectValue) {
        throw new Error(`finite ${action} action expected input value ${JSON.stringify(scenario.action.expectValue)}, received ${JSON.stringify(actualValue)}`);
      }
    }
    if (typeof scenario.action === 'object' && typeof scenario.action.expectCardType === 'string') {
      const cardTypeTarget = scope.locator('[data-card-type]').first();
      if (await cardTypeTarget.count() !== 1) throw new Error('finite type action expected a card type marker');
      const actualCardType = await cardTypeTarget.getAttribute('data-card-type');
      if (actualCardType !== scenario.action.expectCardType) {
        throw new Error(`finite ${action} action expected card type ${JSON.stringify(scenario.action.expectCardType)}, received ${JSON.stringify(actualCardType)}`);
      }
    }
    const expectedVisible = typeof scenario.action === 'object' ? scenario.action.expectVisible ?? [] : [];
    const expectedHidden = typeof scenario.action === 'object' ? scenario.action.expectHidden ?? [] : [];
    const visibility = await page.evaluate(({ visible, hidden }) => {
      const textNodes = [...document.querySelectorAll('body *')].filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
      });
      const hasExact = (value) => textNodes.some((element) => element.children.length === 0 && element.textContent?.trim() === value);
      return { visible: visible.filter((value) => !hasExact(value)), hidden: hidden.filter((value) => hasExact(value)) };
    }, { visible: expectedVisible, hidden: expectedHidden });
    if (visibility.visible.length > 0) throw new Error(`finite action expected visible text missing: ${visibility.visible.join(', ')}`);
    if (visibility.hidden.length > 0) throw new Error(`finite action expected hidden text visible: ${visibility.hidden.join(', ')}`);
    return { release: async () => {}, status: 'applied' };
  }
  if (action === 'hover') {
    await target.hover({ force: true });
    return { release: async () => {}, status: 'applied' };
  }
  if (action === 'select-text') {
    const collapse = typeof scenario.action === 'object' && scenario.action.collapse === true;
    await target.evaluate((element, shouldCollapse) => {
      if (!(element instanceof HTMLElement)) throw new Error('finite selection target is not an element');
      element.focus();
      const selection = window.getSelection();
      if (!selection) throw new Error('finite selection API is unavailable');
      const range = document.createRange();
      range.selectNodeContents(element);
      if (shouldCollapse) range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    }, collapse);
    return { release: async () => {}, status: collapse ? 'collapsed' : 'selected' };
  }
  if (action === 'press') {
    await target.hover({ force: true });
    const box = await target.boundingBox();
    if (!box) throw new Error('finite pressed action target has no bounds');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    return { release: () => page.mouse.up(), status: 'applied' };
  }
  if (action === 'drop') {
    await target.evaluate((element) => {
      const dataTransfer = typeof DataTransfer === 'function' ? new DataTransfer() : { files: [], items: [], types: ['Files'] };
      element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
      element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    });
    return { release: async () => {}, status: 'applied' };
  }
  if (action === 'submit') {
    await scope.locator('form').evaluate((form) => form.requestSubmit());
    return { release: async () => {}, status: 'applied' };
  }
  if (action === 'dismiss') {
    const declared = await declaredPortalSelectors(page);
    const toastDismiss = page.locator(renderer === 'mux'
      ? '.muxui-toast-dismiss'
      : '.tale-toast [slot="close"], .tale-toast button[aria-label*="Dismiss" i]').filter({ visible: true });
    if (await toastDismiss.count() > 0) await toastDismiss.last().click();
    else if (await visibleDeclaredPortalCount(page, declared) === 0) {
      if (scenario.state === 'closing') throw new Error('finite closing lifecycle dismiss requires a visible declared portal precondition');
      const trigger = scope.locator('button, [role="button"], a[href]').first();
      if (await trigger.count() !== 1) throw new Error('finite dismiss trigger is absent');
      await trigger.click();
    } else await page.keyboard.press('Escape');
    return { release: async () => {}, status: 'applied' };
  }
  return { release: async () => {}, status: `unsupported:${action}` };
}

async function settle(page, { preserveMotion = false } = {}) {
  await page.evaluate(async ({ keepMotion }) => {
    await document.fonts.ready;
    await new Promise((resolvePromise) => requestAnimationFrame(() => requestAnimationFrame(resolvePromise)));
    document.getAnimations().forEach((animation) => {
      if (keepMotion) {
        animation.pause();
        const duration = animation.effect?.getComputedTiming?.().duration;
        if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
          // Keep lifecycle captures at a reproducible interior phase. Setting
          // a short animation to its duration silently captures the completed
          // state and can unmount an exiting overlay before validation.
          const interior = duration <= 2 ? duration / 2 : Math.min(duration - 1, Math.max(1, duration / 2));
          animation.currentTime = interior;
        }
      } else animation.cancel();
    });
  }, { keepMotion: preserveMotion });
}

async function motionFacts(page) {
  return page.evaluate(() => {
    const serialize = (value) => {
      if (typeof value === 'number') {
        if (Number.isFinite(value)) return value;
        if (value === Infinity) return 'infinite';
        if (value === -Infinity) return '-infinite';
        return 'nan';
      }
      if (Array.isArray(value)) return value.map(serialize);
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, serialize(entry)]));
      }
      return value;
    };
    return {
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      animations: document.getAnimations().map((animation) => {
        const target = animation.effect?.target;
        const timing = animation.effect?.getComputedTiming?.();
        const effectTiming = animation.effect?.getTiming?.();
        const keyframes = animation.effect?.getKeyframes?.();
        const computed = target ? getComputedStyle(target) : undefined;
        return {
          target: target && typeof target.className === 'string' ? target.className : target?.className?.baseVal ?? target?.tagName ?? null,
          animationName: computed?.animationName ?? null,
          transition: computed?.transition ?? null,
          timing: serialize(effectTiming ?? null),
          keyframes: serialize(keyframes ?? []),
          duration: timing?.duration ?? null,
          currentTime: typeof animation.currentTime === 'number' ? animation.currentTime : null,
          progress: timing?.progress ?? null,
          playState: animation.playState,
        };
      }),
    };
  });
}

async function lifecycleSample(page, descriptor) {
  if (!descriptor) return undefined;
  return page.evaluate((contract) => {
    const visible = (element) => {
      if (!element || element.getClientRects().length === 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const elements = [...document.querySelectorAll(contract.selector)];
    const visibleElements = elements.filter(visible);
    const markers = contract.marker?.filter((name) => visibleElements.some((element) => {
      const value = element.getAttribute(name);
      return value === '' || value === 'true';
    })) ?? [];
    const effects = visibleElements.flatMap((element) => element.getAnimations().map((animation) => {
      const timing = animation.effect?.getComputedTiming?.();
      return {
        target: typeof element.className === 'string' ? element.className : element.className?.baseVal ?? element.tagName,
        type: animation.effect?.constructor?.name ?? null,
        playState: animation.playState,
        currentTime: typeof animation.currentTime === 'number' ? animation.currentTime : null,
        duration: timing?.duration ?? null,
        progress: timing?.progress ?? null,
      };
    }));
    const transitions = visibleElements.map((element) => {
      const style = getComputedStyle(element);
      return {
        transition: style.transition,
        transitionDuration: style.transitionDuration,
        transitionProperty: style.transitionProperty,
        animationName: style.animationName,
        opacity: style.opacity,
        transform: style.transform,
      };
    });
    return {
      attached: elements.length > 0,
      attachedCount: elements.length,
      visible: visibleElements.length > 0,
      visibleCount: visibleElements.length,
      markers,
      effects,
      transitions,
    };
  }, descriptor);
}

async function finishLifecycleAnimations(page, descriptor) {
  if (!descriptor) return;
  await page.evaluate(async (contract) => {
    const animations = new Set();
    for (const element of document.querySelectorAll(contract.selector)) {
      // Finish only the owned overlay/backdrop effects. Descendant spinners
      // and content animations are separate evidence and must not be forced
      // to complete as part of lifecycle unmount proof.
      for (const animation of element.getAnimations()) animations.add(animation);
    }
    const finished = [];
    for (const animation of animations) {
      try {
        animation.finish();
        // React Aria unmounts an exiting overlay from the animation's
        // `finished` continuation. Await that browser-owned completion before
        // the post-phase absence check; two animation frames alone can race
        // the continuation and retain a visible, already-finished portal.
        finished.push(animation.finished);
      } catch {
        // An infinite or otherwise non-finishable animation remains evidence
        // for the post-phase lifecycle assertion instead of being fabricated
        // into a completed state.
      }
    }
    await Promise.allSettled(finished);
    await new Promise((resolvePromise) => queueMicrotask(resolvePromise));
  }, descriptor);
}

async function stableScreenshot(page, options) {
  let previous;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.evaluate(() => new Promise((resolvePromise) => requestAnimationFrame(() => requestAnimationFrame(resolvePromise))));
    const bytes = await page.screenshot(options);
    if (previous && bytes.equals(previous)) return bytes;
    previous = bytes;
  }
  throw new Error('finite capture screenshot did not stabilize within the bounded retry window');
}

async function facts(page, scope, styleFacts, renderer, current, allowAbsent = false) {
  if (!styleFacts || typeof styleFacts.selector !== 'string' || styleFacts.selector.length === 0) {
    throw new Error('finite replay facts require the provider-declared primary selector');
  }
  return page.evaluate(({ selector, rendererName, marker, permitAbsent }) => {
    const root = document.querySelector(marker);
    if (!root) throw new Error('finite replay facts root is missing');
    const target = root.matches(selector) ? root : root.querySelector(selector) ?? document.querySelector(selector);
    if (!target && !permitAbsent) throw new Error(`finite replay facts selector does not resolve: ${selector}`);
    if (!target) {
      const frameStyles = getComputedStyle(root);
      return {
        renderer: rendererName,
        root: { className: root.className, text: root.textContent?.trim().slice(0, 200), childCount: root.querySelectorAll('*').length },
        target: { selector, present: false, tagName: null, className: '', role: null, ariaExpanded: null, ariaDisabled: null, rect: null },
        computed: { boxSizing: frameStyles.boxSizing, fontFamily: frameStyles.fontFamily, fontSize: frameStyles.fontSize, lineHeight: frameStyles.lineHeight, color: frameStyles.color, backgroundColor: frameStyles.backgroundColor },
      };
    }
    const styles = target ? getComputedStyle(target) : undefined;
    return {
      renderer: rendererName,
      root: { className: root.className, text: root.textContent?.trim().slice(0, 200), childCount: root.querySelectorAll('*').length },
      target: { selector, tagName: target.tagName, className: target.className, role: target.getAttribute('role'), ariaExpanded: target.getAttribute('aria-expanded'), ariaDisabled: target.getAttribute('aria-disabled'), rect: target.getBoundingClientRect().toJSON() },
      computed: { boxSizing: styles.boxSizing, fontFamily: styles.fontFamily, fontSize: styles.fontSize, lineHeight: styles.lineHeight, color: styles.color, backgroundColor: styles.backgroundColor },
    };
  }, { selector: styleFacts.selector, rendererName: renderer, marker: renderer === 'mux' || current ? '[data-muxui-paired-case]' : '[data-migration-case]', permitAbsent: allowAbsent });
}

async function capture(page, baseUrl, scenario, mode, renderer, outputDir, current) {
  const runtimeErrors = [];
  const onPageError = (error) => runtimeErrors.push({ type: 'pageerror', message: error.stack ?? error.message });
  const onConsole = (message) => {
    if (message.type() === 'error') runtimeErrors.push({ type: 'console.error', message: message.text() });
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  let applied = { release: async () => {}, status: 'none' };
  try {
    const url = new URL('/', baseUrl);
    url.searchParams.set('case', scenario.id);
    url.searchParams.set('finite', '1');
    url.searchParams.set(current && renderer === 'donor' ? 'component' : 'family', scenario.family);
    url.searchParams.set('state', scenario.state);
    url.searchParams.set('mode', mode);
    url.searchParams.set('props', JSON.stringify(scenario.props));
    const preserveMotion = motionStates.has(String(scenario.state).toLowerCase());
    // Apply the per-case media policy before navigation so renderer setup and
    // any automatic opening action observe the intended preference from their
    // first render.
    await page.emulateMedia({ reducedMotion: preserveMotion ? 'no-preference' : 'reduce' });
    // Reset pointer state between captures so a prior hover/press cannot
    // change the next case's rendered state or screenshot.
    await page.mouse.move(0, 0);
    // Vite keeps the module graph open while local font assets are being served;
    // wait for the document commit and use the owned ready marker below for
    // actual renderer readiness.
    await page.goto(url.toString(), { waitUntil: 'commit' });
    const marker = renderer === 'mux' || current ? 'data-muxui-paired-case' : 'data-migration-case';
    const selector = `[${marker}="${cssEscape(scenario.id)}"]`;
    await page.waitForSelector(selector, { state: 'attached', timeout: timeoutMs });
    await page.waitForFunction(() => window.__coreMigration?.ready?.(), undefined, { timeout: timeoutMs });
    const fontProof = await assertLocalFonts(page, renderer);
    const scope = page.locator(selector);
    const lifecycle = await page.evaluate(() => window.__coreMigration?.lifecycle?.() ?? null);
    if (lifecycle?.kind === 'enter') {
      const initial = await lifecycleSample(page, lifecycle);
      if (initial?.visible && initial.attachedCount > 0) throw new Error(`${renderer} opening lifecycle precondition must begin without a visible portal`);
    } else if (lifecycle?.kind === 'exit') {
      // Closing must begin from a stable, visible overlay. Cancel only its
      // initial enter effects before the real dismiss action.
      const initial = await lifecycleSample(page, lifecycle);
      if (!initial?.visible || initial.attachedCount === 0) throw new Error(`${renderer} closing lifecycle precondition is missing a visible portal`);
      await settle(page);
    }
    applied = await applyAction(page, scope, scenario, renderer);
    if (applied.status.startsWith('unsupported:')) throw new Error(`unsupported finite action ${applied.status.slice('unsupported:'.length)}`);
    // React Aria removes its data-entering/data-exiting marker after using it
    // to start a CSS transition. Capture that short-lived marker or a live
    // transition effect immediately after the real action, before settling
    // the page for reproducible screenshot and fact capture.
    let lifecycleTriggered = lifecycle ? await lifecycleSample(page, lifecycle) : undefined;
    if (lifecycle && (lifecycle.kind === 'enter' || lifecycle.kind === 'exit')
      && (!lifecycleTriggered?.visible || (lifecycleTriggered.markers.length === 0 && lifecycleTriggered.effects.length === 0))) {
      await page.evaluate(() => new Promise((resolvePromise) => requestAnimationFrame(resolvePromise)));
      lifecycleTriggered = await lifecycleSample(page, lifecycle);
    }
    await settle(page, { preserveMotion });
    if (runtimeErrors.length > 0) {
      const error = new Error(`${renderer} runtime errors: ${runtimeErrors.map(({ message }) => message).join(' | ')}`);
      error.runtimeErrors = runtimeErrors;
      throw error;
    }
    const lifecycleBefore = await lifecycleSample(page, lifecycle);
    if (lifecycle?.kind === 'timer' && !lifecycleBefore?.visible) throw new Error(`${renderer} timed lifecycle did not reach its visible phase`);
    if (lifecycle?.kind === 'enter' && (!lifecycleTriggered?.visible || (lifecycleTriggered.markers.length === 0 && lifecycleTriggered.effects.length === 0))) throw new Error(`${renderer} opening lifecycle did not expose an enter marker or active transition: ${JSON.stringify(lifecycleTriggered)}`);
    if (lifecycle?.kind === 'exit' && (!lifecycleTriggered?.visible || (lifecycleTriggered.markers.length === 0 && lifecycleTriggered.effects.length === 0))) throw new Error(`${renderer} closing lifecycle did not expose an exit marker or active transition: ${JSON.stringify(lifecycleTriggered)}`);
    if (lifecycle?.kind === 'enter' && (!lifecycleBefore?.visible || lifecycleBefore.attachedCount === 0)) throw new Error(`${renderer} opening lifecycle did not remain present after its enter phase`);
    if (lifecycle?.kind === 'exit' && (!lifecycleBefore?.visible || lifecycleBefore.attachedCount === 0)) throw new Error(`${renderer} closing lifecycle did not remain present through capture`);
    let stateReached = lifecycle?.kind === 'timer' || lifecycle?.kind === 'enter' || lifecycle?.kind === 'exit' ? true : await page.evaluate(() => {
      const validator = window.__coreMigration?.state;
      if (typeof validator !== 'function') throw new Error('finite paired state validator is missing');
      const reached = validator();
      if (typeof reached !== 'boolean') throw new Error('finite paired state validator must return a boolean');
      return reached;
    });
    if (scenario.family === 'Toast' && scenario.action === 'dismiss') {
      const visibleToastCount = await page.locator(renderer === 'mux' ? '.muxui-toast' : '.tale-toast').evaluateAll((elements) => elements.filter((element) => {
        if (element.getClientRects().length === 0) return false;
        const styles = getComputedStyle(element);
        return styles.display !== 'none' && styles.visibility !== 'hidden';
      }).length);
      if (visibleToastCount > 0) stateReached = false;
    }
    const captureFailure = stateReached ? undefined : {
      renderer,
      kind: 'state-not-reached',
      scenario: scenario.id,
      mode,
      state: scenario.state,
      message: `${renderer} finite paired state was not reached`,
    };
    const motion = await motionFacts(page);
    let styleFacts;
    try {
      styleFacts = await page.evaluate(({ rendererName, currentRun }) => {
      const provider = window.__coreMigration?.styleFacts;
      if (typeof provider !== 'function') throw new Error(`${currentRun ? 'current' : rendererName} finite style facts provider is missing`);
      const value = provider();
      if (!value || typeof value !== 'object' || typeof value.selector !== 'string' || value.selector.length === 0 || !value.properties || typeof value.properties !== 'object' || Object.keys(value.properties).length === 0) {
        throw new Error(`${currentRun ? 'current' : rendererName} finite style facts must name a CSS selector and computed properties`);
      }
      const root = document.querySelector('[data-muxui-paired-case], [data-migration-case]');
      const selectors = [value.selector, ...(Array.isArray(value.parts) ? value.parts.map((part) => part?.selector) : [])];
      for (const selector of selectors) {
        if (typeof selector !== 'string' || selector.length === 0) throw new Error(`${rendererName} finite style facts contain an unnamed part`);
        let target;
        try {
          target = (root?.matches(selector) ? root : root?.querySelector(selector)) ?? document.querySelector(selector);
        } catch (error) {
          throw new Error(`${rendererName} finite style facts selector is invalid: ${selector} (${error instanceof Error ? error.message : String(error)})`);
        }
        if (!target) throw new Error(`${rendererName} finite style facts selector does not resolve: ${selector}`);
      }
      return value;
      }, { rendererName: renderer, currentRun: current });
    } catch (error) {
      const dismissedToast = scenario.family === 'Toast' && scenario.action === 'dismiss';
      if (!dismissedToast) throw error;
      styleFacts = await page.evaluate(({ selector, rendererName }) => {
        const root = document.querySelector('[data-muxui-paired-case], [data-migration-case]');
        if (!root) throw new Error(`${rendererName} dismissed toast frame is missing`);
        const frameStyles = getComputedStyle(root);
        const visibleCount = [...document.querySelectorAll(selector)].filter((element) => {
          if (element.getClientRects().length === 0) return false;
          const styles = getComputedStyle(element);
          return styles.display !== 'none' && styles.visibility !== 'hidden';
        }).length;
        return {
          selector,
          tagName: null,
          className: '',
          role: null,
          aria: {},
          rect: null,
          properties: {
            boxSizing: frameStyles.boxSizing,
            display: frameStyles.display,
            fontFamily: frameStyles.fontFamily,
            fontSize: frameStyles.fontSize,
            lineHeight: frameStyles.lineHeight,
            color: frameStyles.color,
            backgroundColor: frameStyles.backgroundColor,
          },
          observed: { present: visibleCount > 0, count: visibleCount },
          frameContextStyle: true,
        };
      }, { selector: targetSelector(scenario.family, renderer), rendererName: renderer });
    }
    const useViewport = await providerNeedsViewport(page, styleFacts, lifecycle, `[${marker}="${cssEscape(scenario.id)}"]`);
    let bytes;
    if (useViewport) bytes = await stableScreenshot(page, { animations: preserveMotion ? 'allow' : 'disabled' });
    else {
      const box = await scope.boundingBox();
      if (!box) throw new Error('finite paired case has no capture bounds');
      bytes = await stableScreenshot(page, { animations: preserveMotion ? 'allow' : 'disabled', clip: { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) } });
    }
    // Facts describe the same visible DOM that produced the screenshot.
    // Lifecycle proof may finish an animation or unmount its overlay, so
    // snapshot the named parts before advancing that lifecycle.
    const capturedFacts = await facts(page, scope, styleFacts, renderer, current, scenario.family === 'Toast' && scenario.action === 'dismiss');
    const actualNamedAnatomyParts = Object.fromEntries((Array.isArray(styleFacts.parts) && styleFacts.parts.length > 0 ? styleFacts.parts : [styleFacts])
      .map((part) => [part.name ?? part.selector, part]));
    let lifecycleProof = null;
    if (lifecycle?.kind === 'timer') {
      const timeout = Number.isFinite(Number(scenario.props?.duration)) ? Number(scenario.props.duration) : 5000;
      if (timeout <= 0) throw new Error(`${renderer} timed lifecycle requires a positive timeout`);
      if (typeof page.clock?.fastForward !== 'function') throw new Error('timed lifecycle requires Playwright clock fastForward support');
      await page.clock.fastForward(timeout + 50);
      await page.evaluate(() => new Promise((resolvePromise) => requestAnimationFrame(() => requestAnimationFrame(resolvePromise))));
      const after = await lifecycleSample(page, lifecycle);
      if (after?.visible) throw new Error(`${renderer} timed lifecycle remained visible after its timeout`);
      if (lifecycle.after === 'absent' && after?.attachedCount !== 0) throw new Error(`${renderer} timed lifecycle remained attached after its timeout`);
      lifecycleProof = { contract: lifecycle, trigger: lifecycleTriggered, before: lifecycleBefore, after, timeout };
    } else if (lifecycle?.kind === 'enter') {
      await finishLifecycleAnimations(page, lifecycle);
      await page.evaluate(() => new Promise((resolvePromise) => requestAnimationFrame(() => requestAnimationFrame(resolvePromise))));
      const after = await lifecycleSample(page, lifecycle);
      if (!after?.visible || after.attachedCount === 0) throw new Error(`${renderer} opening lifecycle did not remain present after its enter phase`);
      lifecycleProof = { contract: lifecycle, trigger: lifecycleTriggered, before: lifecycleBefore, after };
    } else if (lifecycle?.kind === 'exit') {
      await finishLifecycleAnimations(page, lifecycle);
      await page.evaluate(() => new Promise((resolvePromise) => requestAnimationFrame(() => requestAnimationFrame(resolvePromise))));
      const after = await lifecycleSample(page, lifecycle);
      if (after?.visible) throw new Error(`${renderer} closing lifecycle remained visible after its exit phase`);
      if (lifecycle.after === 'absent' && after?.attachedCount !== 0) throw new Error(`${renderer} closing lifecycle remained attached after its exit phase`);
      lifecycleProof = { contract: lifecycle, trigger: lifecycleTriggered, before: lifecycleBefore, after };
    }
    const captureId = `${scenario.id}--${mode}`;
    await mkdir(resolve(outputDir, renderer), { recursive: true });
    const absolutePath = resolve(outputDir, renderer, `${captureId}.png`);
    await writeFile(absolutePath, bytes);
    const artifact = artifactRecord(`${renderer}/${captureId}.png`, bytes);
    const replayFacts = {
      styleFacts,
      facts: capturedFacts,
      actualNamedAnatomyParts,
      fonts: fontProof,
      motion,
      lifecycle: lifecycleProof ? {
        contract: lifecycleProof.contract,
        before: lifecycleProof.before && {
          attached: lifecycleProof.before.attached,
          attachedCount: lifecycleProof.before.attachedCount,
          visible: lifecycleProof.before.visible,
          visibleCount: lifecycleProof.before.visibleCount,
          markers: lifecycleProof.before.markers,
        },
        after: lifecycleProof.after && {
          attached: lifecycleProof.after.attached,
          attachedCount: lifecycleProof.after.attachedCount,
          visible: lifecycleProof.after.visible,
          visibleCount: lifecycleProof.after.visibleCount,
          markers: lifecycleProof.after.markers,
        },
        ...(lifecycleProof.timeout === undefined ? {} : { timeout: lifecycleProof.timeout }),
      } : null,
      rawPNG: { sha256: artifact.sha256, width: PNG.sync.read(bytes).width, height: PNG.sync.read(bytes).height },
    };
    assertReplayFactShape(replayFacts, `${renderer} finite replay facts`);
    return { renderer, captureId, artifact, stateReached, failure: captureFailure, action: applied.status, fonts: fontProof, motion, lifecycle: lifecycleProof, runtimeErrors, facts: capturedFacts, styleFacts, replayFacts, width: replayFacts.rawPNG.width, height: replayFacts.rawPNG.height };
  } catch (error) {
    if (runtimeErrors.length > 0 && error && typeof error === 'object' && !('runtimeErrors' in error)) error.runtimeErrors = runtimeErrors;
    throw error;
  } finally {
    await applied.release();
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
  }
}

function comparePngBytes(donorBytes, muxBytes) {
  const donor = PNG.sync.read(donorBytes);
  const mux = PNG.sync.read(muxBytes);
  if (donor.width !== mux.width || donor.height !== mux.height) return { pass: false, reason: 'dimension-mismatch', donor: { width: donor.width, height: donor.height }, mux: { width: mux.width, height: mux.height } };
  const diff = new PNG({ width: donor.width, height: donor.height });
  const mismatchedPixels = pixelmatch(donor.data, mux.data, diff.data, donor.width, donor.height, { threshold: 0.1 });
  let rawDifferentPixels = 0;
  let maxChannelDelta = 0;
  for (let index = 0; index < donor.data.length; index += 4) {
    let different = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(donor.data[index + channel] - mux.data[index + channel]);
      if (delta > 0) different = true;
      if (delta > maxChannelDelta) maxChannelDelta = delta;
    }
    if (different) rawDifferentPixels += 1;
  }
  return { pass: mismatchedPixels === 0, mismatchedPixels, diffPixelRatio: mismatchedPixels / (donor.width * donor.height), rawDifferentPixels, maxChannelDelta };
}

async function main() {
  const cliArguments = process.argv.slice(2);
  validateRunnerArguments(cliArguments);
  if (cliArguments.includes('--help')) {
    printRunnerHelp();
    return;
  }
  const outputDir = resolve(argument('--output-dir', '/private/tmp/muxui-r1-6-finite-paired'));
  const familyFilter = argument('--family');
  const scenarioFilter = argument('--scenario');
  const modeFilter = argument('--mode');
  const limit = Number(argument('--limit', '0'));
  const muxOnly = hasFlag('--mux-only');
  if (!Number.isInteger(limit) || limit < 0) throw new Error('--limit must be a nonnegative integer');
  const finite = JSON.parse(await readFile(finiteFixturePath, 'utf8'));
  const allScenarios = finiteScenarios(finite, familyFilter, current);
  const filteredScenarios = scenarioFilter ? allScenarios.filter(({ id }) => id === scenarioFilter) : allScenarios;
  const scenarios = limit > 0 ? filteredScenarios.slice(0, limit) : filteredScenarios;
  const modes = modeFilter ? [modeFilter] : ['light', 'dark'];
  const strict = hasFlag('--strict') || hasFlag('--require-reference');
  const diagnostic = hasFlag('--diagnostic');
  const limitedCoverage = Boolean(familyFilter || scenarioFilter || limit > 0);
  if (familyFilter && allScenarios.length === 0) throw new Error(`no finite family matched ${familyFilter}`);
  if (scenarioFilter && filteredScenarios.length === 0) throw new Error(`no finite scenario matched ${scenarioFilter}`);
  if (scenarios.length === 0) throw new Error(`no finite scenarios matched ${familyFilter ?? 'the inventory'}`);
  if (modes.some((mode) => !FINITE_CAPTURE_MODES.includes(mode))) throw new Error(`finite capture mode must be one of ${FINITE_CAPTURE_MODES.join(', ')}`);
  if (current) assertCurrentInventory(finite, scenarios, familyFilter, limit > 0 || Boolean(scenarioFilter));
  let referencePath;
  let referenceReport;
  if (muxOnly) {
    await assertMuxOnlyRuntimeClosure({ rootDirectory: repositoryRoot, entryPaths: [finiteMuxEntryPath] });
    referencePath = argument('--reference-report');
    if (hasFlag('--require-reference') && !referencePath) throw new Error('Mux-only replay requires --reference-report');
    if (referencePath) {
      referencePath = resolve(referencePath);
      if (resolve(outputDir) === dirname(referencePath)) throw new Error('Mux-only output directory must differ from the retained reference report directory');
      referenceReport = JSON.parse(await readFile(referencePath, 'utf8'));
      assertFiniteReportSchema(referenceReport);
      if (referenceReport.sourceIntegrity?.stable !== true || referenceReport.sourceIntegrity?.invalidatedSource === true) throw new Error('Mux-only reference report has invalidated capture inputs');
      const expectedSource = current ? 'current-r1-6' : 'historical-fixed-53';
      if (referenceReport.inventory?.source !== expectedSource) throw new Error(`Mux-only reference report must be a ${expectedSource} report`);
      assertFiniteInventory({ scenarios, modes, results: referenceReport.results });
      assertPinnedFiniteDonor(referenceReport.donor);
    }
  }
  await mkdir(outputDir, { recursive: true });
  const executablePath = await browserExecutable();
  let donorMetadata;
  let tale;
  let taleTemporary;
  let finiteEntryRoot;
  if (!muxOnly) {
    const { assertPinnedTaleCheckout, startTaleServer, writeTemporaryApp } = await import('../visual-migration/bootstrap/r1-6-finite-bootstrap.mjs');
    const { createFiniteDonorEntrySource } = await import('../visual-migration/bootstrap/r1-6-finite-donor-entry.mjs');
    const { pinnedDonor } = await import('../visual-migration/bootstrap/donor-adapter.mjs');
    const taleRoot = resolve(argument('--tale-root', '/Users/admin/Projects/tale-ui/tale-ui'));
    const taleIdentity = await assertPinnedTaleCheckout(taleRoot);
    finiteEntryRoot = current ? undefined : await mkdtemp('/tmp/muxui-r1-6-finite-entry-');
    const finiteEntryPath = current
      ? currentTaleEntryPath
      : resolve(finiteEntryRoot, 'donor-entry.mjs');
    if (!current) {
      const sealedDonorEntry = await readFile(taleEntryPath, 'utf8');
      await writeFile(finiteEntryPath, createFiniteDonorEntrySource(sealedDonorEntry, { appRoot }));
    }
    taleTemporary = await writeTemporaryApp(finiteEntryPath, { fontSourceRoot: resolve(repositoryRoot, 'packages/react/assets/fonts') });
    tale = await startTaleServer(taleRoot, taleTemporary.temporaryRoot, { repositoryRoot });
    donorMetadata = { ...PINNED_FINITE_DONOR, ...pinnedDonor, tree: taleIdentity.tree };
    assertPinnedFiniteDonor(donorMetadata);
  }
  const mux = await startMuxServer();
  const browser = await chromium.launch({ headless: true, executablePath });
  const environment = {
    platform: process.platform,
    osBuild: osVersion(),
    osRelease: osRelease(),
    architecture: osArch(),
    browser: { executablePath, version: browser.version() },
    viewport: migrationFrame.viewport,
    deviceScaleFactor: migrationFrame.deviceScaleFactor,
    reducedMotion: 'per-case',
    motionStates: [...motionStates],
  };
  const bindingBefore = await captureBinding(finite, scenarios, current, environment);
  if (muxOnly && referenceReport) {
    assertReferenceBinding(referenceReport.binding, bindingBefore, {
      requiredPaths: ['runtime', 'sourceInput', 'tool', 'fonts', 'browser'],
    });
  }
  const context = await browser.newContext({ viewport: migrationFrame.viewport, deviceScaleFactor: migrationFrame.deviceScaleFactor, colorScheme: 'light' });
  if (tale) await context.grantPermissions([], { origin: tale.url });
  await context.grantPermissions([], { origin: mux.url });
  const blockedRequests = [];
  const allowedOrigins = [mux.url, ...(tale ? [tale.url] : [])];
  await context.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (!muxOnly && requestUrl.hostname === 'fonts.googleapis.com') {
      await route.fulfill({ status: 200, contentType: 'text/css', body: localFontStyles(tale.url) });
    } else if (requestUrl.hostname === host && requestUrl.pathname.startsWith('/mux-fonts/')) {
      const file = decodeURIComponent(requestUrl.pathname.slice('/mux-fonts/'.length));
      const font = localFontFaces.find((candidate) => candidate.file === file);
      if (!font) {
        blockedRequests.push(requestUrl.toString());
        await route.abort();
      } else await route.fulfill({
        status: 200,
        contentType: 'font/ttf',
        headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
        body: readFileSync(resolve(repositoryRoot, 'packages/react/assets/fonts', file)),
      });
    } else if (requestUrl.protocol === 'data:' || allowedOrigins.includes(requestUrl.origin)) await route.continue();
    else {
      blockedRequests.push(requestUrl.toString());
      await route.abort();
    }
  });
  await context.clock.install({ time: '2026-08-26T00:00:00.000Z' });
  await context.pages()[0]?.close();
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`[finite paired pageerror] ${error.stack ?? error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[finite paired console] ${message.text()}`);
  });
  page.on('requestfailed', (request) => console.error(`[finite paired requestfailed] ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`));
  page.on('response', (response) => {
    if (response.status() >= 400) console.error(`[finite paired response] ${response.status()} ${response.url()}`);
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const results = [];
  const reportPath = resolve(outputDir, 'report.json');
  let bindingAfter;
  let sourceIntegrity = {
    before: bindingBefore,
    after: null,
    stable: null,
    invalidatedSource: false,
    differences: [],
  };
  let requestValidationError;
  const currentReport = () => ({
    schema: FINITE_CAPTURE_REPORT_SCHEMA,
    purpose: muxOnly
      ? 'Current finite Mux-only replay diagnostic; donor comparison facts are consumed only from an explicit one-time paired report.'
      : 'Current finite donor/Mux browser evidence; historical migration captures remain sealed separately.',
    environment,
    binding: bindingAfter ?? bindingBefore,
    sourceIntegrity,
    diagnosticMode: diagnostic,
    donor: donorMetadata ?? null,
    replay: muxOnly ? { renderer: 'mux', blockedRequests, referenceReport: referencePath ?? null } : undefined,
    inventory: {
      requested: scenarios.length,
      modes,
      captureCount: results.length,
      complete: results.length === scenarios.length * modes.length,
      familyFilter: familyFilter ?? null,
      scenarioFilter: scenarioFilter ?? null,
      coverage: limitedCoverage ? 'limited' : 'full',
      source: current ? 'current-r1-6' : 'historical-fixed-53',
      noApplicableDonor: current ? [] : noApplicableDonorFamilies,
      muxOnly,
    },
    results,
    summary: {
      errors: results.filter((result) => result.error).length,
      thresholdEqual: results.filter((result) => result.comparison?.pass).length,
      thresholdDifferent: results.filter((result) => result.comparison && !result.comparison.pass).length,
      exactEqual: results.filter((result) => result.comparison && result.comparison.rawDifferentPixels === 0).length,
      stateFailures: results.filter((result) => result.donor?.stateReached === false || result.mux?.stateReached === false).length,
      replayFailures: results.filter((result) => result.replay?.status === 'failed').length,
      blockedRequests: blockedRequests.length,
      unclassifiedFailures: results.filter((result) => result.error || result.comparison && (!result.comparison.pass || result.comparison.rawDifferentPixels > 0) || result.replay?.status === 'failed').length,
      sourceInvalidated: sourceIntegrity.invalidatedSource,
      status: results.some((result) => result.error || result.replay?.status === 'failed' || result.comparison && (!result.comparison.pass || result.comparison.rawDifferentPixels > 0) || result.mux?.failure || result.donor?.failure)
        || sourceIntegrity.invalidatedSource || blockedRequests.length > 0
        ? 'diagnostic-mismatch'
        : limitedCoverage ? 'limited-diagnostic' : 'passed',
    },
  });
  const persistReport = async () => writeFile(reportPath, `${JSON.stringify(currentReport(), null, 2)}\n`);
  await persistReport();
  try {
    for (const scenario of scenarios) {
      for (const mode of modes) {
        const base = {
          scenario: scenario.id,
          family: scenario.reportFamily,
          rendererFamily: scenario.family,
          state: scenario.state,
          mode,
          source: scenario.source,
          evidence: scenario.evidence,
          input: { props: scenario.props, action: scenario.action ?? null },
        };
        let muxCapture;
        let donorCapture;
        try {
          muxCapture = await capture(page, mux.url, scenario, mode, 'mux', outputDir, current);
          if (muxOnly) {
            const reference = referenceReport?.results?.find((candidate) => candidate.scenario === scenario.id && candidate.mode === mode);
            if (hasFlag('--require-reference') && (!reference?.mux?.artifact || !reference.mux.replayFacts)) throw new Error(`missing retained Mux proof for ${scenario.id}/${mode}`);
            if (blockedRequests.length > 0) throw new Error(`Mux-only replay blocked external requests: ${blockedRequests.join(', ')}`);
            const replayComparison = reference ? compareStrictReplayFacts(reference.mux.replayFacts, muxCapture.replayFacts) : undefined;
            let screenshotComparison;
            if (reference?.mux?.artifact) {
              try {
                const retained = await readRetainedArtifact(dirname(referencePath), reference.mux.artifact.path, reference.mux.artifact.sha256);
                const actual = await readRetainedArtifact(outputDir, muxCapture.artifact.path, muxCapture.artifact.sha256);
                screenshotComparison = comparePngBytes(retained.bytes, actual.bytes);
              } catch (error) {
                screenshotComparison = { pass: false, reason: `retained Mux screenshot could not be read: ${error instanceof Error ? error.message : String(error)}` };
              }
            }
            const screenshotPass = Boolean(screenshotComparison?.pass && screenshotComparison.rawDifferentPixels === 0 && !screenshotComparison.reason);
            const replayPass = Boolean(reference && replayComparison?.pass && screenshotPass);
            results.push({
              ...base,
              mux: muxCapture,
              reference: reference ? { donor: reference.donor?.replayFacts ?? null, mux: reference.mux.replayFacts, comparison: reference.comparison ?? null, report: referencePath } : undefined,
              comparison: screenshotComparison ? { ...screenshotComparison, classification: screenshotComparison.pass && screenshotComparison.rawDifferentPixels === 0 ? 'equivalent' : 'unclassified' } : undefined,
              replay: { status: reference ? (replayPass ? 'passed' : 'failed') : 'diagnostic', facts: replayComparison, screenshot: screenshotComparison },
            });
          } else {
            donorCapture = await capture(page, tale.url, scenario, mode, 'donor', outputDir, current);
            const donorBytes = await readRetainedArtifact(outputDir, donorCapture.artifact.path, donorCapture.artifact.sha256);
            const muxBytes = await readRetainedArtifact(outputDir, muxCapture.artifact.path, muxCapture.artifact.sha256);
            const comparison = comparePngBytes(donorBytes.bytes, muxBytes.bytes);
            results.push({ ...base, donor: donorCapture, mux: muxCapture, comparison });
          }
          await persistReport();
          const result = results.at(-1);
          const comparison = result.comparison;
          console.log(muxOnly
            ? `${result.replay?.status === 'failed' ? '✗' : '✓'} ${scenario.id}/${mode} mux-only ${result.replay?.status ?? 'diagnostic'}`
            : `${comparison.pass ? '✓' : '✗'} ${scenario.id}/${mode} ${comparison.pass ? 'threshold-equal' : `${comparison.mismatchedPixels ?? comparison.reason} threshold differences`}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const bodyPreview = await page.locator('body').textContent().catch(() => '');
          results.push({ ...base, ...(muxCapture ? { mux: muxCapture } : {}), ...(donorCapture ? { donor: donorCapture } : {}), rendererFailure: donorCapture ? undefined : muxCapture ? 'donor' : 'mux', error: message, runtimeErrors: error?.runtimeErrors ?? [], bodyPreview: bodyPreview?.slice(0, 500) });
          await persistReport();
          console.error(`! ${scenario.id}/${mode}: ${message}${bodyPreview ? ` [body: ${bodyPreview.slice(0, 240)}]` : ''}`);
        }
      }
    }
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    await mux.server.close();
    if (tale) await tale.server.close();
    await rm(mux.temporaryRoot, { recursive: true, force: true });
    if (taleTemporary) await rm(taleTemporary.temporaryRoot, { recursive: true, force: true });
    if (finiteEntryRoot) await rm(finiteEntryRoot, { recursive: true, force: true });
  }
  try {
    bindingAfter = await captureBinding(finite, scenarios, current, environment);
    const fingerprint = assertStableCaptureFingerprint(bindingBefore, bindingAfter);
    sourceIntegrity = { ...sourceIntegrity, after: bindingAfter, ...fingerprint };
  } catch (error) {
    const fingerprint = { stable: false, invalidatedSource: true, differences: [error instanceof Error ? error.message : String(error)] };
    sourceIntegrity = { ...sourceIntegrity, after: bindingAfter ?? null, ...fingerprint };
  }
  try {
    assertAllowedRequests(blockedRequests, [mux.url, ...(tale ? [tale.url] : [])]);
  } catch (error) {
    requestValidationError = error instanceof Error ? error.message : String(error);
  }
  assertFiniteInventory({ scenarios, modes, results });
  const report = currentReport();
  await persistReport();
  console.log(`Finite ${muxOnly ? 'Mux-only replay' : 'paired capture'} wrote ${results.length} case/mode records to ${outputDir}; threshold-equal ${report.summary.thresholdEqual}, threshold-different ${report.summary.thresholdDifferent}, exact-equal ${report.summary.exactEqual}, errors ${report.summary.errors}.`);
  if (requestValidationError) console.error(requestValidationError);
  if (report.summary.errors > 0 || report.summary.stateFailures > 0 || report.summary.replayFailures > 0 || report.summary.blockedRequests > 0 || report.summary.sourceInvalidated || requestValidationError || strict && (report.summary.unclassifiedFailures > 0 || (muxOnly && !referenceReport))) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
