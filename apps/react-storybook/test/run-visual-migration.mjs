import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import {
  appRoot,
  activateVisualMigrationArtifacts,
  assertCaptureEnvironment,
  assertVisualMigrationSnapshotPaths,
  captureEnvironmentMismatches,
  comparePngs,
  compareStyleFacts,
  buildComparisonReport,
  readManifest,
  recoverVisualMigrationActivation,
  resultFilePath,
  sha256,
  baselineRootDirectory,
  muxuiCaptureProvenancePath,
  muxuiCaptureRunnerSourcePath,
  fixtureMapSourcePath,
  expectedCaptureInventory,
  materializeSnapshotDirectory,
  snapshotDirectoryForHashes,
  updateManifestIdentity,
  jsonSha256,
  validateSealedComparison,
  validateManifest,
  validateSnapshotFiles,
  expectedSettling,
  expectedCaptureClock,
} from '../src/visual-migration.mjs';
import { migrationCases } from '../src/visual-migration-contract.mjs';

const host = '127.0.0.1';
const serverTimeoutMs = 90_000;
const storyTimeoutMs = 15_000;
const execFileAsync = promisify(execFile);

function browserCandidates() {
  return [
    process.env.MUXUI_CHROME_EXECUTABLE,
    process.env.CHROME_BIN,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/google-chrome',
  ].filter(Boolean);
}

async function findBrowser() {
  for (const candidate of browserCandidates()) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known browser location.
    }
  }
  return undefined;
}

