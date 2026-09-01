import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import {
  applicableMigrationRecords,
  canonicalStateCoverage,
  compatibilityStateCoverage,
  migrationCases,
  migrationFrame,
  migrationStoryId,
  noApplicableDonorFamilies,
  stateCoverage,
  supplementalStateCoverage,
} from '../../src/visual-migration-contract.mjs';
import { fixtureContractSha256, historicalCaseIdentity, historicalRuntimeFixtureSha256, sha256, taleStyleInventoryPath, taleStyleInventorySha256 } from '../../src/visual-migration.mjs';
import {
  donorActionFor,
  donorAdapterSourcePath,
  donorCaptureSourcePath,
  donorEntrySourcePath,
  donorRenderPlanSourcePath,
  donorSemanticSelectors,
  fixtureMapSourcePath,
  pinnedDonor,
} from './donor-adapter.mjs';

const execFileAsync = promisify(execFile);
const appRoot = resolve(import.meta.dirname, '../..');
const appRequire = createRequire(import.meta.url);
const expectedCommit = pinnedDonor.commit;
const host = '127.0.0.1';
const timeoutMs = 30_000;

/**
 * Keep the donor image comparable to the accessible Core palette without
 * changing Tale runtime behavior. These selectors are intentionally limited
 * to the private migration fixture and are injected only during capture.
 */
const donorAccessibilityNormalization = Object.freeze({
  darkInvalidLabel: `
html[data-color-mode='dark'] .migration-component .tale-date-field[data-invalid] .tale-date-field__label,
html[data-color-mode='dark'] .migration-component .tale-date-picker[data-invalid] .tale-date-picker__label,
html[data-color-mode='dark'] .migration-component .tale-date-range-picker[data-invalid] .tale-date-range-picker__label,
html[data-color-mode='dark'] .migration-component .tale-number-field[data-invalid] .tale-number-field__label,
html[data-color-mode='dark'] .migration-component .tale-search-field[data-invalid] .tale-search-field__label,
html[data-color-mode='dark'] .migration-component .tale-text-field[data-invalid] .tale-text-field__label,
html[data-color-mode='dark'] .migration-component .tale-time-field[data-invalid] .tale-time-field__label {
  color: #e59796;
}`,
  selectPlaceholder: `
html[data-color-mode='light'] .migration-component .tale-select__value[data-placeholder] {
  color: #5f5954;
}

html[data-color-mode='dark'] .migration-component .tale-select__value[data-placeholder] {
  color: #918b86;
}`,
  dropZone: `
html[data-color-mode='light'] .migration-component .tale-drop-zone:not([data-drop-target]) {
  color: #5f5954;
}

html[data-color-mode='dark'] .migration-component .tale-drop-zone:not([data-drop-target]) {
  color: #918b86;
}`,
});

const donorAccessibilityNormalizationCss = [
  '/* Donor-capture-only WCAG normalization: preserve Tale geometry and behavior. */',
  donorAccessibilityNormalization.darkInvalidLabel,
  donorAccessibilityNormalization.selectPlaceholder,
  donorAccessibilityNormalization.dropZone,
].join('\n');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`${name} is required for the one-time Tale bootstrap`);
  return value;
}

async function git(taleRoot, args) {
  const { stdout } = await execFileAsync('git', ['-C', taleRoot, ...args], { timeout: 10_000 });
  return String(stdout).trim();
}

async function assertPinnedTaleCheckout(taleRoot) {
  const commit = await git(taleRoot, ['rev-parse', 'HEAD']);
  if (commit !== expectedCommit) throw new Error(`Tale checkout must be pinned to ${expectedCommit}, got ${commit}`);
  const status = await git(taleRoot, ['status', '--porcelain']);
  if (status) throw new Error('Tale checkout must be clean before the one-time capture');
  const tree = await git(taleRoot, ['rev-parse', `${expectedCommit}^{tree}`]);
  const { stdout: sourceArchive } = await execFileAsync('git', ['-C', taleRoot, 'archive', '--format=tar', expectedCommit, 'packages/react', 'packages/styles', 'packages/css', 'packages/utils'], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024, timeout: 30_000 });
  return { commit, tree, sourceSha256: sha256(sourceArchive) };
}

async function browserPath() {
  const candidates = [
    process.env.CORE_UI_CHROME_EXECUTABLE,
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
      // Continue through the explicit capture-environment candidates.
    }
  }
  throw new Error('Chrome or Chromium is required for the pinned Tale capture');
}