async function currentCaptureEnvironment(executablePath) {
  let versionOutput;
  try {
    ({ stdout: versionOutput } = await execFileAsync(executablePath, ['--version'], { timeout: 5_000 }));
  } catch (error) {
    throw new Error(`could not inspect Chrome executable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const version = String(versionOutput).match(/\d+\.\d+\.\d+\.\d+/u)?.[0];
  const name = String(versionOutput).trim().startsWith('Google Chrome') ? 'Google Chrome' : String(versionOutput).trim().split(/\s+/u)[0];
  let osVersion;
  let osBuildVersion;
  if (process.platform === 'darwin') {
    try {
      ({ stdout: osVersion } = await execFileAsync('/usr/bin/sw_vers', ['-productVersion'], { timeout: 5_000 }));
      ({ stdout: osBuildVersion } = await execFileAsync('/usr/bin/sw_vers', ['-buildVersion'], { timeout: 5_000 }));
      osVersion = String(osVersion).trim();
      osBuildVersion = String(osBuildVersion).trim();
    } catch {
      // The mismatch report below will identify an unavailable OS identity.
    }
  }
  return {
    browser: {
      name,
      version,
      executableSha256: sha256(await readFile(executablePath)),
    },
    platform: process.platform,
    architecture: process.arch,
    osVersion,
    osBuildVersion,
    clock: expectedCaptureClock,
  };
}

async function reservePort() {
  const server = createServer();
  try {
    await new Promise((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen({ host, port: 0 }, resolvePromise);
    });
    const address = server.address();
    if (!address || typeof address !== 'object') throw new Error('could not determine the Storybook port');
    return address.port;
  } finally {
    if (server.listening) {
      await new Promise((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()));
      });
    }
  }
}

function outputBuffer() {
  const chunks = [];
  return {
    append(chunk) {
      chunks.push(String(chunk));
      if (chunks.length > 80) chunks.shift();
    },
    read() {
      return chunks.join('').trim();
    },
  };
}

function terminateProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolvePromise) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolvePromise();
    };
    child.once('exit', settle);
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!settled) {
        child.kill('SIGKILL');
        child.once('exit', settle);
        setTimeout(settle, 1_000).unref();
      }
    }, 5_000).unref();
  });
}

async function removeOwnedDiagnosticDirectory(path) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error('visual migration diagnostic directory became a symbolic link');
    await rm(path, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function startStorybook(port, runToken) {
  const stdout = outputBuffer();
  const stderr = outputBuffer();
  const child = spawn(resolve(appRoot, 'node_modules/.bin/storybook'), [
    'dev',
    '--ci',
    '--host',
    host,
    '--port',
    String(port),
  ], {
    cwd: appRoot,
    env: {
      ...process.env,
      BROWSER: 'none',
      VITE_MUXUI_MIGRATION_RUN_TOKEN: runToken,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let spawnError;
  child.once('error', (error) => {
    spawnError = error;
  });
  child.stdout.on('data', (chunk) => stdout.append(chunk));
  child.stderr.on('data', (chunk) => stderr.append(chunk));

  const baseUrl = `http://${host}:${port}`;
  const deadline = Date.now() + serverTimeoutMs;
  let exit;
  const exited = new Promise((resolvePromise) => {
    child.once('exit', (code, signal) => {
      exit = { code, signal };
      resolvePromise();
    });
  });

  try {
    while (Date.now() < deadline) {
      if (spawnError) throw new Error(`could not start Mux UI Storybook: ${spawnError.message}`);
      if (exit) throw new Error(`Mux UI Storybook exited before readiness (code ${exit.code ?? 'null'}, signal ${exit.signal ?? 'null'})`);
      try {
        const response = await fetch(`${baseUrl}/index.json`, { signal: AbortSignal.timeout(1_000) });
        if (response.ok) {
          const index = await response.json();
          if (index?.entries && typeof index.entries === 'object') return { child, baseUrl };
        }
      } catch {
        // Storybook may still be compiling or restarting its Vite server.
      }
      await Promise.race([
        new Promise((resolvePromise) => setTimeout(resolvePromise, 100)),
        exited,
      ]);
    }
    throw new Error(`Mux UI Storybook did not become ready within ${serverTimeoutMs}ms\n${stderr.read()}\n${stdout.read()}`);
  } catch (error) {
    await terminateProcess(child);
    throw error;
  }
}

export function visualMigrationStoryReady({ expectedScheme, expectedToken, expectedCaseSelector, documentRoot = document }) {
  const root = documentRoot.querySelector('#storybook-root');
  const surface = documentRoot.querySelector('.muxui-storybook-surface');
  const migrationRoot = documentRoot.querySelector('[data-muxui-migration-run-token]');
  const error = documentRoot.querySelector('.sb-errordisplay');
  const preparing = documentRoot.querySelector('.sb-preparing-story');
  const visible = (element) => {
    if (!element) return false;
    const style = documentRoot.defaultView?.getComputedStyle?.(element) ?? getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };
  return Boolean(root?.firstElementChild)
    && Boolean(surface)
    && migrationRoot?.getAttribute('data-muxui-migration-run-token') === expectedToken
    && documentRoot.documentElement.getAttribute('data-muxui-color-scheme') === expectedScheme
    && documentRoot.querySelectorAll(expectedCaseSelector).length === 1
    && !visible(error)
    && !visible(preparing);
}

async function waitForStory(page, scheme, runToken, caseSelector) {
  try {
    await page.waitForFunction(visualMigrationStoryReady, {
      expectedScheme: scheme,
      expectedToken: runToken,
      expectedCaseSelector: caseSelector,
    }, { timeout: storyTimeoutMs });
  } catch (error) {
    const diagnostic = await page.evaluate((expectedCaseSelector) => ({
      token: document.querySelector('[data-muxui-migration-run-token]')?.getAttribute('data-muxui-migration-run-token'),
      scheme: document.documentElement.getAttribute('data-muxui-color-scheme'),
      caseCount: document.querySelectorAll(expectedCaseSelector).length,
      cases: [...document.querySelectorAll('[data-muxui-migration-case]')].map((element) => element.getAttribute('data-muxui-migration-case')),
      error: document.querySelector('#error-message')?.textContent,
      stack: document.querySelector('#error-stack')?.textContent,
    }), caseSelector).catch(() => ({}));
    const observedCases = diagnostic.cases?.length > 0 ? `; observed cases: ${diagnostic.cases.join(', ')}` : '';
    throw new Error(`${error instanceof Error ? error.message : String(error)} (expected case count: ${diagnostic.caseCount ?? 'unknown'}${observedCases})${diagnostic.error || diagnostic.stack ? ` (${diagnostic.error ?? diagnostic.stack})` : ''}`);
  }
}

async function settleAnimations(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.getAnimations().forEach((animation) => animation.cancel());
    await new Promise((resolvePromise) => requestAnimationFrame(() => requestAnimationFrame(resolvePromise)));
  });
}

async function applyAction(page, scope, entry) {
  if (!entry.action) return () => {};
  const target = entry.action.type === 'drop-target'
    ? scope.locator('.muxui-drop-zone')
    : entry.action.selector === '.migration-component'
    ? scope.locator('button:not([tabindex="-1"]):not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="button"]:not([tabindex="-1"]):not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])').first()
    : scope.locator(entry.action.selector);
  if (await target.count() !== 1) throw new Error(`action selector did not resolve exactly once: ${entry.action.selector}`);
  if ((entry.action.type === 'focus' || entry.action.type === 'pressed') && !(await target.first().evaluate((element) => element.matches('button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')))) throw new Error(`action target is not interactive: ${entry.action.selector}`);
  if (entry.action.type === 'hover') {
    await target.hover({ force: true });
    return () => {};
  }
  if (entry.action.type === 'focus') {
    await page.mouse.click(0, 0);
    await page.keyboard.press('Tab');
    await target.focus();
    return () => {};
  }
  if (entry.action.type === 'pressed') {
    await target.hover({ force: true });
    const box = await target.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    return () => page.mouse.up();
  }
  if (entry.action.type === 'open') {
    if (await target.getAttribute('aria-expanded') === 'true') return () => {};
    await target.click();
    return () => {};
  }
  if (entry.action.type === 'drop-target') {
    await target.evaluate((element) => {
      const dataTransfer = new DataTransfer();
      element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
      element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    });
    return () => {};
  }
  throw new Error(`unsupported visual migration action ${entry.action.type}`);
}

async function assertRequiredParts(page, scope, entry) {
  const root = entry.region.capture === 'viewport' ? page : scope;
  for (const selector of entry.region.requiredSelectors) {
    if (await root.locator(selector).count() < 1) throw new Error(`${entry.id}: required semantic part is absent: ${selector}`);
  }
}

async function assertStateReached(page, scope, entry) {
  if (entry.state === 'idle') return;
  try {
    await page.waitForFunction(({ selector, state, component }) => {
    const root = document.querySelector(selector);
    if (!root) return false;
    const descendants = [root, ...root.querySelectorAll('*')];
    const has = (predicate) => descendants.some(predicate);
    const attributeTrue = (element, name) => element.getAttribute(name) === 'true' || element.hasAttribute(name);
    switch (state) {
      case 'focused':
        return root.contains(document.activeElement) && document.activeElement !== document.body;
      case 'pressed':
        return has((element) => attributeTrue(element, 'data-pressed') || element.getAttribute('aria-pressed') === 'true' || element.matches(':active'));
      case 'selected':
        return has((element) => attributeTrue(element, 'data-selected') || element.getAttribute('aria-selected') === 'true' || element.getAttribute('aria-checked') === 'true' || element.checked === true)
          || Boolean(root.querySelector('input[role="combobox"]')?.value || root.querySelector('.muxui-select-value')?.textContent?.trim());
      case 'invalid':
        return has((element) => attributeTrue(element, 'data-invalid') || element.getAttribute('aria-invalid') === 'true');
      case 'open':
        return has((element) => attributeTrue(element, 'data-open') || element.getAttribute('aria-expanded') === 'true')
          || Boolean(document.querySelector('.muxui-dialog, .muxui-popover, .muxui-preview-trigger, .muxui-tooltip, .muxui-date-popover, .muxui-combo-box-popover, .muxui-select-popover'));
      case 'expanded':
        return has((element) => attributeTrue(element, 'data-expanded') || element.getAttribute('aria-expanded') === 'true');
      case 'drop-target':
        return has((element) => attributeTrue(element, 'data-dragging') || attributeTrue(element, 'data-drop-target'));
      case 'indeterminate':
        return has((element) => attributeTrue(element, 'data-indeterminate') || element.indeterminate === true || element.getAttribute('aria-valuenow') === null && element.getAttribute('aria-valuetext')?.toLowerCase().includes('indeterminate'));
      case 'vertical':
        return has((element) => element.getAttribute('aria-orientation') === 'vertical' || element.getAttribute('data-orientation') === 'vertical')
          || [...root.querySelectorAll('*')].some((element) => getComputedStyle(element).flexDirection === 'column');
      default:
        return Boolean(component);
    }
    }, { selector: entry.selector, state: entry.state, component: entry.component }, { timeout: storyTimeoutMs });
  } catch (error) {
    throw new Error(`${entry.id}: state assertion did not observe ${entry.state}`, { cause: error });
  }
}