function importPathFor(family) {
  if (family === 'ComboBox') return 'combobox';
  if (family === 'PreviewTrigger') return 'preview-card';
  if (family === 'RadioGroup') return 'radio-group';
  return family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function taleAliases(taleRoot) {
  const taleRequire = createRequire(resolve(taleRoot, 'packages/react/package.json'));
  const internationalizedDatePath = resolve(dirname(taleRequire.resolve('@internationalized/date')), 'index.mjs');
  const taleReactSource = resolve(taleRoot, 'packages/react/src');
  const utilsPath = resolve(taleRoot, 'packages/utils/src');
  const lucidePath = taleRequire.resolve('lucide-react');
  const coreReactPath = appRequire.resolve('react');
  const coreReactDomClientPath = appRequire.resolve('react-dom/client');
  return [
    { find: /^react$/, replacement: coreReactPath },
    { find: /^react-dom\/client$/, replacement: coreReactDomClientPath },
    { find: /^@tale-ui\/react$/, replacement: `${taleReactSource}/index.ts` },
    { find: /^@tale-ui\/react\/(.*)$/, replacement: `${taleReactSource}/$1/index.ts` },
    { find: /^@tale-ui\/react-styles$/, replacement: resolve(taleRoot, 'packages/styles/src/index.css') },
    { find: /^@tale-ui\/css$/, replacement: resolve(taleRoot, 'packages/css/src/index.css') },
    { find: /^@tale-ui\/utils\/(.*)$/, replacement: `${utilsPath}/$1.ts` },
    { find: /^@internationalized\/date$/, replacement: internationalizedDatePath },
    { find: /^lucide-react$/, replacement: lucidePath },
  ];
}

async function startTaleServer(taleRoot, temporaryRoot) {
  const server = await createServer({
    root: temporaryRoot,
    resolve: { alias: taleAliases(taleRoot), dedupe: ['react', 'react-dom'] },
    server: { host, port: 0, strictPort: false, fs: { allow: [temporaryRoot, appRoot, taleRoot] } },
    optimizeDeps: { noDiscovery: false, include: ['react', 'react-dom/client', '@internationalized/date'] },
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address !== 'object') throw new Error('Tale bootstrap could not reserve a local server port');
  return { server, url: `http://${host}:${address.port}` };
}

async function writeTemporaryApp(entrySource, taleRoot) {
  const temporaryRoot = await mkdtemp('/tmp/core-ui-tale-visual-');
  const entryUrl = `/@fs/${entrySource}`;
  await writeFile(resolve(temporaryRoot, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>${migrationStoryId}</title><style>html, body { margin: 0; padding: 0; font-family: system-ui; }</style></head><body><main id="root"></main><script type="module" src="${entryUrl}"></script></body></html>\n`);
  return { temporaryRoot, taleRoot };
}

async function waitForCapture(page, entry) {
  await page.waitForFunction((expectedId) => document.querySelector(`[data-migration-case="${expectedId}"]`) && window.__coreMigration?.ready?.(), entry.id, { timeout: timeoutMs });
}

async function waitForState(page, entry) {
  await page.waitForFunction(() => window.__coreMigration?.ready?.() && window.__coreMigration?.state?.(), undefined, { timeout: timeoutMs });
}

async function stableScreenshot(page, options, caseId) {
  let previous;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // Virtualizer layout and portal placement can complete on a later frame
    // when this page is reused for the full ordered capture inventory. Only
    // emit a capture after two consecutive rendered frames are byte-identical.
    await page.evaluate(() => new Promise((resolvePromise) => requestAnimationFrame(() => requestAnimationFrame(resolvePromise))));
    const bytes = await page.screenshot(options);
    if (previous && bytes.equals(previous)) return bytes;
    previous = bytes;
  }
  throw new Error(`${caseId}: Tale semantic region did not settle to a reproducible screenshot`);
}

async function actionTarget(scope, selector) {
  if (selector === '.migration-component') {
    const target = scope.locator('button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])').first();
    if (await target.count() !== 1) throw new Error('canonical action scope has no interactive Tale target');
    return target;
  }
  const target = scope.locator(selector);
  if (await target.count() !== 1) throw new Error(`canonical Tale action selector did not resolve exactly once: ${selector}`);
  return target;
}

async function applyAction(page, scope, entry) {
  const action = donorActionFor(entry);
  if (!action) return () => {};
  const target = action.type === 'drop-target'
    ? scope.locator('.tale-drop-zone')
    : await actionTarget(scope, action.selector);
  if (await target.count() !== 1) throw new Error(`${entry.id}: canonical Tale action target did not resolve exactly once`);
  if (action.type === 'focus') {
    // Reset Chromium's input-modality state before a programmatic focus. This
    // keeps :focus-visible deterministic when one page captures many cases;
    // the background click is outside the padded semantic region.
    await page.mouse.click(0, 0);
    await page.keyboard.press('Tab');
    await target.focus();
    return () => {};
  }
  if (action.type === 'pressed') {
    await target.hover({ force: true });
    const box = await target.boundingBox();
    if (!box) throw new Error(`${entry.id}: Tale action target has no bounds`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    return () => page.mouse.up();
  }
  if (action.type === 'open') {
    await target.click();
    if (entry.component === 'ComboBox') await page.keyboard.press('ArrowDown');
    return () => {};
  }
  if (action.type === 'drop-target') {
    await target.evaluate((element) => {
      const dataTransfer = new DataTransfer();
      element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
      element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    });
    return () => {};
  }
  throw new Error(`unsupported canonical Tale action ${action.type}`);
}

async function captureOne(page, baseUrl, entry, mode, outputDir) {
  const url = new URL('/', baseUrl);
  url.searchParams.set('case', entry.id);
  url.searchParams.set('mode', mode);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: donorAccessibilityNormalizationCss });
  await page.evaluate(({ frame, scheme }) => {
    document.documentElement.dataset.reducedMotion = 'true';
    document.documentElement.dataset.colorMode = scheme;
    document.documentElement.style.fontFamily = frame.fontFamily;
    document.body.style.fontFamily = frame.fontFamily;
    document.body.style.background = frame.background[scheme];
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) throw new Error('Tale capture did not enforce reduced motion');
    if (!getComputedStyle(document.documentElement).fontFamily.includes(frame.fontFamily)) throw new Error(`Tale capture did not enforce ${frame.fontFamily}`);
  }, { frame: migrationFrame, scheme: mode });
  if (page.viewportSize()?.width !== migrationFrame.viewport.width || page.viewportSize()?.height !== migrationFrame.viewport.height) throw new Error(`${entry.id}: Tale viewport differs from canonical fixture frame`);
  await waitForCapture(page, entry);
  const scope = page.locator(`[data-migration-case="${entry.id}"]`);
  if (await scope.count() !== 1) throw new Error(`${entry.id}: Tale semantic case selector did not resolve exactly once`);
  const release = await applyAction(page, scope, entry);
  try {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolvePromise) => requestAnimationFrame(resolvePromise));
      document.getAnimations().forEach((animation) => animation.cancel());
    });
    await waitForState(page, entry);
    const selectors = donorSemanticSelectors(entry.component, entry.state);
    for (const selector of selectors.requiredSelectors) {
      if (await page.locator(selector).count() < 1) throw new Error(`${entry.id}: required Tale semantic part is absent: ${selector}`);
    }
    let bytes;
    if (selectors.capture === 'viewport') bytes = await stableScreenshot(page, { animations: 'disabled' }, entry.id);
    else {
      const box = await scope.boundingBox();
      if (!box) throw new Error(`${entry.id}: Tale semantic region has no bounds`);
      if (entry.component === 'Virtualizer') {
        const viewport = entry.fixture.frame.virtualizer;
        if (!viewport || Math.round(box.width) !== viewport.width || Math.round(box.height) !== viewport.height) {
          throw new Error(`${entry.id}: Tale Virtualizer semantic region must match the fixed migration viewport`);
        }
      }
      bytes = await stableScreenshot(page, { animations: 'disabled', clip: { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) } }, entry.id);
    }
    const styleFacts = await page.evaluate(() => window.__coreMigration.styleFacts());
    const captureId = `${entry.id}--${mode}`;
    await writeFile(resolve(outputDir, `${captureId}.png`), bytes);
    return {
      captureId,
      caseId: entry.id,
      component: entry.component,
      state: entry.state,
      mode,
      sha256: sha256(bytes),
      fixtureContractSha256: fixtureContractSha256(entry.fixture),
      runtimeFixtureSha256: historicalRuntimeFixtureSha256(entry),
      donorSource: donorEntrySourcePath,
      semanticRegion: selectors,
      action: donorActionFor(entry),
      equivalentPart: { selector: styleFacts.selector, properties: styleFacts.properties },
    };
  } finally {
    await release();
  }
}

async function main() {
  const taleRoot = resolve(requiredArgument('--tale-root'));
  const outputDir = resolve(requiredArgument('--output-dir'));
  const metadataPath = resolve(argument('--metadata', `${outputDir}.metadata.json`));
  const selectedCaseId = argument('--case');
  const taleIdentity = await assertPinnedTaleCheckout(taleRoot);
  await mkdir(outputDir, { recursive: true });
  const entrySource = await readFile(resolve(appRoot, donorEntrySourcePath));
  const adapterSource = await readFile(resolve(appRoot, donorAdapterSourcePath));
  const captureSource = await readFile(resolve(appRoot, donorCaptureSourcePath));
  const renderPlanSource = await readFile(resolve(appRoot, donorRenderPlanSourcePath));
  const fixtureMapSource = await readFile(resolve(appRoot, fixtureMapSourcePath));
  const temporary = await writeTemporaryApp(resolve(appRoot, donorEntrySourcePath), taleRoot);
  let started;
  let browser;
  try {
    started = await startTaleServer(taleRoot, temporary.temporaryRoot);
    const executablePath = await browserPath();
    browser = await chromium.launch({ headless: true, executablePath });
    const manifest = JSON.parse(await readFile(resolve(appRoot, 'visual-migration/manifest.json'), 'utf8'));
    const context = await browser.newContext({
      viewport: migrationFrame.viewport,
      deviceScaleFactor: migrationFrame.deviceScaleFactor,
      colorScheme: 'light',
      timezoneId: manifest.capture.clock.timezone,
    });
    await context.clock.install({ time: manifest.capture.clock.time });
    await context.grantPermissions([], { origin: started.url });
    await context.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.protocol === 'data:' || ['127.0.0.1', 'localhost'].includes(requestUrl.hostname)) await route.continue();
      else await route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error(`[Tale browser pageerror] ${error.stack ?? error.message}`));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const captures = [];
    const entries = selectedCaseId
      ? migrationCases.filter(({ id }) => id === selectedCaseId)
      : migrationCases;
    if (entries.length === 0) throw new Error(`unknown canonical migration case: ${selectedCaseId}`);
    for (const entry of entries) {
      for (const mode of ['light', 'dark']) {
        const captured = await captureOne(page, started.url, entry, mode, outputDir);
        captures.push(captured);
      }
    }
    await context.close();
    const expectedIds = entries.flatMap(({ id }) => ['light', 'dark'].map((mode) => `${id}--${mode}`));
    if (captures.length !== expectedIds.length || captures.some(({ captureId }, index) => captureId !== expectedIds[index])) throw new Error('Tale capture inventory does not match the canonical ordered fixture inventory');
    const fixtureCaseSha256 = fixtureContractSha256(migrationCases.map(({ id, component, state, fixture, action, region }) => ({
      id,
      component,
      state,
      fixture,
      action: historicalCaseIdentity(action),
      region: historicalCaseIdentity(region),
    })));
    const metadata = {
      schema: 'core-ui-react-visual-migration-donor-capture-v2',
      donor: pinnedDonor,
      tale: { rootSupplied: true, commit: taleIdentity.commit, tree: taleIdentity.tree, sourceSha256: taleIdentity.sourceSha256 },
      frame: migrationFrame,
      coverage: { applicableFamilyCount: applicableMigrationRecords.length, noApplicableDonor: noApplicableDonorFamilies, caseCount: entries.length, captureCount: captures.length, complete: !selectedCaseId, canonicalStateCount: canonicalStateCoverage.length, compatibilityStateCount: compatibilityStateCoverage.length, supplementalStateCount: supplementalStateCoverage.length, stateCoverageCount: stateCoverage.length, stateDispositions: Object.fromEntries([...new Set(stateCoverage.map(({ disposition }) => disposition))].sort().map((disposition) => [disposition, stateCoverage.filter((entry) => entry.disposition === disposition).length])) },
      styleInventory: { path: taleStyleInventoryPath, sha256: taleStyleInventorySha256 },
      fixtureContractSha256: fixtureCaseSha256,
      adapterSourceSha256: sha256(adapterSource),
      entrySourceSha256: sha256(entrySource),
      captureSourceSha256: sha256(captureSource),
      renderPlanSourceSha256: sha256(renderPlanSource),
      fixtureMapSourceSha256: sha256(fixtureMapSource),
      browser: { executable: executablePath, executableSha256: sha256(await readFile(executablePath)) },
      caseCount: entries.length,
      captureCount: captures.length,
      captures,
    };
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(`Captured ${captures.length} pinned Tale PNGs for ${migrationCases.length} semantic cases from ${taleIdentity.commit}.`);
  } finally {
    await browser?.close();
    await started?.server.close();
    await rm(temporary.temporaryRoot, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(`Pinned Tale visual capture failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