async function readStyleFacts(scope, styleFacts) {
  return scope.evaluate((element, facts) => {
    const target = element.querySelector(facts.selector);
    if (!target) throw new Error(`style selector did not resolve: ${facts.selector}`);
    const styles = getComputedStyle(target, facts.pseudo);
    return Object.fromEntries(Object.keys(facts.properties).map((property) => [property, styles[property]]));
  }, styleFacts);
}

function storyUrl(baseUrl, storyId, storyQuery, colorScheme, caseId) {
  const url = new URL('/iframe.html', `${baseUrl}/`);
  url.searchParams.set('id', storyId);
  url.searchParams.set('viewMode', 'story');
  url.searchParams.set('globals', `colorScheme:${colorScheme}`);
  for (const [key, value] of Object.entries(storyQuery)) url.searchParams.set(key, value);
  url.searchParams.set('muxui-migration-case', caseId);
  return url;
}

async function writeFailure(entry, failure, actualBytes, styleFacts, diagnosticRoot) {
  if (!diagnosticRoot) throw new Error('visual migration diagnostics require an owned temporary directory');
  if (actualBytes) await writeFile(resultFilePath(entry.id, 'actual.png', { root: diagnosticRoot }), actualBytes);
  if (failure.diffBytes) await writeFile(resultFilePath(entry.id, 'diff.png', { root: diagnosticRoot }), failure.diffBytes);
  if (styleFacts) await writeFile(resultFilePath(entry.id, 'style.json', { root: diagnosticRoot }), `${JSON.stringify(styleFacts, null, 2)}\n`);
  await writeFile(resultFilePath(entry.id, 'error.txt', { root: diagnosticRoot }), `${failure.message}\n`);
}

async function captureCase(page, baseUrl, manifest, entry, mode, runToken) {
  const canonical = migrationCases.find(({ id }) => id === entry.id);
  if (!canonical || entry.selector !== canonical.selector || JSON.stringify(entry.action) !== JSON.stringify(canonical.action) || JSON.stringify(entry.region) !== JSON.stringify(canonical.region)) throw new Error(`${entry.id}: mutable manifest action/selector/region is not the canonical fixture contract`);
  await page.goto(storyUrl(baseUrl, manifest.storyId, manifest.storyQuery, mode, entry.id).toString(), {
    waitUntil: 'domcontentloaded',
  });
  await page.evaluate(({ scheme, frame }) => {
    document.documentElement.setAttribute('data-reduced-motion', 'true');
    document.documentElement.setAttribute('data-muxui-color-scheme', scheme);
    document.documentElement.style.setProperty('--muxui-migration-frame-background', scheme === 'dark' ? '#000000' : '#ffffff');
    document.documentElement.style.fontFamily = frame.fontFamily;
    document.body.style.fontFamily = frame.fontFamily;
    document.body.style.backgroundColor = frame.background[scheme];
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) throw new Error('capture did not enforce reduced motion');
    if (!getComputedStyle(document.documentElement).fontFamily.includes(frame.fontFamily)) throw new Error(`capture did not enforce declared font ${frame.fontFamily}`);
  }, { scheme: mode, frame: manifest.fixtureContract.frame });
  const viewport = page.viewportSize();
  if (viewport?.width !== manifest.capture.viewport.width || viewport?.height !== manifest.capture.viewport.height) throw new Error(`${entry.id}: capture viewport does not match the shared frame`);
  await waitForStory(page, mode, runToken, canonical.selector);
  if (entry.region.capture === 'viewport') {
    // Match the pinned donor's standalone document frame for portal captures.
    // Component captures clip their semantic root, so their Storybook host
    // must retain its intrinsic sizing context.
    await page.evaluate(() => {
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      for (const element of document.querySelectorAll('#storybook-root, .muxui-storybook-surface, .sb-main-padded')) {
        element.style.margin = '0';
        element.style.padding = '0';
      }
    });
  }
  const scope = page.locator(canonical.selector);
  if (await scope.count() !== 1) throw new Error(`case selector did not resolve exactly once: ${canonical.selector}`);
  const release = await applyAction(page, scope, canonical);
  try {
    await settleAnimations(page);
    await assertStateReached(page, scope, canonical);
    await assertRequiredParts(page, scope, canonical);
    let actualBytes;
    if (entry.region.capture === 'viewport') actualBytes = await page.screenshot({ animations: 'disabled' });
    else {
      const box = await scope.boundingBox();
      if (!box) throw new Error(`${entry.id}: Mux UI semantic region has no bounds`);
      if (entry.component === 'Virtualizer') {
        const viewport = manifest.fixtureContract.frame.virtualizer;
        if (!viewport || Math.round(box.width) !== viewport.width || Math.round(box.height) !== viewport.height) {
          throw new Error(`${entry.id}: Mux UI Virtualizer semantic region must match the fixed migration viewport`);
        }
      }
      actualBytes = await page.screenshot({ animations: 'disabled', clip: { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) } });
    }
    const actualStyleFacts = await readStyleFacts(scope, entry.styleFacts);
    const equivalentRoot = entry.region.capture === 'viewport' ? page.locator('body') : scope;
    const actualEquivalentPartFacts = await readStyleFacts(equivalentRoot, entry.equivalentPartFacts.muxui);
    return { actualBytes, actualStyleFacts, actualEquivalentPartFacts };
  } finally {
    await release();
  }
}

async function compareCase(page, baseUrl, manifest, entry, mode, runToken, diagnosticRoot) {
  const { actualBytes, actualStyleFacts, actualEquivalentPartFacts } = await captureCase(page, baseUrl, manifest, entry, mode, runToken);
  const expectedBytes = await readFile(resolve(appRoot, entry.baseline[mode].path));
  const pixels = comparePngs(expectedBytes, actualBytes, manifest.thresholds);
  const styleMismatches = compareStyleFacts(actualStyleFacts, entry.styleFacts);
  const equivalentPartMismatches = compareStyleFacts(actualEquivalentPartFacts, entry.equivalentPartFacts.muxui);
  if (!pixels.pass || styleMismatches.length > 0 || equivalentPartMismatches.length > 0) {
    const reason = [
      !pixels.pass && `${pixels.mismatchedPixels} pixels differ (${(pixels.diffPixelRatio * 100).toFixed(3)}%)`,
      styleMismatches.length > 0 && `style facts differ: ${styleMismatches.join('; ')}`,
      equivalentPartMismatches.length > 0 && `equivalent-part style facts differ: ${equivalentPartMismatches.join('; ')}`,
    ].filter(Boolean).join('; ');
    const failure = { ...pixels, message: `${entry.id}: ${reason}` };
    await writeFailure({ ...entry, id: `${entry.id}-${mode}` }, failure, actualBytes, {
      expected: entry.styleFacts,
      actual: actualStyleFacts,
      mismatches: styleMismatches,
      equivalentPart: { expected: entry.equivalentPartFacts.muxui, actual: actualEquivalentPartFacts, mismatches: equivalentPartMismatches },
    }, diagnosticRoot);
    return { pass: false, message: reason };
  }
  return { pass: true, message: `${pixels.mismatchedPixels} differing pixels` };
}

async function prepareUpdatedSnapshot(manifest, captures, captureEnvironment, muxuiCaptureRunnerSourceSha256) {
  const hashes = [];
  for (const entry of manifest.cases) {
    for (const mode of manifest.capture.modes) {
      const captured = captures.get(`${entry.id}--${mode}`);
      if (!captured) throw new Error(`update did not capture pinned case ${entry.id}/${mode}`);
      hashes.push(sha256(captured.actualBytes));
    }
  }

  const snapshotDirectory = snapshotDirectoryForHashes(hashes);
  const snapshotPath = resolve(appRoot, snapshotDirectory);
  const nextManifest = updateManifestIdentity(manifest, {
    baselineSha256: hashes,
    capture: captureEnvironment,
    muxuiCaptureRunnerSourceSha256,
  });
  nextManifest.baselineDirectory = snapshotDirectory;
  nextManifest.cases = nextManifest.cases.map((entry) => ({
    ...entry,
    baseline: Object.fromEntries(manifest.capture.modes.map((mode) => [mode, {
      path: `${snapshotDirectory}/${entry.id}--${mode}.png`,
      sha256: nextManifest.cases.find(({ id }) => id === entry.id).baseline[mode].sha256,
    }])),
  }));

  await assertVisualMigrationSnapshotPaths({
    root: appRoot,
    snapshotPath,
    activeSnapshotPath: resolve(appRoot, manifest.baselineDirectory),
  });
  const updateDirectory = await mkdtemp(resolve(appRoot, baselineRootDirectory, `.snapshot-${process.pid}-`));
  try {
    await assertVisualMigrationSnapshotPaths({
      root: appRoot,
      snapshotPath,
      activeSnapshotPath: resolve(appRoot, manifest.baselineDirectory),
      temporarySnapshotPath: updateDirectory,
    });
    for (const entry of manifest.cases) {
      for (const mode of manifest.capture.modes) {
        const captured = captures.get(`${entry.id}--${mode}`);
        await writeFile(resolve(updateDirectory, `${entry.id}--${mode}.png`), captured.actualBytes);
      }
    }
    await validateSnapshotFiles(updateDirectory, expectedCaptureInventory.map(([captureId, caseId, , , mode], index) => ({
      id: captureId,
      baseline: `${snapshotDirectory}/${captureId}.png`,
      baselineSha256: hashes[index],
      caseId,
      mode,
    })));
    const materialized = await materializeSnapshotDirectory({
      snapshotPath,
      temporarySnapshotPath: updateDirectory,
      activeSnapshotPath: resolve(appRoot, manifest.baselineDirectory),
      root: appRoot,
      entries: expectedCaptureInventory.map(([captureId, caseId, , , mode], index) => ({
        id: captureId,
        baseline: `${snapshotDirectory}/${captureId}.png`,
        baselineSha256: hashes[index],
        caseId,
        mode,
      })),
    });
    await rm(updateDirectory, { recursive: true, force: true });
    return { snapshotDirectory, nextManifest, reused: materialized.reused };
  } catch (error) {
    await rm(updateDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function buildMuxuiCaptureProvenance(manifest, captures) {
  const muxuiFixtureSourceSha256 = sha256(await readFile(resolve(appRoot, 'src/migration-visual.fixture.mjs')));
  const muxuiFactorySourceSha256 = sha256(await readFile(resolve(appRoot, 'src/storybook-factory.mjs')));
  const muxuiFixtureMapSourceSha256 = sha256(await readFile(resolve(appRoot, fixtureMapSourcePath)));
  const muxuiCaptureRunnerSourceSha256 = sha256(await readFile(resolve(appRoot, muxuiCaptureRunnerSourcePath)));
  const captureRecords = expectedCaptureInventory.map(([captureId, caseId, component, state, mode]) => {
    const entry = manifest.cases.find(({ id }) => id === caseId);
    const captured = captures.get(`${caseId}--${mode}`);
    if (!captured) throw new Error(`Mux UI capture provenance is missing ${captureId}`);
    const styleFacts = (entry.styleFactsByMode ?? { light: entry.styleFacts, dark: entry.styleFacts })[mode];
    const equivalentPart = entry.equivalentPartFacts.muxuiByMode[mode];
    return {
      captureId,
      caseId,
      component,
      state,
      mode,
      selector: entry.selector,
      action: entry.action,
      region: entry.region,
      fixture: entry.fixture,
      fixtureContractSha256: entry.fixtureContractSha256,
      runtimeFixtureSha256: entry.runtimeFixtureSha256,
      frame: entry.fixture.frame,
      captureEnvironment: manifest.capture,
      baseline: {
        path: entry.baseline[mode].path,
        sha256: sha256(captured.actualBytes),
      },
      sha256: sha256(captured.actualBytes),
      styleFacts: {
        selector: styleFacts.selector,
        properties: captured.actualStyleFacts,
      },
      equivalentPart: {
        selector: equivalentPart.selector,
        properties: captured.actualEquivalentPartFacts,
      },
    };
  });
  return {
    schema: 'muxui-react-visual-migration-muxui-capture-v1',
    directory: manifest.baselineDirectory,
    caseCount: migrationCases.length,
    captureCount: captureRecords.length,
    fixtureContractSha256: manifest.fixtureContract.caseSha256,
    muxuiFixtureSourceSha256,
    muxuiFactorySourceSha256,
    muxuiFixtureMapSourceSha256,
    muxuiCaptureRunnerSourceSha256,
    settling: expectedSettling,
    captureEnvironment: manifest.capture,
    captures: captureRecords,
  };
}

async function activateUpdatedManifest(manifest, prepared, muxuiCaptureProvenance) {
  const report = await buildComparisonReport(prepared.nextManifest);
  await activateVisualMigrationArtifacts(manifest, { nextManifest: prepared.nextManifest, report, prepared, muxuiCaptureProvenance });
  return report;
}

async function updateBaselines(page, baseUrl, manifest, captureEnvironment, runToken) {
  const captures = new Map();
  for (const entry of manifest.cases) {
    for (const mode of manifest.capture.modes) {
      const captured = await captureCase(page, baseUrl, manifest, entry, mode, runToken);
      captures.set(`${entry.id}--${mode}`, captured);
    }
  }
  const muxuiCaptureRunnerSourceSha256 = sha256(await readFile(resolve(appRoot, muxuiCaptureRunnerSourcePath)));
  const prepared = await prepareUpdatedSnapshot(manifest, captures, captureEnvironment, muxuiCaptureRunnerSourceSha256);
  prepared.nextManifest.cases = prepared.nextManifest.cases.map((entry) => {
    const light = captures.get(`${entry.id}--light`);
    const dark = captures.get(`${entry.id}--dark`);
    if (!light || !dark) throw new Error(`update did not retain Mux UI style facts for ${entry.id}`);
    if (JSON.stringify(light.actualEquivalentPartFacts) !== JSON.stringify(dark.actualEquivalentPartFacts)) throw new Error(`${entry.id}: Mux UI mapped-part style facts differ between light and dark captures`);
    return {
      ...entry,
      styleFacts: { ...entry.styleFacts, properties: light.actualStyleFacts },
      styleFactsByMode: {
        light: { ...(entry.styleFactsByMode?.light ?? entry.styleFacts), properties: light.actualStyleFacts },
        dark: { ...(entry.styleFactsByMode?.dark ?? entry.styleFacts), properties: dark.actualStyleFacts },
      },
      equivalentPartFacts: {
        donor: entry.equivalentPartFacts.donor,
        adaptation: entry.equivalentPartFacts.adaptation,
        muxui: { ...entry.equivalentPartFacts.muxui, properties: light.actualEquivalentPartFacts },
        muxuiByMode: {
          light: { ...entry.equivalentPartFacts.muxuiByMode.light, properties: light.actualEquivalentPartFacts },
          dark: { ...entry.equivalentPartFacts.muxuiByMode.dark, properties: dark.actualEquivalentPartFacts },
        },
      },
    };
  });
  const muxuiCaptureProvenance = await buildMuxuiCaptureProvenance(prepared.nextManifest, captures);
  prepared.nextManifest.bootstrap = {
    ...prepared.nextManifest.bootstrap,
    muxuiCaptureProvenance: {
      path: muxuiCaptureProvenancePath,
      sha256: jsonSha256(muxuiCaptureProvenance),
    },
  };
  await activateUpdatedManifest(manifest, prepared, muxuiCaptureProvenance);
  await validateManifest(prepared.nextManifest);
  return prepared.nextManifest;
}

async function main() {
  const updateMode = process.argv.slice(2).includes('--update');
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--update');
  if (unknownArguments.length > 0) throw new Error(`unknown visual migration argument: ${unknownArguments[0]}`);
  await recoverVisualMigrationActivation();
  const manifest = await readManifest();
  await validateManifest(manifest, {
    allowMissingMuxuiCaptureProvenance: updateMode,
    allowMuxuiCaptureRunnerSourceDrift: updateMode,
  });
  if (!updateMode) await validateSealedComparison(manifest);
  const executablePath = await findBrowser();
  if (!executablePath) throw new Error('Chrome or Chromium is required (set MUXUI_CHROME_EXECUTABLE to override)');
  const captureEnvironment = await currentCaptureEnvironment(executablePath);
  if (!updateMode) assertCaptureEnvironment(captureEnvironment, manifest.capture);
  else {
    const mismatches = captureEnvironmentMismatches(captureEnvironment, manifest.capture);
    if (mismatches.length > 0) console.log(`Updating capture environment: ${mismatches.join('; ')}`);
  }

  const diagnosticRoot = await mkdtemp(join(tmpdir(), 'muxui-visual-migration-diagnostics-'));
  let storybook;
  let baseUrl;
  let browser;
  const runToken = randomBytes(32).toString('hex');
  try {
    const started = await startStorybook(await reservePort(), runToken);
    storybook = started.child;
    baseUrl = started.baseUrl;
    browser = await chromium.launch({ headless: true, executablePath });
    const context = await browser.newContext({
      viewport: manifest.capture.viewport,
      deviceScaleFactor: manifest.capture.deviceScaleFactor,
      colorScheme: 'light',
      timezoneId: manifest.capture.clock.timezone,
    });
    await context.clock.install({ time: manifest.capture.clock.time });
    const page = await context.newPage();
    await context.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.protocol === 'data:' || ['127.0.0.1', 'localhost'].includes(requestUrl.hostname)) {
        await route.continue();
      } else {
        await route.abort();
      }
    });
    await page.emulateMedia({ reducedMotion: manifest.capture.reducedMotion ? 'reduce' : 'no-preference' });
    if (updateMode) {
      const nextManifest = await updateBaselines(page, baseUrl, manifest, captureEnvironment, runToken);
      console.log(`Updated ${nextManifest.cases.length} Mux UI visual migration baselines; review the Mux UI-owned diff before merging.`);
      return;
    }
    const results = [];
    for (const entry of manifest.cases) {
      for (const mode of manifest.capture.modes) {
        try {
          const result = await compareCase(page, baseUrl, manifest, entry, mode, runToken, diagnosticRoot);
          results.push({ entry, mode, ...result });
          console.log(`${result.pass ? '✓' : '✗'} ${entry.id}/${mode}${result.pass ? '' : `: ${result.message}`}`);
        } catch (error) {
          const failure = { message: error instanceof Error ? error.message : String(error) };
          await writeFailure({ ...entry, id: `${entry.id}-${mode}` }, failure, undefined, undefined, diagnosticRoot);
          results.push({ entry, mode, pass: false, message: failure.message });
          console.log(`✗ ${entry.id}/${mode}: ${failure.message}`);
        }
      }
    }
    await context.close();
    const failures = results.filter((result) => !result.pass);
    if (failures.length > 0) {
      throw new Error(`${failures.length}/${results.length} visual migration cases drifted; diagnostics: ${diagnosticRoot}`);
    }
    console.log(`Visual migration check passed: ${results.length} Mux UI light/dark captures.`);
  } finally {
    await browser?.close();
    await terminateProcess(storybook);
    await removeOwnedDiagnosticDirectory(diagnosticRoot);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(`Visual migration check failed: ${error instanceof Error ? error.message : String(error)}`);
    if (process.env.MUXUI_VISUAL_DEBUG && error instanceof Error) console.error(error.stack);
    if (error?.cause) console.error(error.cause);
    process.exitCode = 1;
  }
}
