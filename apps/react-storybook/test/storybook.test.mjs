import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { compilePureTokenGraph } from '@muxui/tokens/core';
import { transformWithOxc } from 'vite';
import { convert } from 'storybook/theming';
import { ToastProvider } from '@muxui/react';
import { isTextEditorDocument } from '@muxui/react/text-editor';
import { StorybookThemeContext } from '../src/storybook-theme.mjs';
import defaultTheme from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { componentCategory, groupComponentNavigation } from '../../component-navigation.mjs';
import { componentRecordCategory } from '../src/component-categories.mjs';
import { exactLockedProblems, readLockfile } from '../../../packages/react/test/support/locked-dependencies.mjs';
import {
  argTypesForBinding,
  adapterNames,
  HISTORICAL_BROWSER_PROOF_FAMILIES,
  BROWSER_PROOF_FAMILIES,
  createAnatomyStory,
  createButtonMatrixStory,
  createBrowserProofStory,
  createControlledStory,
  createEventsStory,
  createStory,
  createStoryMeta,
  createUncontrolledStory,
  controlledDefaultPairsForBinding,
  eventBindingsForBinding,
  eventCallbackPropForChannel,
  renderFamily,
  renderStateCoverage,
  stateArgsForBinding,
  stateCoverageForBinding,
  storyArgsForBinding,
} from '../src/storybook-factory.mjs';
import { buildTheme, managerThemeCss } from '../.storybook/theme.mjs';
import { patternVariantExamples } from '../../../tooling/audits/repository-policy/src/pattern-variants.mjs';

const appRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(appRoot, '../..');
const packageRequire = createRequire(resolve(repositoryRoot, 'packages/react/package.json'));
const { JSDOM } = packageRequire('jsdom');
const descriptorSource = JSON.parse(await readFile(resolve(repositoryRoot, 'packages/react/generated/descriptor.json'), 'utf8'));
const descriptor = descriptorSource.historical?.bindings
  ? {
      ...descriptorSource,
      bindings: descriptorSource.historical.bindings,
      exports: descriptorSource.historical.exports,
    }
  : descriptorSource;
const snapshot = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json'), 'utf8'));
const colorGraphs = Object.fromEntries(['light', 'dark'].map((colorScheme) => [
  colorScheme, compilePureTokenGraph(defaultTheme, { modes: { colorScheme } }).tokens,
]));

function canonicalColorValue(colorScheme, tokenId) {
  const token = colorGraphs[colorScheme][tokenId];
  assert.ok(token, `${colorScheme} canonical token ${tokenId}`);
  return token.value;
}

function generatedBody(source, fileName) {
  const match = source.match(
    /^\/\/ @generated-from: ([^\n]+)\n\/\/ @generated-content-sha256: (sha256:[a-f0-9]{64})\n([\s\S]+)$/u,
  );
  assert.ok(match, `${fileName} must include the standard generated markers`);
  const [, generatedFrom, digest, body] = match;
  assert.equal(generatedFrom, 'apps/react-storybook/src/generate-stories.mjs', fileName);
  assert.equal(digest, `sha256:${createHash('sha256').update(body).digest('hex')}`, fileName);
  return body;
}

const manifestSource = await readFile(resolve(appRoot, '.storybook/generated/manifest.mjs'), 'utf8');
generatedBody(manifestSource, 'manifest.mjs');
const { default: manifest } = await import('../.storybook/generated/manifest.mjs');
const historicalFamilyNames = new Set(descriptor.bindings.map(({ export: name }) => name));
const manifestByFamily = new Map(manifest.families.map((record) => [record.family, record]));
const historicalManifest = {
  ...manifest,
  count: historicalFamilyNames.size,
  families: descriptor.bindings.map(({ export: name }) => manifestByFamily.get(name)).filter(Boolean),
};

function installRuntimeDom() {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  dom.window.ResizeObserver = ResizeObserverMock;
  dom.window.CSS ??= { escape: (value) => String(value) };
  dom.window.matchMedia ??= () => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
  dom.window.PointerEvent ??= dom.window.MouseEvent;
  // React Aria scrolls a focused option into view; jsdom has no layout to scroll.
  dom.window.Element.prototype.scrollTo ??= () => {};
  dom.window.requestAnimationFrame ??= (callback) => dom.window.setTimeout(callback, 16);
  dom.window.cancelAnimationFrame ??= (handle) => dom.window.clearTimeout(handle);
  const globals = [
    'window', 'document', 'Document', 'DocumentFragment', 'Element', 'HTMLElement', 'HTMLButtonElement',
    'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLDivElement', 'SVGElement', 'Node',
    'NodeFilter', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'InputEvent', 'FocusEvent', 'PointerEvent',
    'MutationObserver', 'File', 'Blob', 'FileReader', 'DOMRect', 'ResizeObserver', 'CSS', 'getComputedStyle',
    'requestAnimationFrame', 'cancelAnimationFrame',
  ];
  const previous = new Map(globals.map((name) => [name, globalThis[name]]));
  for (const name of globals) {
    if (dom.window[name] !== undefined) globalThis[name] = dom.window[name];
  }
  const elementPrototype = dom.window.HTMLElement.prototype;
  // React keeps the last focused text input in module state across tests. These stay on this closed window's
  // prototype so a late stale-focus cleanup in a later test finds no-ops instead of throwing.
  elementPrototype.attachEvent ??= () => {};
  elementPrototype.detachEvent ??= () => {};
  const previousGetAnimations = elementPrototype.getAnimations;
  const previousCSSTransition = globalThis.CSSTransition;
  const pendingAnimations = new Set();
  class AnimationMock {
    constructor() {
      this.finished = new Promise((resolvePromise) => pendingAnimations.add(resolvePromise));
    }

    cancel() {}
  }
  elementPrototype.getAnimations = function getAnimations() {
    return [new AnimationMock()];
  };
  globalThis.CSSTransition = AnimationMock;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return {
    dom,
    resolveAnimations() {
      for (const resolvePromise of pendingAnimations) resolvePromise();
      pendingAnimations.clear();
    },
    restore() {
      for (const [name, value] of previous) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      }
      if (previousGetAnimations === undefined) delete elementPrototype.getAnimations;
      else elementPrototype.getAnimations = previousGetAnimations;
      if (previousCSSTransition === undefined) delete globalThis.CSSTransition;
      else globalThis.CSSTransition = previousCSSTransition;
      dom.window.close();
    },
  };
}

test('private host and exact Mux UI React family projection', async () => {
  const packageManifest = JSON.parse(await readFile(resolve(appRoot, 'package.json'), 'utf8'));
  assert.equal(packageManifest.private, true);
  assert.equal(manifest.schema, 'muxui-react-storybook-manifest-v1');
  assert.equal(historicalManifest.count, 53);
  assert.deepEqual(historicalManifest.families.map(({ family }) => family), descriptor.bindings.map(({ export: name }) => name));
  assert.equal(new Set(historicalManifest.families.map(({ family }) => family)).size, 53);
  assert.deepEqual(adapterNames.filter((name) => historicalFamilyNames.has(name)).sort(), descriptor.bindings.map(({ export: name }) => name).sort());
  assert.deepEqual(historicalManifest.families.map(({ family }) => family).sort(), snapshot.families.map(({ muxuiPublicFamily, corePublicFamily }) => muxuiPublicFamily ?? corePublicFamily).sort());
});

test('current Storybook manifest covers the complete package union', () => {
  assert.equal(manifest.count, descriptorSource.bindings.length);
  assert.equal(new Set(manifest.families.map(({ family }) => family)).size, descriptorSource.bindings.length);
  assert.deepEqual(manifest.families.map(({ family }) => family), descriptorSource.bindings.map(({ export: name }) => name));
  assert.deepEqual(adapterNames.slice().sort(), descriptorSource.bindings.map(({ export: name }) => name).sort());
  assert.deepEqual([...BROWSER_PROOF_FAMILIES].sort(), descriptorSource.bindings.map(({ export: name }) => name).sort());
});

test('Storybook navigation is alphabetical with stable deep links', async () => {
  const preview = await readFile(resolve(appRoot, '.storybook/preview.mjs'), 'utf8');
  assert.match(preview, /parameters:\s*\{\s*options:\s*\{\s*storySort:\s*\{\s*method: 'alphabetical'\s*\}/u);
  const slugFor = ({ family }) => family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  const groups = groupComponentNavigation(manifest.families, (item) => componentRecordCategory(slugFor(item)));
  assert.deepEqual(groups.map(({ label }) => label), ['AI Agent', 'Components']);
  // Every family lands in exactly one group, the one its category names.
  for (const { label, items } of groups) {
    assert.ok(items.every((item) => componentCategory(componentRecordCategory(slugFor(item))) === label), label);
  }
  assert.equal(groups[0].items.length + groups[1].items.length, manifest.count);
  assert.equal(new Set(groups.flatMap(({ items }) => items)).size, manifest.count);
  for (const record of manifest.families) {
    const slug = record.family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const tranche = record.tranche.replace('.', '-').toLowerCase();
    const story = await import(`../.storybook/generated/${tranche}-${slug}.stories.mjs`);
    const category = componentCategory(componentRecordCategory(slug));
    const title = `Mux UI React/${category}/${record.family}`;
    assert.equal(story.default.title, title, record.family);
    const binding = descriptorSource.bindings.find(({ export: name }) => name === record.family);
    assert.ok(binding, record.family);
    if (binding.module === '.') assert.equal(createStoryMeta({ ...record, binding }, category).title, title, record.family);
    assert.equal(story.default.id, `muxui-react-${tranche}-${slug}`, record.family);
  }
});

test('current Storybook default stories render through their published package routes', async () => {
  const failures = [];
  for (const record of manifest.families) {
    const slug = record.family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const tranche = record.tranche.replace('.', '-').toLowerCase();
    try {
      const story = await import(`../.storybook/generated/${tranche}-${slug}.stories.mjs`);
      renderToStaticMarkup(story.Default.render(story.Default.args));
    } catch (error) {
      failures.push(`${record.family}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  assert.deepEqual(failures, [], 'all current default stories must render');
});

test('uses standard generation scripts and checks drift in an isolated projection', async () => {
  const packageManifest = JSON.parse(await readFile(resolve(appRoot, 'package.json'), 'utf8'));
  assert.equal(packageManifest.scripts.generate, 'node ../../tooling/audits/repository-policy/src/prepare-prerequisites.mjs @muxui/react... && node src/generate-stories.mjs');
  assert.equal(packageManifest.scripts['generate:check'], 'node src/generate-stories.mjs --check');
  assert.equal(packageManifest.scripts.storybook, 'pnpm generate && pnpm exec storybook dev -p 6006');
  assert.equal(packageManifest.scripts.build, 'pnpm generate && storybook build --output-dir dist');
  assert.equal(packageManifest.scripts.check, 'node ../../tooling/audits/repository-policy/src/prepare-prerequisites.mjs @muxui/react-storybook... && pnpm generate:check && node --test --test-concurrency=1 test/*.test.mjs');

  const sourceRoot = resolve(appRoot, '.storybook/generated');
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'muxui-storybook-generation-check-'));
  await cp(sourceRoot, temporaryRoot, { recursive: true });
  const storyPath = resolve(temporaryRoot, 'link-icon-composition.example.mjs');
  const original = await readFile(storyPath, 'utf8');
  const drifted = `${original}\n// temporary drift\n`;
  const previousRoot = process.env.MUXUI_STORYBOOK_GENERATED_ROOT;
  process.env.MUXUI_STORYBOOK_GENERATED_ROOT = temporaryRoot;
  await writeFile(storyPath, drifted, 'utf8');
  try {
    const result = spawnSync(
      process.execPath,
      [resolve(appRoot, 'src/generate-stories.mjs'), '--check'],
      { cwd: appRoot, encoding: 'utf8' },
    );
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /generated output drift in/u);
    assert.equal(await readFile(storyPath, 'utf8'), drifted);
  } finally {
    if (previousRoot === undefined) delete process.env.MUXUI_STORYBOOK_GENERATED_ROOT;
    else process.env.MUXUI_STORYBOOK_GENERATED_ROOT = previousRoot;
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('every story exposes exactly its canonical Mux UI-owned properties', () => {
  const byFamily = new Map(descriptor.bindings.map((binding) => [binding.export, binding]));
  for (const record of historicalManifest.families) {
    const binding = byFamily.get(record.family);
    assert.ok(binding, `unknown manifest family ${record.family}`);
    assert.deepEqual(Object.keys(argTypesForBinding(binding)).sort(), binding.api.props.slice().sort(), record.family);
    assert.deepEqual(record.props, binding.api.props, record.family);
    assert.equal(record.tranche, snapshot.families.find(({ muxuiPublicFamily, corePublicFamily }) => (muxuiPublicFamily ?? corePublicFamily) === record.family).tranche, record.family);
  }
});

test('generated metadata exposes every canonical event, part, state, and controlled pair', async () => {
  const byFamily = new Map(descriptor.bindings.map((binding) => [binding.export, binding]));
  let partCount = 0;
  for (const record of historicalManifest.families) {
    const binding = byFamily.get(record.family);
    const slug = record.family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const tranche = record.tranche.replace('.', '-').toLowerCase();
    const story = await import(`../.storybook/generated/${tranche}-${slug}.stories.mjs`);
    const metadata = story.default.parameters.muxuiApi;
    assert.deepEqual(metadata.props, binding.api.props, `${record.family} props`);
    assert.deepEqual(metadata.events, binding.api.events, `${record.family} events`);
    assert.deepEqual(metadata.parts, binding.api.parts, `${record.family} parts`);
    assert.deepEqual(metadata.states, binding.states, `${record.family} states`);
    assert.deepEqual(metadata.controlled, controlledDefaultPairsForBinding(binding), `${record.family} controlled pairs`);
    assert.equal(new Set(metadata.parts).size, metadata.parts.length, `${record.family} duplicate parts`);
    partCount += metadata.parts.length;
  }
  assert.equal(partCount, descriptor.bindings.reduce((count, binding) => count + binding.api.parts.length, 0));
});

test('generated proof stories expose live controls, events, modes, anatomy, and browser plays', async () => {
  assert.deepEqual(
    [...HISTORICAL_BROWSER_PROOF_FAMILIES].sort(),
    historicalManifest.families.map(({ family }) => family).sort(),
    'every exact manifest family has a substantive Browser Proof plan',
  );
  const publicTypes = await readFile(resolve(repositoryRoot, 'packages/react/generated/index.d.ts'), 'utf8');
  let pairCount = 0;
  let eventCount = 0;
  let partCount = 0;
  for (const record of historicalManifest.families) {
    const binding = descriptor.bindings.find(({ export: name }) => name === record.family);
    assert.ok(binding, `${record.family} descriptor binding`);
    const slug = record.family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const tranche = record.tranche.replace('.', '-').toLowerCase();
    const story = await import(`../.storybook/generated/${tranche}-${slug}.stories.mjs`);
    for (const name of ['Controlled', 'Uncontrolled', 'Events', 'Anatomy', 'BrowserProof']) {
      assert.equal(typeof story[name]?.render, 'function', `${record.family}/${name} render`);
    }
    assert.equal(typeof story.BrowserProof.play, 'function', `${record.family}/BrowserProof play`);
    assert.equal(story.BrowserProof.parameters.muxuiProof.browser, true, `${record.family}/BrowserProof metadata`);
    const pairs = controlledDefaultPairsForBinding(binding);
    pairCount += pairs.length;
    assert.deepEqual(
      Object.keys(story.Controlled.args).filter((name) => pairs.some(({ controlled }) => controlled === name)).sort(),
      pairs.map(({ controlled }) => controlled).sort(),
      `${record.family} controlled args`,
    );
    assert.deepEqual(
      Object.keys(story.Uncontrolled.args).filter((name) => pairs.some(({ uncontrolled }) => uncontrolled === name)).sort(),
      pairs.map(({ uncontrolled }) => uncontrolled).sort(),
      `${record.family} uncontrolled args`,
    );
    const events = eventBindingsForBinding(binding);
    eventCount += events.length;
    for (const { prop } of events) assert.match(publicTypes, new RegExp(`\\b${prop}\\b`, 'u'), `${record.family}/${prop} must be a real public callback`);
    partCount += binding.api.parts.length;
    const anatomyMarkup = renderToStaticMarkup(story.Anatomy.render(story.Anatomy.args));
    assert.equal(
      (anatomyMarkup.match(/data-muxui-storybook-api-part-status=/gu) ?? []).length,
      binding.api.parts.length,
      `${record.family} anatomy parts`,
    );
  }
  assert.equal(pairCount, descriptor.bindings.reduce((count, binding) => count + controlledDefaultPairsForBinding(binding).length, 0), 'every descriptor controlled/default pair gets a pair of proof stories');
  assert.equal(eventCount, descriptor.bindings.reduce((count, binding) => count + eventBindingsForBinding(binding).length, 0), 'every descriptor event channel gets a live event binding');
  assert.equal(partCount, descriptor.bindings.reduce((count, binding) => count + binding.api.parts.length, 0), 'every descriptor API part gets an anatomy proof row');
});

test('TimeField controlled and uncontrolled stories use canonical local time args', async () => {
  const story = await import('../.storybook/generated/r1-2-time-field.stories.mjs');
  assert.equal(story.Controlled.args.value, '09:30');
  assert.equal(story.Uncontrolled.args.defaultValue, '09:30');
  assert.doesNotThrow(() => renderToStaticMarkup(story.Controlled.render(story.Controlled.args)));
  assert.doesNotThrow(() => renderToStaticMarkup(story.Uncontrolled.render(story.Uncontrolled.args)));
});

test('InputTags controlled and uncontrolled stories render their list values', async () => {
  const story = await import('../.storybook/generated/r1-6-input-tags.stories.mjs');
  assert.doesNotThrow(() => renderToStaticMarkup(story.Controlled.render(story.Controlled.args)));
  assert.doesNotThrow(() => renderToStaticMarkup(story.Uncontrolled.render(story.Uncontrolled.args)));
});

function currentRecord(family) {
  const binding = descriptorSource.bindings.find(({ export: name }) => name === family);
  assert.ok(binding, `${family} binding`);
  return { family, tranche: manifestByFamily.get(family).tranche, binding };
}

const publicTypes = await readFile(resolve(repositoryRoot, 'packages/react/generated/index.d.ts'), 'utf8');
// Truncated image data: the browser fires an error event instead of loading it.
const AVATAR_FAILING_SRC = 'data:image/png;base64,AAAA';
const supplementalTypes = await readFile(resolve(repositoryRoot, 'packages/react/generated/supplemental.d.ts'), 'utf8');

/** The string members of an exported union, read from the generated public declarations. */
function declaredUnion(source, name) {
  const match = source.match(new RegExp(`export type ${name} = ([^;]+);`, 'u'));
  assert.ok(match, `${name} declaration`);
  return [...match[1].matchAll(/'([^']+)'/gu)].map(([, member]) => member);
}

/** Runs a body against a fresh jsdom runtime and always restores the globals it replaced. */
async function withRuntime(body) {
  const env = installRuntimeDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  try {
    await body({ host, root });
  } finally {
    // React keeps a focused text input registered until it blurs; release it while this window still exists.
    await act(async () => document.activeElement?.blur?.());
    await act(async () => root.unmount());
    env.resolveAnimations();
    env.restore();
  }
}

const settleRuntime = (milliseconds = 20) => act(async () => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)));

/** The nearest prop of this name on a React ancestor of a DOM node, for options jsdom's layout-free DOM never reports. */
function ancestorProp(node, name) {
  let fiber = node[Object.keys(node).find((key) => key.startsWith('__reactFiber'))];
  for (; fiber; fiber = fiber.return) {
    if (fiber.memoizedProps?.[name] !== undefined) return fiber.memoizedProps[name];
  }
  return undefined;
}

/** The States showcase as a document, keyed by state name. */
function stateSections(family, args) {
  const record = currentRecord(family);
  const story = createStory(record, 'states');
  const document = new JSDOM(renderToStaticMarkup(story.render(args ?? story.args))).window.document;
  const sections = new Map([...document.querySelectorAll('.muxui-storybook-state')].map((node) => [node.querySelector('h3').textContent, node]));
  return { document, sections };
}

test('supplemental adapter modes seed valid values and preserve exclusive defaults', () => {
  for (const [family, controlled, uncontrolled] of [
    ['ColorModeToggle', 'mode', 'defaultMode'],
    ['MultiSelect', 'selectedKeys', 'defaultSelectedKeys'],
    ['Resizable', 'sizes', 'defaultSizes'],
    ['TextEditor', 'value', 'defaultValue'],
  ]) {
    const record = currentRecord(family);
    const controlledStory = createControlledStory(record);
    const uncontrolledStory = createUncontrolledStory(record);
    assert.equal(Object.hasOwn(controlledStory.args, controlled), family !== 'ColorModeToggle', family);
    assert.equal(Object.hasOwn(controlledStory.args, uncontrolled), false, family);
    assert.equal(Object.hasOwn(uncontrolledStory.args, uncontrolled), family !== 'ColorModeToggle', family);
    assert.equal(Object.hasOwn(uncontrolledStory.args, controlled), false, family);
    if (family === 'TextEditor') {
      assert.equal(isTextEditorDocument(controlledStory.args.value), true);
      assert.equal(isTextEditorDocument(uncontrolledStory.args.defaultValue), true);
    } else if (family === 'MultiSelect') {
      assert.ok(controlledStory.args.selectedKeys instanceof Set);
      assert.ok(uncontrolledStory.args.defaultSelectedKeys instanceof Set);
      assert.equal(renderFamily(family, { selectedKeys: 'all' }).props.selectedKeys, 'all');
    } else {
      assert.doesNotThrow(() => renderToStaticMarkup(controlledStory.render(controlledStory.args)), family);
      assert.doesNotThrow(() => renderToStaticMarkup(uncontrolledStory.render(uncontrolledStory.args)), family);
    }
  }
  const sizes = { main: 70, side: 30 };
  const resizable = renderFamily('Resizable', { sizes, defaultSizes: { main: 60, side: 40 } });
  assert.strictEqual(resizable.props.sizes, sizes);
  assert.equal(Object.hasOwn(resizable.props, 'defaultSizes'), false);
  assert.doesNotMatch(renderToStaticMarkup(resizable), /data-invalid="true"/u);
  const editor = renderFamily('TextEditor', createControlledStory(currentRecord('TextEditor')).args);
  assert.equal(Object.hasOwn(editor.props, 'defaultValue'), false);
});

test('IconButton offers only runtime-admitted variants and keeps its ghost default', () => {
  const record = currentRecord('IconButton');
  const control = argTypesForBinding(record.binding).variant;
  assert.equal(control.options.includes('success'), false);
  assert.equal(control.options.includes('warning'), false);
  for (const variant of control.options) {
    const html = renderToStaticMarkup(renderFamily('IconButton', { variant }));
    assert.match(html, new RegExp(`data-variant="${variant}"`, 'u'));
  }
  assert.match(renderToStaticMarkup(renderFamily('IconButton', {})), /data-variant="ghost"/u);
});

test('native select stock mode seeds decode values and forward the original change event', async () => {
  const env = installRuntimeDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const record = currentRecord('SelectNative');
  try {
    for (const story of [createControlledStory(record), createUncontrolledStory(record), createStory(record, 'default')]) {
      for (const multiple of [false, true]) {
        let received;
        let receivedTarget;
        const args = { ...story.args, multiple, onChange: (event) => { received = event; receivedTarget = event.currentTarget; } };
        await act(async () => root.render(React.cloneElement(story.render(args), { key: `${story.name}-${multiple}` })));
        const select = host.querySelector('select');
        const controlled = host.querySelector('[data-muxui-controlled-values]');
        const uncontrolled = host.querySelector('[data-muxui-uncontrolled-values]');
        assert.deepEqual([...select.selectedOptions].map((option) => option.value), multiple ? [] : ['']);
        if (controlled) assert.deepEqual(JSON.parse(controlled.textContent).value, multiple ? [] : '');
        if (uncontrolled) assert.deepEqual(JSON.parse(uncontrolled.textContent).defaultValue, multiple ? [] : '');
        if (multiple) {
          for (const option of select.options) option.selected = option.value !== '';
        } else select.value = 'research';
        await act(async () => select.dispatchEvent(new Event('change', { bubbles: true })));
        assert.equal(received.type, 'change');
        assert.strictEqual(receivedTarget, select);
        if (controlled) assert.deepEqual(JSON.parse(controlled.textContent).value, multiple ? ['inbox', 'research'] : 'research');
        if (uncontrolled) assert.deepEqual(JSON.parse(uncontrolled.textContent).defaultValue, multiple ? [] : '');
        assert.deepEqual([...select.selectedOptions].map((option) => option.value), multiple ? ['inbox', 'research'] : ['research']);
      }
    }
  } finally {
    await act(async () => root.unmount());
    env.resolveAnimations();
    env.restore();
  }
});

test('color mode stories update controlled values and restore an independent uncontrolled mode', async () => {
  const env = installRuntimeDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const toolbarUpdates = [];
  const changes = [];
  const record = currentRecord('ColorModeToggle');
  const controlled = createControlledStory(record);
  const uncontrolled = createUncontrolledStory(record);
  const themed = (story, args, scheme, key = args.storageKey ?? story.name) => React.createElement(StorybookThemeContext.Provider, { value: { scheme, setScheme: (value) => toolbarUpdates.push(value) } }, React.cloneElement(story.render(args), { key }));
  try {
    await act(async () => root.render(themed(controlled, controlled.args, 'dark')));
    assert.equal(JSON.parse(host.querySelector('[data-muxui-controlled-values]').textContent).mode, 'dark');
    await act(async () => root.render(themed(controlled, { ...controlled.args, storageKey: 'controlled-explicit-mode', mode: 'light', onModeChange: (value) => changes.push(value) }, 'dark')));
    assert.equal(host.querySelector('.muxui-color-mode-toggle').getAttribute('data-mode'), 'light');
    await act(async () => host.querySelector('input').click());
    assert.deepEqual(changes, ['dark']);
    assert.equal(JSON.parse(host.querySelector('[data-muxui-controlled-values]').textContent).mode, 'dark');

    toolbarUpdates.length = 0;
    const restoreKey = 'muxui-storybook-restore-probe';
    window.localStorage.setItem(restoreKey, 'light');
    await act(async () => root.render(themed(uncontrolled, { ...uncontrolled.args, storageKey: restoreKey, onModeChange: (value) => changes.push(value) }, 'dark')));
    assert.equal(host.querySelector('.muxui-color-mode-toggle').getAttribute('data-mode'), 'light');
    assert.equal(JSON.parse(host.querySelector('[data-muxui-uncontrolled-values]').textContent).defaultMode, 'dark');
    const storageKey = 'muxui-storybook-uncontrolled-interaction';
    await act(async () => root.render(themed(uncontrolled, { ...uncontrolled.args, storageKey, defaultMode: 'light', onModeChange: (value) => changes.push(value) }, 'dark')));
    assert.equal(host.querySelector('.muxui-color-mode-toggle').getAttribute('data-mode'), 'light');
    const defaults = host.querySelector('[data-muxui-uncontrolled-values]').textContent;
    await act(async () => host.querySelector('input').click());
    assert.equal(host.querySelector('.muxui-color-mode-toggle').getAttribute('data-mode'), 'dark');
    assert.equal(host.querySelector('[data-muxui-uncontrolled-values]').textContent, defaults);
    assert.equal(window.localStorage.getItem(storageKey), 'dark');
    assert.deepEqual(toolbarUpdates, []);
    const existingKeys = new Set(Object.keys(window.localStorage));
    for (const scheme of ['light', 'dark']) {
      await act(async () => root.render(themed(uncontrolled, uncontrolled.args, scheme, `seed-${scheme}`)));
      assert.equal(host.querySelector('.muxui-color-mode-toggle').getAttribute('data-mode'), scheme);
    }
    const specimenKeys = Object.keys(window.localStorage).filter((key) => !existingKeys.has(key));
    assert.equal(specimenKeys.length, 2);
    assert.deepEqual(new Set(specimenKeys.map((key) => window.localStorage.getItem(key))), new Set(['light', 'dark']));
    await act(async () => root.render(themed(uncontrolled, uncontrolled.args, 'light', 'seed-dark')));
    assert.equal(host.querySelector('.muxui-color-mode-toggle').getAttribute('data-mode'), 'dark');
    assert.equal(JSON.parse(host.querySelector('[data-muxui-uncontrolled-values]').textContent).defaultMode, 'dark');
  } finally {
    await act(async () => root.unmount());
    env.resolveAnimations();
    env.restore();
  }
});

test('resize controlled and event harnesses preserve size records and change metadata', async () => {
  const env = installRuntimeDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const record = currentRecord('Resizable');
  const changes = [];
  const commits = [];
  const args = { onSizesChange: (...payload) => changes.push(payload), onSizesCommit: (...payload) => commits.push(payload) };
  try {
    for (const story of [createControlledStory(record), createEventsStory(record)]) {
      await act(async () => root.render(story.render({ ...story.args, ...args })));
      const handle = host.querySelector('[data-handle-id="main-side"]');
      await act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
      assert.deepEqual(changes.at(-1), [{ main: 61, side: 39 }, { handleId: 'main-side', source: 'keyboard' }]);
      assert.deepEqual(commits.at(-1), changes.at(-1));
      const output = host.querySelector('[data-muxui-controlled-values]');
      if (output) assert.deepEqual(JSON.parse(output.textContent).sizes, { main: 61, side: 39 });
      else {
        const log = host.querySelector('[data-muxui-storybook-event-log]').textContent;
        assert.match(log, /sizesChange:/u);
        assert.match(log, /sizesCommit:/u);
        assert.match(log, /"handleId":"main-side","source":"keyboard"/u);
      }
    }
  } finally {
    await act(async () => root.unmount());
    env.resolveAnimations();
    env.restore();
  }
});

test('MultiSelect and TextEditor controlled harnesses accept their public callback values', async () => {
  const env = installRuntimeDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  let editor;
  let editorDestroyed;
  try {
    const multi = createControlledStory(currentRecord('MultiSelect'));
    let selection;
    await act(async () => root.render(multi.render({ ...multi.args, selectedKeys: 'all', onSelectionChange: (value) => { selection = value; } })));
    assert.equal(JSON.parse(host.querySelector('[data-muxui-controlled-values]').textContent).selectedKeys, 'all');
    await act(async () => host.querySelector('.muxui-multi-select__trigger').click());
    await act(async () => document.querySelector('.muxui-multi-select__item').click());
    assert.ok(selection instanceof Set);
    assert.deepEqual(JSON.parse(host.querySelector('[data-muxui-controlled-values]').textContent).selectedKeys, [...selection]);

    const editorStory = createControlledStory(currentRecord('TextEditor'));
    let documentValue;
    await act(async () => root.render(React.cloneElement(editorStory.render({ ...editorStory.args, onChange: (value) => { documentValue = value; } }), { key: 'editor' })));
    editor = host.querySelector('.ProseMirror').editor;
    editorDestroyed = new Promise((resolve) => editor.on('destroy', resolve));
    await act(async () => editor.commands.insertContent('Updated '));
    assert.equal(isTextEditorDocument(documentValue), true);
    assert.deepEqual(JSON.parse(host.querySelector('[data-muxui-controlled-values]').textContent).value, documentValue);
    assert.match(host.querySelector('.ProseMirror').textContent, /Updated/u);
  } finally {
    await act(async () => root.unmount());
    if (editor && !editor.isDestroyed) await editorDestroyed;
    env.resolveAnimations();
    env.restore();
  }
});

test('named adapter state specimens render actual items, progress values, and orientation', () => {
  const stateDocument = (family) => {
    const record = currentRecord(family);
    const story = createStory(record, 'states');
    return new JSDOM(renderToStaticMarkup(story.render(story.args))).window.document;
  };
  const section = (document, state) => [...document.querySelectorAll('.muxui-storybook-state')].find((node) => node.querySelector('h3')?.textContent === state);
  const breadcrumbs = stateDocument('Breadcrumbs');
  assert.ok(section(breadcrumbs, 'disabled').querySelector('[data-disabled="true"]'));
  assert.ok(section(breadcrumbs, 'current').querySelector('span[aria-current="page"]'));
  assert.equal(breadcrumbs.querySelector('[data-muxui-storybook-state="unavailable"]'), null);
  for (const family of ['GridList', 'ListBox']) {
    const document = stateDocument(family);
    assert.equal(section(document, 'selected').querySelector('[aria-selected="true"]').textContent, 'One');
    for (const [id, expected] of [['custom', 'custom'], ['', '0'], [' ', ' '], [' padded ', ' padded ']]) {
      const items = [{ id, label: id === '' ? 'Fallback item' : 'Custom item' }];
      const args = stateArgsForBinding(currentRecord(family).binding, 'selected', family, { items });
      assert.deepEqual(args.selectedIds, [expected]);
      const rendered = new JSDOM(renderToStaticMarkup(renderFamily(family, args)));
      assert.equal(rendered.window.document.querySelector('[aria-selected="true"]').textContent, items[0].label);
      rendered.window.close();
    }
  }
  const progress = stateDocument('ProgressCircle');
  assert.equal(progress.querySelector('[data-muxui-storybook-state="unavailable"]'), null);
  assert.equal(section(progress, 'indeterminate').querySelector('[role="progressbar"]').hasAttribute('aria-valuenow'), false);
  for (const [state, value] of [['zero', '0'], ['partial', '50'], ['complete', '100']]) assert.equal(section(progress, state).querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), value);
  for (const [state, width] of [['sm', '32'], ['md', '48'], ['lg', '64']]) assert.match(section(progress, state).querySelector('svg').getAttribute('viewBox'), new RegExp(`0 0 ${width} ${width}`, 'u'));
  for (const value of [null, undefined]) assert.doesNotMatch(renderToStaticMarkup(renderFamily('ProgressCircle', { value })), /aria-valuenow=/u);
  const separator = stateDocument('Separator');
  assert.equal(section(separator, 'vertical').querySelector('[role="separator"]').getAttribute('aria-orientation'), 'vertical');
  const mode = stateDocument('ColorModeToggle');
  for (const state of ['light', 'dark']) assert.equal(section(mode, state).querySelector('.muxui-color-mode-toggle').getAttribute('data-mode'), state);
});

test('controls offer only what the public types admit and match their value kinds', () => {
  const controls = (family) => argTypesForBinding(currentRecord(family).binding);
  const placements = declaredUnion(publicTypes, 'MuxUIPlacement');
  assert.equal(placements.length, 12);
  for (const family of ['Menu', 'Popover', 'PreviewTrigger', 'Select', 'Tooltip']) {
    assert.deepEqual(controls(family).placement.options, placements, family);
  }
  // ToggleButtonGroup admits single and multiple only; the collections also admit none.
  assert.deepEqual(controls('ToggleButtonGroup').selectionMode.options, ['single', 'multiple']);
  for (const family of ['GridList', 'ListBox', 'Table', 'Tree']) {
    assert.deepEqual(controls(family).selectionMode.options, ['none', 'single', 'multiple'], family);
  }
  assert.deepEqual(controls('Card').variant.options, declaredUnion(supplementalTypes, 'CardVariant'));
  assert.deepEqual(controls('Card').padding.options, declaredUnion(supplementalTypes, 'CardPadding'));
  // A color value is a string, not a collection.
  for (const family of ['ColorArea', 'ColorField', 'ColorPicker', 'ColorSlider', 'ColorSwatchPicker', 'ColorWheel']) {
    assert.equal(controls(family).value.control, 'text', family);
    assert.equal(controls(family).defaultValue.control, 'text', family);
  }
  assert.equal(controls('TextArea').rows.control.type, 'number');
  assert.equal(controls('Table').rows.control, 'object');
  assert.deepEqual(controls('Sidebar').status.options, ['online', 'offline']);
  // A control cannot edit a function, so those props stay off.
  for (const [family, name] of [['CommandPalette', 'filter'], ['CommandPalette', 'close'], ['TagSelect', 'getItemLabel'], ['Lightbox', 'renderContent'], ['InputTags', 'validate']]) {
    assert.equal(controls(family)[name].control, false, `${family}.${name}`);
  }
});

test('Avatar routes image inputs to Image and shows its lifecycle and size states', async () => {
  const doc = (args) => new JSDOM(renderToStaticMarkup(renderFamily('Avatar', args))).window.document;
  const routed = doc({ size: 'lg', src: '/ada.png', srcSet: '/ada.png 1x', alt: 'Ada', children: 'AL' });
  const image = routed.querySelector('.muxui-avatar__image');
  assert.equal(image.getAttribute('src'), '/ada.png');
  assert.equal(image.getAttribute('srcset'), '/ada.png 1x');
  assert.equal(image.getAttribute('alt'), 'Ada');
  const root = routed.querySelector('.muxui-avatar');
  assert.equal(root.getAttribute('data-size'), 'lg');
  assert.equal(root.hasAttribute('alt'), false);
  assert.equal(root.hasAttribute('src'), false);
  assert.equal(routed.querySelector('.muxui-avatar__fallback').textContent, 'AL');
  // With no source the initials show, instead of an invisible loaded pixel.
  const bare = doc({});
  assert.equal(bare.querySelector('.muxui-avatar').getAttribute('data-image-state'), 'fallback');
  assert.equal(bare.querySelector('.muxui-avatar__fallback').hidden, false);
  assert.equal(bare.querySelector('.muxui-avatar__fallback').textContent, 'WS');

  const storyArgs = createStory(currentRecord('Avatar'), 'states').args;
  assert.equal(Object.hasOwn(storyArgs, 'size'), false, 'the States story leaves the size the rows set unset');
  const { document: states, sections } = stateSections('Avatar');
  const unavailable = [...states.querySelectorAll('[data-muxui-storybook-state="unavailable"]')];
  assert.deepEqual(unavailable.map((node) => node.closest('.muxui-storybook-state').querySelector('h3').textContent), ['loading', 'loaded']);
  assert.match(unavailable[1].textContent, /Unavailable: MuxUI Avatar cannot show the loaded state here because the colour audit rejects any visible image/u);
  for (const size of ['sm', 'md', 'lg']) assert.equal(sections.get(size).querySelector('.muxui-avatar').getAttribute('data-size'), size);
  assert.equal(sections.get('fallback').querySelector('.muxui-avatar').getAttribute('data-image-state'), 'fallback');
  assert.match(sections.get('error').querySelector('img').getAttribute('src'), /^data:image\/png/u);
  // A supplied value wins in every row, including one that equals the row's own default.
  assert.equal(stateSections('Avatar', { ...storyArgs, size: 'lg' }).sections.get('sm').querySelector('.muxui-avatar').getAttribute('data-size'), 'lg');
  assert.equal(stateSections('Avatar', { ...storyArgs, size: 'md' }).sections.get('sm').querySelector('.muxui-avatar').getAttribute('data-size'), 'md');

  await withRuntime(async ({ host, root: reactRoot }) => {
    const events = [];
    await act(async () => reactRoot.render(renderFamily('Avatar', { src: '/ada.png', onLoad: () => events.push('load'), onError: () => events.push('error') })));
    const avatar = host.querySelector('.muxui-avatar');
    await act(async () => host.querySelector('img').dispatchEvent(new Event('load')));
    assert.equal(avatar.getAttribute('data-image-state'), 'loaded');
    assert.equal(host.querySelector('.muxui-avatar__fallback').hidden, true);
    await act(async () => reactRoot.render(renderFamily('Avatar', { src: AVATAR_FAILING_SRC, onLoad: () => events.push('load'), onError: () => events.push('error') })));
    await act(async () => host.querySelector('img').dispatchEvent(new Event('error')));
    assert.deepEqual(events, ['load', 'error']);
    assert.equal(avatar.getAttribute('data-image-state'), 'error');
    assert.equal(host.querySelector('.muxui-avatar__fallback').hidden, false);
  });
  // Events seeds the one image the colour audit accepts, so load can be observed.
  assert.match(createEventsStory(currentRecord('Avatar')).args.src, /^data:image\/gif/u);
});

test('Card routes variant and padding to both roots and selection, pending, disabled, and activation to Card.Button', async () => {
  const cards = (args) => [...new JSDOM(renderToStaticMarkup(renderFamily('Card', args))).window.document.querySelectorAll('.muxui-card')];
  for (const variant of declaredUnion(supplementalTypes, 'CardVariant')) {
    for (const padding of declaredUnion(supplementalTypes, 'CardPadding')) {
      const [staticCard, interactive] = cards({ variant, padding });
      for (const card of [staticCard, interactive]) {
        assert.ok(card.classList.contains(`muxui-card--${variant}`) && card.classList.contains(`muxui-card--${padding}`), `${variant}/${padding}`);
      }
      assert.equal(staticCard.localName, 'div');
      assert.equal(interactive.localName, 'button');
    }
  }
  const [, pressed] = cards({ selected: true, pending: true });
  assert.equal(pressed.getAttribute('aria-pressed'), 'true');
  assert.equal(pressed.hasAttribute('data-pending'), true);
  assert.equal(cards({ disabled: true })[1].disabled, true);
  assert.equal(cards({ disabled: true })[0].querySelector('button').disabled, false, 'the footer action does not carry the state');

  const { sections } = stateSections('Card');
  for (const variant of ['elevated', 'outlined', 'filled']) {
    assert.ok(sections.get(variant).querySelector(`.muxui-card--button.muxui-card--${variant}`), variant);
  }
  assert.equal(sections.get('selected').querySelector('.muxui-card--button').getAttribute('aria-pressed'), 'true');
  assert.equal(sections.get('pending').querySelector('.muxui-card--button').hasAttribute('data-pending'), true);
  assert.equal(sections.get('disabled').querySelector('.muxui-card--button').disabled, true);
  // The States story leaves the props the rows set unset, and a supplied false wins in every row.
  const cardStoryArgs = createStory(currentRecord('Card'), 'states').args;
  for (const name of ['disabled', 'pending', 'variant']) assert.equal(Object.hasOwn(cardStoryArgs, name), false, name);
  const forced = stateSections('Card', { ...cardStoryArgs, disabled: false, variant: 'outlined' }).sections;
  assert.equal(forced.get('disabled').querySelector('.muxui-card--button').disabled, false);
  assert.ok(forced.get('elevated').querySelector('.muxui-card--button.muxui-card--outlined'), 'a supplied variant wins, even when it is the default');
  assert.equal(forced.get('pending').querySelector('.muxui-card--button').hasAttribute('data-pending'), true, 'rows the user left alone keep their state');

  await withRuntime(async ({ host, root: reactRoot }) => {
    const story = createEventsStory(currentRecord('Card'));
    await act(async () => reactRoot.render(story.render(story.args)));
    await act(async () => host.querySelector('.muxui-card--button').click());
    assert.match(host.querySelector('[data-muxui-storybook-event-log]').textContent, /activate:/u);
  });
});

test('Separator vertical specimen has content on both sides of a stretched rule', () => {
  const { sections } = stateSections('Separator');
  const vertical = sections.get('vertical').querySelector('[role="separator"]');
  assert.equal(vertical.getAttribute('aria-orientation'), 'vertical');
  const row = vertical.parentElement;
  assert.equal(row.style.display, 'flex');
  assert.deepEqual([...row.children].map((node) => node.textContent || node.getAttribute('role')), ['Left', 'separator', 'Right']);
  assert.ok(sections.get('horizontal').querySelector('[role="separator"].muxui-separator-horizontal'));
});

test('Dialog specimen is a settings dialog because destructive confirmation belongs to AlertDialog', async () => {
  await withRuntime(async ({ root: reactRoot }) => {
    await act(async () => reactRoot.render(renderFamily('Dialog', { defaultOpen: true })));
    await settleRuntime(60);
    assert.equal(document.querySelector('.muxui-dialog-title').textContent, 'Project settings');
    assert.match(document.querySelector('.muxui-dialog').textContent, /Review the settings for this project\./u);
    assert.doesNotMatch(document.body.textContent, /Delete draft/u);
  });
});

test('DropZone disabled and Dialog open rows state their limitation instead of rendering a stand-in', () => {
  const unavailableRow = (family, name, reason) => {
    const { sections } = stateSections(family);
    const row = sections.get(name);
    const message = row.querySelector('[data-muxui-storybook-state="unavailable"]');
    assert.ok(message, `${family}/${name} is labelled unavailable`);
    assert.match(message.textContent, new RegExp(`^Unavailable: MuxUI ${family} cannot show the ${name} state here because ${reason}`, 'u'));
    // Nothing else renders in the row: no enabled drop zone, no closed dialog trigger.
    assert.deepEqual([...row.children].map((node) => node.localName), ['h3', 'p']);
    return sections;
  };
  const dropZone = unavailableRow('DropZone', 'disabled', 'a disabled DropZone root has no accessible disabled signal');
  assert.equal(dropZone.get('idle').querySelectorAll('[data-muxui-storybook-state="unavailable"]').length, 0);
  assert.ok(dropZone.get('idle').querySelector('.muxui-drop-zone'));
  const dialog = unavailableRow('Dialog', 'open', 'a truly open modal makes the whole page inert');
  assert.ok(dialog.get('closed').querySelector('.muxui-dialog-trigger'), 'the closed row still renders');
  assert.equal(dialog.get('entering').querySelectorAll('[data-muxui-storybook-state="unavailable"]').length, 0);
  // The adapters themselves still disable and open on request.
  assert.equal(new JSDOM(renderToStaticMarkup(renderFamily('DropZone', { disabled: true }))).window.document.querySelector('.muxui-drop-zone').hasAttribute('data-disabled'), true);
});

test('HeaderNav routes href and current to the link and fills the drawer with the same destinations', async () => {
  const links = (args) => [...new JSDOM(renderToStaticMarkup(renderFamily('HeaderNav', args))).window.document.querySelectorAll('.muxui-header-nav__secondary a')];
  const [docs, components, blocks] = links({ href: '/guide', current: true });
  assert.equal(docs.getAttribute('href'), '/guide');
  assert.equal(docs.getAttribute('aria-current'), 'page');
  assert.equal(components.hasAttribute('aria-current'), false);
  assert.deepEqual([components, blocks].map((link) => link.getAttribute('href')), ['#components', '#blocks']);
  assert.equal(links({})[0].getAttribute('href'), '#docs');
  assert.equal(links({})[0].hasAttribute('aria-current'), false);
  const current = stateSections('HeaderNav').sections.get('current');
  assert.equal(current.querySelector('.muxui-header-nav__secondary a').getAttribute('aria-current'), 'page');
  // A supplied current: false wins in every row.
  const headerArgs = createStory(currentRecord('HeaderNav'), 'states').args;
  assert.equal(Object.hasOwn(headerArgs, 'current'), false);
  assert.equal(stateSections('HeaderNav', { ...headerArgs, current: false }).sections.get('current').querySelector('.muxui-header-nav__secondary a').hasAttribute('aria-current'), false);

  await withRuntime(async ({ host, root: reactRoot }) => {
    await act(async () => reactRoot.render(renderFamily('HeaderNav', { href: '/guide', current: true })));
    await act(async () => host.querySelector('.muxui-header-nav__mobile-trigger').click());
    await settleRuntime();
    const drawer = document.querySelector('.muxui-header-nav__mobile-dialog');
    assert.ok(drawer, 'the drawer opens');
    assert.deepEqual([...drawer.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href'), link.getAttribute('aria-current')]), [
      ['Docs', '/guide', 'page'], ['Components', '#components', null], ['Blocks', '#blocks', null],
    ]);
  });
});

test('Sidebar routes each prop to its part and the mobile drawer carries the same working links', async () => {
  const sidebar = (args) => new JSDOM(renderToStaticMarkup(renderFamily('Sidebar', args))).window.document;
  const routed = sidebar({
    hideBorder: true, density: 'compact', label: 'Inbox', href: '/inbox', current: true, external: true, badge: '3',
    items: [{ href: '/a', label: 'Alpha' }], defaultExpanded: true, placeholder: 'Find', name: 'Ada', email: 'ada@example.com', status: 'online',
  });
  const root = routed.querySelector('.muxui-sidebar');
  assert.ok(root.classList.contains('muxui-sidebar--no-border'));
  assert.equal(root.getAttribute('data-density'), 'compact');
  // The flat table is not spread onto the aside.
  for (const name of ['current', 'external', 'href', 'items', 'badge', 'status', 'email']) assert.equal(root.hasAttribute(name), false, name);
  const first = root.querySelector('.muxui-sidebar__nav-link');
  assert.equal(first.textContent.includes('Inbox'), true);
  assert.equal(first.getAttribute('href'), '/inbox');
  assert.equal(first.getAttribute('aria-current'), 'page');
  assert.ok(first.querySelector('.muxui-sidebar__nav-external'));
  assert.equal(first.querySelector('.muxui-sidebar__nav-badge').textContent, '3');
  assert.equal(root.querySelector('.muxui-sidebar__search-input').getAttribute('placeholder'), 'Find');
  assert.deepEqual([...root.querySelectorAll('.muxui-sidebar__nav-children a')].map((link) => link.getAttribute('href')), ['/a']);
  assert.equal(root.querySelector('details').open, true);
  assert.equal(root.querySelector('.muxui-sidebar__account-name').textContent, 'Ada');
  assert.equal(root.querySelector('.muxui-sidebar__account-email').textContent, 'ada@example.com');
  assert.ok(root.querySelector('.muxui-sidebar__account-status--online'));
  const sections = stateSections('Sidebar').sections;
  assert.equal(sections.get('current').querySelector('.muxui-sidebar__nav-link').getAttribute('aria-current'), 'page');
  assert.ok(sections.get('external').querySelector('.muxui-sidebar__nav-external'));
  assert.equal(sections.get('expanded').querySelector('details').open, true);
  // collapsed folds the rail through Provider, not the Roadmap group.
  const rail = sections.get('collapsed');
  assert.equal(rail.querySelector('.muxui-sidebar').hasAttribute('data-collapsed'), true);
  assert.equal(rail.querySelector('.muxui-sidebar__toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(sections.get('expanded').querySelector('.muxui-sidebar').hasAttribute('data-collapsed'), false);
  assert.equal(sections.get('expanded').querySelector('.muxui-sidebar__toggle').getAttribute('aria-expanded'), 'true');
  const sidebarStoryArgs = createStory(currentRecord('Sidebar'), 'states').args;
  for (const name of ['current', 'defaultCollapsed', 'defaultExpanded', 'external']) assert.equal(Object.hasOwn(sidebarStoryArgs, name), false, name);
  // A supplied defaultCollapsed wins over the row, even when it is the default value.
  assert.equal(stateSections('Sidebar', { ...sidebarStoryArgs, defaultCollapsed: false }).sections.get('collapsed').querySelector('.muxui-sidebar').hasAttribute('data-collapsed'), false);

  await withRuntime(async ({ host, root: reactRoot }) => {
    const story = createEventsStory(currentRecord('Sidebar'));
    await act(async () => reactRoot.render(story.render(story.args)));
    const log = () => host.querySelector('[data-muxui-storybook-event-log]').textContent;
    // React binds text-input events when its DOM module loads, before this jsdom exists, so call the input's own
    // handler with a React-shaped change event. The browser audit types into the field for real.
    const input = host.querySelector('.muxui-sidebar__search-input');
    input.value = 'roadmap';
    const { onChange } = input[Object.keys(input).find((key) => key.startsWith('__reactProps'))];
    await act(async () => onChange({ type: 'change', target: input, nativeEvent: new Event('input') }));
    assert.match(log(), /change: \{type:change,value:"roadmap"\}/u);
    assert.ok(host.querySelector('.muxui-sidebar__feature-card'));
    await act(async () => host.querySelector('.muxui-sidebar__feature-card-dismiss').click());
    assert.match(log(), /dismiss:/u);
    assert.equal(host.querySelector('.muxui-sidebar__feature-card'), null, 'the consumer removes a dismissed card');

    await act(async () => host.querySelector('.muxui-sidebar__mobile-menu-btn').click());
    await settleRuntime();
    const drawer = document.querySelector('.muxui-sidebar__mobile-dialog');
    assert.ok(drawer, 'the drawer opens');
    const desktop = [...host.querySelectorAll('.muxui-sidebar .muxui-sidebar__nav-list a')].map((link) => link.getAttribute('href'));
    assert.deepEqual([...drawer.querySelectorAll('a')].map((link) => link.getAttribute('href')), desktop);
    assert.ok(desktop.length >= 5 && desktop.every((href) => href.startsWith('#')), 'working destinations, not a placeholder word');
  });
});

test('InputTags keeps supplied seeds and copy, and offers placement and tag-focus specimens', async () => {
  const tags = (args) => new JSDOM(renderToStaticMarkup(renderFamily('InputTags', args))).window.document;
  const supplied = tags({ defaultValue: ['One'], label: 'Skills', placeholder: 'Add a skill' });
  assert.deepEqual([...supplied.querySelectorAll('.muxui-input-tags__tag')].map((tag) => tag.textContent), ['One']);
  assert.equal(supplied.querySelector('.muxui-input-tags__label').textContent, 'Skills');
  assert.equal(supplied.querySelector('input').hasAttribute('aria-label'), false, 'the visible label names the input');
  const empty = tags({ defaultValue: [], label: '', 'aria-label': 'Skills' });
  assert.equal(empty.querySelector('.muxui-input-tags__tag'), null);
  assert.equal(empty.querySelector('input').getAttribute('aria-label'), 'Skills');
  assert.equal(empty.querySelector('input').getAttribute('placeholder'), 'Add a tag');
  assert.deepEqual([...tags({}).querySelectorAll('.muxui-input-tags__tag')].map((tag) => tag.textContent), ['Mux', 'UI']);
  const controlled = createControlledStory(currentRecord('InputTags'));
  assert.deepEqual([...tags(controlled.args).querySelectorAll('.muxui-input-tags__tag')].map((tag) => tag.textContent), ['Mux', 'UI']);

  const { document: states, sections } = stateSections('InputTags');
  // The disabled row renders: its label is a real label for the disabled input.
  assert.equal(states.querySelectorAll('[data-muxui-storybook-state="unavailable"]').length, 0);
  const disabledRow = sections.get('disabled');
  assert.equal(disabledRow.querySelector('input').disabled, true);
  assert.equal(disabledRow.querySelector('.muxui-input-tags__label').control, disabledRow.querySelector('input'));
  assert.equal(sections.get('inline').querySelector('.muxui-input-tags').classList.contains('muxui-input-tags--below'), false);
  assert.equal(sections.get('below').querySelector('.muxui-input-tags').classList.contains('muxui-input-tags--below'), true);
  assert.equal(sections.get('invalid').querySelector('.muxui-input-tags').hasAttribute('data-invalid'), true);
  // A changed control still wins over the named state.
  const emptied = stateSections('InputTags', { ...createStory(currentRecord('InputTags'), 'states').args, defaultValue: [] }).sections;
  assert.equal(emptied.get('inline').querySelectorAll('.muxui-input-tags__tag').length, 0);

  await withRuntime(async ({ host, root: reactRoot }) => {
    const story = createStory(currentRecord('InputTags'), 'states');
    await act(async () => reactRoot.render(story.render(story.args)));
    await settleRuntime(100);
    const focusedTag = [...host.querySelectorAll('.muxui-storybook-state')].find((node) => node.querySelector('h3').textContent === 'tag-focused');
    assert.ok(focusedTag.querySelector('.muxui-input-tags__tag').contains(document.activeElement), `keyboard focus rests on a tag, not ${document.activeElement?.outerHTML.slice(0, 160)} in ${document.activeElement?.closest('.muxui-storybook-state')?.querySelector('h3')?.textContent}`);
  });
});

test('RadioField renders its own parts inside RadioGroup and routes field props to the first field', async () => {
  const doc = (args) => new JSDOM(renderToStaticMarkup(renderFamily('RadioField', args))).window.document;
  const base = doc({});
  assert.equal(base.querySelector('.muxui-radio'), null, 'no RadioGroup option stands in for a field');
  const fields = [...base.querySelectorAll('.muxui-radio-field')];
  assert.equal(fields.length, 2);
  for (const part of ['button', 'indicator', 'dot', 'description']) {
    assert.equal(base.querySelectorAll(`.muxui-radio-field__${part}`).length, 2, part);
  }
  assert.equal(base.querySelectorAll('.muxui-radio-field__button')[0].hasAttribute('data-selected'), true);
  assert.equal(base.querySelectorAll('.muxui-radio-field__button')[1].hasAttribute('data-selected'), false);
  const state = doc({ disabled: true, invalid: true, size: 'sm' });
  const [first, second] = state.querySelectorAll('.muxui-radio-field');
  assert.equal(first.hasAttribute('data-disabled'), true);
  assert.equal(second.hasAttribute('data-disabled'), false);
  assert.ok(first.querySelector('.muxui-radio-field__error'));
  assert.equal(second.querySelector('.muxui-radio-field__error'), null);
  assert.ok([first, second].every((field) => field.classList.contains('muxui-radio-field--sm')));
  // The second radio takes its own value, so choosing either plan checks exactly one radio.
  for (const value of ['monthly', 'annual', 'weekly']) {
    const inputs = [...doc({ value }).querySelectorAll('.muxui-radio-field input[type="radio"]')];
    assert.deepEqual(inputs.map((input) => input.value).sort(), [value, value === 'annual' ? 'monthly' : 'annual'].sort(), value);
    assert.deepEqual(inputs.filter((input) => input.checked).map((input) => input.value), [value], `${value}: exactly one radio is checked`);
  }
  assert.ok(BROWSER_PROOF_FAMILIES.includes('RadioField'));
  await withRuntime(async ({ host, root: reactRoot }) => {
    const story = createBrowserProofStory(currentRecord('RadioField'));
    await act(async () => reactRoot.render(story.render(story.args)));
    await act(async () => story.play({ canvasElement: host }));
    assert.equal(host.getAttribute('data-muxui-browser-proof-status'), 'passed');
  });
});

test('TagSelect follows the Set key contract and lets item and label controls through', async () => {
  const controlled = createControlledStory(currentRecord('TagSelect'));
  const uncontrolled = createUncontrolledStory(currentRecord('TagSelect'));
  assert.deepEqual([...controlled.args.selectedKeys], ['design']);
  assert.deepEqual([...uncontrolled.args.defaultSelectedKeys], ['design']);
  assert.equal(Object.hasOwn(controlled.args, 'defaultSelectedKeys'), false);
  assert.equal(Object.hasOwn(createStory(currentRecord('TagSelect'), 'default').args, 'items'), false, 'sample items fill an empty default list');

  const doc = (args) => new JSDOM(renderToStaticMarkup(renderFamily('TagSelect', args))).window.document;
  const supplied = doc({ label: 'Skills', placeholder: 'Pick', items: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }], defaultSelectedKeys: new Set(['b']) });
  assert.equal(supplied.querySelector('.muxui-tag-select__label').textContent, 'Skills');
  assert.deepEqual([...supplied.querySelectorAll('.muxui-tag-select__tag-text')].map((tag) => tag.textContent), ['Beta']);
  assert.deepEqual([...doc({ items: [{ id: 'x', name: 'By name' }], defaultSelectedKeys: new Set(['x']), getItemLabel: (item) => `Item ${item.id}` }).querySelectorAll('.muxui-tag-select__tag-text')].map((tag) => tag.textContent), ['Item x']);

  const { document: states, sections } = stateSections('TagSelect');
  assert.deepEqual([...sections.get('selected').querySelectorAll('.muxui-tag-select__tag-text')].map((tag) => tag.textContent), ['Design']);
  assert.equal(sections.get('empty').querySelectorAll('.muxui-tag-select__tag').length, 0);
  assert.equal(states.querySelector('[data-muxui-storybook-state="unavailable"]').closest('.muxui-storybook-state').querySelector('h3').textContent, 'filtered');

  await withRuntime(async ({ host, root: reactRoot }) => {
    await act(async () => reactRoot.render(controlled.render(controlled.args)));
    const values = () => JSON.parse(host.querySelector('[data-muxui-controlled-values]').textContent);
    assert.deepEqual(values().selectedKeys, ['design']);
    await act(async () => host.querySelector('.muxui-tag-select__input').focus());
    await settleRuntime(60);
    const option = [...document.querySelectorAll('.muxui-tag-select__item')].find((node) => node.textContent === 'Code');
    assert.ok(option, 'the unselected item is offered');
    await act(async () => option.click());
    await settleRuntime(60);
    assert.deepEqual(values().selectedKeys, ['design', 'code']);
    await act(async () => host.querySelectorAll('.muxui-tag-select__tag-remove')[0].click());
    await settleRuntime(60);
    assert.deepEqual(values().selectedKeys, ['code']);

    // The popup names unselected items with the resolver the tags use: getItemLabel, else name, label, then id.
    const items = [{ id: 'x', name: 'By name' }, { id: 'y', label: 'By label' }, { id: 'z' }];
    const optionLabels = async (key, args) => {
      await act(async () => reactRoot.render(React.cloneElement(renderFamily('TagSelect', { items, ...args }), { key })));
      await act(async () => host.querySelector('.muxui-tag-select__input').focus());
      await settleRuntime(60);
      return [...document.querySelectorAll('.muxui-tag-select__item')].map((node) => node.textContent);
    };
    assert.deepEqual(await optionLabels('fallback-labels', {}), ['By name', 'By label', 'z']);
    assert.deepEqual(await optionLabels('custom-labels', { getItemLabel: (item) => `Item ${item.id}` }), ['Item x', 'Item y', 'Item z']);
  });
});

test('TextArea sends native attributes to the textarea and keeps field state on Root', () => {
  const doc = new JSDOM(renderToStaticMarkup(renderFamily('TextArea', { rows: 6, maxLength: 40, placeholder: 'Say more', disabled: true, invalid: true, size: 'sm' }))).window.document;
  const textarea = doc.querySelector('textarea');
  assert.equal(textarea.getAttribute('rows'), '6');
  assert.equal(textarea.getAttribute('maxlength'), '40');
  assert.equal(textarea.getAttribute('placeholder'), 'Say more');
  assert.equal(textarea.disabled, true, 'disabled is Root state, carried to the control');
  const root = doc.querySelector('.muxui-text-area');
  for (const name of ['rows', 'maxlength', 'placeholder']) assert.equal(root.hasAttribute(name), false, name);
  assert.equal(root.hasAttribute('data-invalid'), true);
  assert.equal(root.getAttribute('data-size'), 'sm');
  assert.equal(new JSDOM(renderToStaticMarkup(renderFamily('TextArea', {}))).window.document.querySelector('textarea').getAttribute('placeholder'), 'Add notes');
  const controlled = createControlledStory(currentRecord('TextArea'));
  assert.equal(new JSDOM(renderToStaticMarkup(controlled.render(controlled.args))).window.document.querySelector('textarea').value, '');
});

test('AlertDialog nests Backdrop, Popup, and Content and routes state and activation to their owners', async () => {
  await withRuntime(async ({ host, root: reactRoot }) => {
    const calls = [];
    const props = { onOpenChange: (open) => calls.push(['open', open]), onActivate: () => calls.push(['activate']) };
    await act(async () => reactRoot.render(renderFamily('AlertDialog', props)));
    assert.equal(document.querySelector('.muxui-alert-dialog__backdrop'), null);
    await act(async () => host.querySelector('.muxui-alert-dialog__trigger').click());
    await settleRuntime();
    const backdrop = document.querySelector('.muxui-alert-dialog__backdrop');
    const popup = backdrop.querySelector('.muxui-alert-dialog__popup');
    const content = popup.querySelector('.muxui-alert-dialog__content');
    assert.ok(content, 'Backdrop > Popup > Content');
    assert.equal(content.getAttribute('role'), 'alertdialog');
    const sorted = (entries) => entries.map((entry) => entry.join(':')).sort();
    assert.deepEqual(sorted(calls), ['activate', 'open:true']);
    await act(async () => content.querySelector('.muxui-alert-dialog__close').click());
    await settleRuntime();
    assert.deepEqual(sorted(calls.slice(2)), ['activate', 'open:false']);

    // defaultOpen and open keep their own meanings.
    await act(async () => reactRoot.render(React.cloneElement(renderFamily('AlertDialog', { defaultOpen: true }), { key: 'default-open' })));
    await settleRuntime();
    assert.ok(document.querySelector('.muxui-alert-dialog__content'), 'defaultOpen opens the dialog');
    await act(async () => reactRoot.render(React.cloneElement(renderFamily('AlertDialog', { open: false, ...props }), { key: 'controlled' })));
    await settleRuntime();
    await act(async () => host.querySelector('.muxui-alert-dialog__trigger').click());
    await settleRuntime();
    assert.equal(document.querySelector('.muxui-alert-dialog__content'), null, 'a controlled open stays closed until its owner changes it');
    assert.deepEqual(sorted(calls.slice(-2)), ['activate', 'open:true']);

    const disabled = renderToStaticMarkup(renderFamily('AlertDialog', { disabled: true }));
    assert.match(disabled, /<button[^>]*class="muxui-alert-dialog__trigger"[^>]*disabled/u);
  });
});

test('AlertDialog Controlled and Events stories report the callbacks of their owners', async () => {
  await withRuntime(async ({ host, root: reactRoot }) => {
    const controlled = createControlledStory(currentRecord('AlertDialog'));
    await act(async () => reactRoot.render(controlled.render(controlled.args)));
    const value = () => JSON.parse(host.querySelector('[data-muxui-controlled-values]').textContent).open;
    assert.equal(value(), false);
    await act(async () => host.querySelector('.muxui-alert-dialog__trigger').click());
    await settleRuntime();
    assert.equal(value(), true);
    await act(async () => document.querySelector('.muxui-alert-dialog__close').click());
    await settleRuntime();
    assert.equal(value(), false);
    const events = createEventsStory(currentRecord('AlertDialog'));
    await act(async () => reactRoot.render(React.cloneElement(events.render(events.args), { key: 'events' })));
    await act(async () => host.querySelector('.muxui-alert-dialog__trigger').click());
    await settleRuntime();
    const log = host.querySelector('[data-muxui-storybook-event-log]').textContent;
    assert.match(log, /activate:/u);
    assert.match(log, /openChange: true/u);
  });
});

test('CommandPalette routes hook, Backdrop, and Item inputs to their owners', async () => {
  const open = (args) => renderFamily('CommandPalette', { defaultOpen: true, ...args });
  const titles = () => [...document.querySelectorAll('.muxui-command-palette__item-title')].map((node) => node.textContent);
  await withRuntime(async ({ root: reactRoot }) => {
    await act(async () => reactRoot.render(open({})));
    await settleRuntime();
    assert.deepEqual(titles(), ['Save', 'Open', 'Open settings']);
    assert.deepEqual([...document.querySelectorAll('.muxui-command-palette__section-header')].map((node) => node.textContent), ['Suggestions', 'Workspace']);
    // The query filters the supplied commands, through the hook.
    await act(async () => reactRoot.render(React.cloneElement(open({ query: 'sett' }), { key: 'query' })));
    await settleRuntime();
    assert.deepEqual(titles(), ['Open settings']);
    assert.equal(document.querySelector('.muxui-command-palette__input').value, 'sett');
    await act(async () => reactRoot.render(React.cloneElement(open({ query: 'zzz' }), { key: 'empty' })));
    await settleRuntime();
    assert.deepEqual(titles(), []);
    assert.ok(document.querySelector('.muxui-command-palette__empty'));
    // filter: false and a caller command list configure the hook.
    await act(async () => reactRoot.render(React.cloneElement(open({ query: 'zzz', filter: false }), { key: 'no-filter' })));
    await settleRuntime();
    assert.equal(titles().length, 3);
    await act(async () => reactRoot.render(React.cloneElement(open({ commands: [{ id: 'only', title: 'Only command' }] }), { key: 'commands' })));
    await settleRuntime();
    assert.deepEqual(titles(), ['Only command']);
    await act(async () => reactRoot.render(React.cloneElement(open({ title: 'Renamed', href: '/x' }), { key: 'item-props' })));
    await settleRuntime();
    assert.deepEqual(titles().slice(0, 1), ['Renamed']);
    assert.equal(document.querySelector('.muxui-command-palette__item').getAttribute('href'), '/x');
  });
});

test('CommandPalette reports the hook and Item callbacks and honours dismissable on the Backdrop', async () => {
  await withRuntime(async ({ root: reactRoot }) => {
    const calls = [];
    const props = {
      defaultOpen: true,
      onActivate: (event) => calls.push(['activate', event.id]),
      onAction: (command) => calls.push(['action', command.id]),
      onOpenChange: (next) => calls.push(['open', next]),
      onError: (error, command) => calls.push(['error', error.message, command.id]),
      onQueryChange: (query) => calls.push(['query', query]),
      commands: [{ id: 'ok', title: 'Works' }, { id: 'bad', title: 'Breaks', action: () => { throw new Error('nope'); } }],
    };
    await act(async () => reactRoot.render(renderFamily('CommandPalette', props)));
    await settleRuntime();
    const items = () => [...document.querySelectorAll('.muxui-command-palette__item')];
    await act(async () => items()[1].click());
    await settleRuntime();
    assert.deepEqual(calls, [['activate', 'bad'], ['error', 'nope', 'bad']]);
    await act(async () => items()[0].click());
    await settleRuntime();
    assert.deepEqual(calls.slice(2), [['activate', 'ok'], ['action', 'ok'], ['open', false]]);

    // dismissable reaches the Backdrop, not Root; a real pointer press outside is covered by the browser audit.
    const backdropProp = (name) => {
      const node = document.querySelector('.muxui-command-palette__backdrop');
      for (let fiber = node[Object.keys(node).find((key) => key.startsWith('__reactFiber'))]; fiber; fiber = fiber.return) {
        if (fiber.memoizedProps && name in fiber.memoizedProps) return fiber.memoizedProps[name];
      }
      return undefined;
    };
    for (const dismissable of [false, true]) {
      await act(async () => reactRoot.render(React.cloneElement(renderFamily('CommandPalette', { defaultOpen: true, dismissable }), { key: `dismissable-${dismissable}` })));
      await settleRuntime();
      assert.equal(backdropProp('isDismissable'), dismissable);
      assert.equal(document.querySelector('.muxui-command-palette').hasAttribute('dismissable'), false, 'Root does not receive it');
    }
  });
});

test('CommandPalette Controlled story drives open state and query from their callbacks', async () => {
  await withRuntime(async ({ host, root: reactRoot }) => {
    const story = createControlledStory(currentRecord('CommandPalette'));
    assert.equal(story.args.query, '');
    assert.equal(Object.hasOwn(story.args, 'defaultQuery'), false);
    assert.equal(createUncontrolledStory(currentRecord('CommandPalette')).args.defaultQuery, '');
    await act(async () => reactRoot.render(story.render(story.args)));
    const values = () => JSON.parse(host.querySelector('[data-muxui-controlled-values]').textContent);
    assert.deepEqual(values(), { open: false, query: '' });
    await act(async () => host.querySelector('.muxui-command-palette__trigger').click());
    await settleRuntime();
    assert.equal(values().open, true);
    await act(async () => document.querySelector('.muxui-command-palette__close').click());
    await settleRuntime();
    assert.equal(values().open, false);
  });
});

test('Lightbox Controlled story updates open and selection from callbacks and shows the selected item', async () => {
  const lightbox = currentRecord('Lightbox');
  const controlled = createControlledStory(lightbox);
  assert.equal(controlled.args.selectedKey, 'one');
  assert.equal(Object.hasOwn(controlled.args, 'defaultSelectedKey'), false);
  assert.equal(createUncontrolledStory(lightbox).args.defaultSelectedKey, 'one');
  await withRuntime(async ({ host, root: reactRoot }) => {
    await act(async () => reactRoot.render(controlled.render(controlled.args)));
    const values = () => JSON.parse(host.querySelector('[data-muxui-controlled-values]').textContent);
    assert.deepEqual(values(), { open: false, selectedKey: 'one' });
    const triggers = [...host.querySelectorAll('.muxui-lightbox-trigger')];
    assert.deepEqual(triggers.map((node) => node.textContent), ['Open One', 'Open Two']);
    await act(async () => triggers[1].click());
    await settleRuntime(60);
    assert.deepEqual(values(), { open: true, selectedKey: 'two' });
    assert.equal(document.querySelector('.muxui-lightbox-content-layer--current').textContent, 'Item 2 of 2');
    assert.equal(document.querySelector('.muxui-lightbox-caption').textContent, 'Two');
    await act(async () => document.querySelector('.muxui-lightbox-previous').click());
    await settleRuntime(60);
    assert.deepEqual(values(), { open: true, selectedKey: 'one' });
    assert.equal(document.querySelector('.muxui-lightbox-caption').textContent, 'One');
    await act(async () => document.querySelector('.muxui-lightbox-close').click());
    await settleRuntime(60);
    assert.equal(values().open, false);
    const events = createEventsStory(lightbox);
    await act(async () => reactRoot.render(React.cloneElement(events.render(events.args), { key: 'events' })));
    await act(async () => host.querySelectorAll('.muxui-lightbox-trigger')[0].click());
    await settleRuntime(60);
    assert.match(host.querySelector('[data-muxui-storybook-event-log]').textContent, /openChange: true/u);
  });
});

test('Menu uses the triggered composition for open-state stories and keeps the plain list scoped to the default', async () => {
  const menu = currentRecord('Menu');
  const plain = new JSDOM(renderToStaticMarkup(renderFamily('Menu', storyArgsForBinding(menu.binding, 'default', 'Menu')))).window.document;
  assert.ok(plain.querySelector('.muxui-menu'));
  assert.equal(plain.querySelector('.muxui-menu-trigger'), null, 'the default is the action list');
  assert.equal(Object.hasOwn(storyArgsForBinding(menu.binding, 'default', 'Menu'), 'defaultOpen'), false);
  assert.equal(createUncontrolledStory(menu).args.defaultOpen, false);
  assert.equal(createControlledStory(menu).args.open, false);

  await withRuntime(async ({ host, root: reactRoot }) => {
    const controlled = createControlledStory(menu);
    await act(async () => reactRoot.render(controlled.render(controlled.args)));
    const values = () => JSON.parse(host.querySelector('[data-muxui-controlled-values]').textContent);
    const trigger = host.querySelector('.muxui-menu-trigger');
    assert.ok(trigger, 'Controlled uses Menu.Root with a trigger');
    assert.equal(document.querySelector('.muxui-menu-popup'), null);
    await act(async () => trigger.click());
    await settleRuntime();
    assert.equal(values().open, true);
    assert.deepEqual([...document.querySelectorAll('.muxui-menu-popup .muxui-menu-item')].map((node) => node.textContent), ['Save', 'Delete']);
    await act(async () => document.querySelector('.muxui-menu-item').click());
    await settleRuntime();
    assert.equal(values().open, false, 'choosing an item closes the popup through onOpenChange');

    const uncontrolled = createUncontrolledStory(menu);
    await act(async () => reactRoot.render(React.cloneElement(uncontrolled.render(uncontrolled.args), { key: 'uncontrolled' })));
    await act(async () => host.querySelector('.muxui-menu-trigger').click());
    await settleRuntime();
    assert.ok(document.querySelector('.muxui-menu-popup'), 'Uncontrolled opens its own popup');

    const events = createEventsStory(menu);
    await act(async () => reactRoot.render(React.cloneElement(events.render(events.args), { key: 'events' })));
    await act(async () => host.querySelector('.muxui-menu-trigger').click());
    await settleRuntime();
    await act(async () => document.querySelector('.muxui-menu-item').click());
    await settleRuntime();
    const log = host.querySelector('[data-muxui-storybook-event-log]').textContent;
    assert.match(log, /openChange: true/u);
    assert.match(log, /action:/u);

    // Popup geometry belongs to the popup: the placement row opens its own popup, placed on top.
    const states = createStory(menu, 'states');
    await act(async () => reactRoot.render(React.cloneElement(states.render(states.args), { key: 'states' })));
    await settleRuntime();
    const rowPopup = (row) => {
      const trigger = [...host.querySelectorAll('.muxui-storybook-state')].find((node) => node.querySelector('h3').textContent === row).querySelector('.muxui-menu-trigger');
      return document.getElementById(trigger.getAttribute('aria-controls'));
    };
    assert.equal(document.querySelectorAll('.muxui-menu-popup').length, 2, 'the open and placement rows each show a popup');
    assert.equal(ancestorProp(rowPopup('placement'), 'placement'), 'top');
    assert.equal(ancestorProp(rowPopup('open'), 'placement'), 'bottom start', 'React Aria spells the default bottom-start with a space');
    for (const row of ['open', 'placement']) {
      const room = [...host.querySelectorAll('.muxui-storybook-state')].find((node) => node.querySelector('h3').textContent === row).querySelector('[data-muxui-storybook-popup-room]');
      assert.equal(room.style.minBlockSize, '14rem', `${row} reserves room for its popup`);
      assert.ok(room.querySelector('.muxui-menu-trigger'));
    }
  });
});

test('Image shows fallback recovery and final failure, and names the source it ended on', async () => {
  const { document: states } = stateSections('Image');
  // Recovery has specimens; only the radius rows are labelled unavailable, with their reason.
  const unavailable = [...states.querySelectorAll('[data-muxui-storybook-state="unavailable"]')];
  assert.deepEqual(unavailable.map((node) => node.closest('.muxui-storybook-state').querySelector('h3').textContent), ['radius-sm', 'radius-md', 'radius-lg', 'radius-full']);
  assert.ok(unavailable.every((node) => /because the colour audit accepts only a transparent image/u.test(node.textContent)));

  await withRuntime(async ({ host, root: reactRoot }) => {
    const story = createStory(currentRecord('Image'), 'states');
    await act(async () => reactRoot.render(story.render(story.args)));
    await settleRuntime(60);
    const row = (name) => [...host.querySelectorAll('.muxui-storybook-state')].find((node) => node.querySelector('h3').textContent === name);
    const caption = (name) => row(name).querySelector('figcaption').textContent;
    // jsdom loads no images, so raise each source's error as the browser does.
    const fail = (name) => act(async () => row(name).querySelector('img').dispatchEvent(new Event('error')));

    assert.equal(caption('fallback'), 'Loading the primary source.');
    await fail('fallback');
    assert.equal(row('fallback').querySelector('img').hasAttribute('data-fallback'), true);
    assert.match(row('fallback').querySelector('img').getAttribute('src'), /^data:image\/gif/u, 'the working fallback is the verified transparent pixel');
    await settleRuntime(20);
    assert.equal(caption('fallback'), 'Primary source failed; using fallbackSrc.');

    await fail('error');
    await fail('error');
    assert.equal(row('error').querySelector('img').hasAttribute('data-error'), true);
    await settleRuntime(20);
    assert.equal(caption('error'), 'Primary and fallback sources failed.');
    assert.equal(row('error').querySelector('img').style.visibility, 'hidden', 'a failed image is not painted in the page');
    assert.equal(row('fallback').querySelector('img').style.visibility, '', 'a recovered image is');
  });

  await withRuntime(async ({ host, root: reactRoot }) => {
    const image = () => host.querySelector('img');
    const caption = () => host.querySelector('figcaption').textContent;
    // With no fallback supplied, a failure names the primary source alone.
    await act(async () => reactRoot.render(React.cloneElement(renderFamily('Image', { src: AVATAR_FAILING_SRC }), { key: 'primary-only' })));
    await act(async () => image().dispatchEvent(new Event('error')));
    await settleRuntime(20);
    assert.equal(image().hasAttribute('data-error'), true);
    assert.equal(image().hasAttribute('data-fallback'), false, 'no fallback was attempted');
    assert.equal(caption(), 'Primary source failed; no fallback source was supplied.');

    // A loaded source replaced by a pending one starts the caption over.
    await act(async () => reactRoot.render(React.cloneElement(renderFamily('Image', { src: '/a.png' }), { key: 'changing' })));
    await act(async () => image().dispatchEvent(new Event('load')));
    assert.equal(caption(), 'Primary source loaded.');
    await act(async () => reactRoot.render(React.cloneElement(renderFamily('Image', { src: '/b.png' }), { key: 'changing' })));
    await settleRuntime(20);
    assert.equal(image().getAttribute('src'), '/b.png');
    assert.equal(caption(), 'Loading the primary source.');
    await act(async () => image().dispatchEvent(new Event('load')));
    assert.equal(caption(), 'Primary source loaded.');
  });
});

test('Link without a destination renders disabled even when disabled is false', () => {
  const link = (args) => new JSDOM(renderToStaticMarkup(renderFamily('Link', args))).window.document.querySelector('.muxui-link');
  assert.equal(link({}).localName, 'a', 'the default specimen has a destination');
  assert.equal(link({}).getAttribute('href'), '/settings');
  assert.equal(link({ href: '/guide', disabled: false }).getAttribute('href'), '/guide');
  for (const args of [{ href: undefined }, { href: '' }, { href: undefined, disabled: false }]) {
    const disabled = link(args);
    assert.equal(disabled.getAttribute('aria-disabled'), 'true', JSON.stringify(args));
    assert.equal(disabled.hasAttribute('href'), false, JSON.stringify(args));
  }

  const { sections } = stateSections('Link');
  assert.equal(sections.get('idle').querySelector('.muxui-link').getAttribute('href'), '/settings');
  assert.equal(sections.get('disabled').querySelector('.muxui-link').getAttribute('aria-disabled'), 'true', 'the disabled row is really disabled');
  assert.equal(sections.get('current').querySelector('.muxui-link').getAttribute('aria-current'), 'page');
  for (const name of ['no-href', 'empty-href']) {
    const specimen = sections.get(name).querySelector('.muxui-link');
    assert.equal(specimen.getAttribute('aria-disabled'), 'true', name);
    assert.equal(specimen.hasAttribute('href'), false, name);
    assert.equal(sections.get(name).querySelector('[data-muxui-storybook-state="unavailable"]'), null, name);
  }
});

test('ProgressCircle shows unknown progress beside determinate values with no invented percent', () => {
  const { document: states, sections } = stateSections('ProgressCircle');
  assert.equal(states.querySelector('[data-muxui-storybook-state="unavailable"]'), null);
  const bar = (name) => sections.get(name).querySelector('[role="progressbar"]');
  assert.equal(bar('indeterminate').hasAttribute('aria-valuenow'), false, 'unknown progress exposes no value');
  assert.equal(bar('indeterminate').querySelector('.muxui-progress-circle__value').textContent, '', 'and shows no percent');
  assert.ok(bar('indeterminate').hasAttribute('data-indeterminate'));
  for (const [name, now] of [['zero', '0'], ['partial', '50'], ['complete', '100']]) assert.equal(bar(name).getAttribute('aria-valuenow'), now, name);
  assert.equal(createStory(currentRecord('ProgressCircle'), 'default').args.value, null, 'the default specimen is the unknown-progress one');
});

test('Button Matrix statically covers every finite visual tuple and States keeps pending/disabled', () => {
  const binding = descriptor.bindings.find(({ export: family }) => family === 'Button');
  assert.ok(binding, 'Button descriptor binding');
  const record = { family: 'Button', tranche: 'R1.1', binding };
  const matrix = createButtonMatrixStory(record);
  assert.equal(matrix.name, 'Variant × size');
  const matrixMarkup = renderToStaticMarkup(matrix.render(matrix.args));
  const matrixDom = new JSDOM(matrixMarkup).window.document;
  const buttons = [...matrixDom.querySelectorAll('.muxui-button')];
  const tuples = buttons.map((button) => [
    button.getAttribute('data-variant'),
    button.getAttribute('data-size'),
  ].join('/'));
  assert.equal(buttons.length, 21, 'Button Matrix renders all finite variants and sizes');
  assert.equal(new Set(tuples).size, 21, 'Button Matrix tuples are unique');
  assert.deepEqual(new Set(tuples), new Set(
    ['sm', 'md', 'lg'].flatMap((size) => ['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse'].map((variant) => `${variant}/${size}`)),
  ));
  assert.deepEqual(Object.keys(matrix.argTypes).sort(), binding.api.props.slice().sort());

  const states = createStory(record, 'states');
  const statesMarkup = renderToStaticMarkup(states.render(states.args));
  assert.match(statesMarkup, /<h3[^>]*>pending<\/h3>/u, 'Button States includes pending');
  assert.match(statesMarkup, /<h3[^>]*>disabled<\/h3>/u, 'Button States includes disabled');
});

test('generated event and mode harnesses are behaviorally live', async () => {
  const env = installRuntimeDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const byFamily = new Map(descriptor.bindings.map((binding) => [binding.export, binding]));
  const loadStory = async (family) => {
    const record = historicalManifest.families.find(({ family: name }) => name === family);
    const slug = family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const tranche = record.tranche.replace('.', '-').toLowerCase();
    return import(`../.storybook/generated/${tranche}-${slug}.stories.mjs`);
  };
  try {
    const button = await loadStory('Button');
    await act(async () => root.render(button.Events.render(button.Events.args)));
    await act(async () => host.querySelector('.muxui-button').click());
    assert.match(host.querySelector('[data-muxui-storybook-event-log]').textContent, /activate:/u);

    const checkbox = await loadStory('Checkbox');
    await act(async () => root.render(checkbox.Controlled.render(checkbox.Controlled.args)));
    const controlledInput = host.querySelector('.muxui-checkbox input');
    assert.ok(controlledInput, 'controlled Checkbox input');
    await act(async () => controlledInput.click());
    assert.match(host.querySelector('[data-muxui-controlled-values]').textContent, /"checked":true/u);
    assert.equal(host.querySelector('.muxui-checkbox').getAttribute('data-selected'), 'true');

    await act(async () => root.render(checkbox.Uncontrolled.render(checkbox.Uncontrolled.args)));
    const uncontrolledInput = host.querySelector('.muxui-checkbox input');
    assert.ok(uncontrolledInput, 'uncontrolled Checkbox input');
    const uncontrolledDefaults = host.querySelector('[data-muxui-uncontrolled-values]').textContent;
    await act(async () => uncontrolledInput.click());
    assert.equal(host.querySelector('[data-muxui-uncontrolled-values]').textContent, uncontrolledDefaults);
    assert.equal(host.querySelector('.muxui-checkbox').getAttribute('data-selected'), 'true');

    const anatomy = await loadStory('ColorPicker');
    await act(async () => root.render(anatomy.Anatomy.render(anatomy.Anatomy.args)));
    await act(async () => new Promise((resolvePromise) => setTimeout(resolvePromise, 20)));
    const anatomyParts = [...host.querySelectorAll('[data-muxui-storybook-api-parts] [data-muxui-storybook-api-part-status]')];
    assert.ok(anatomyParts.length >= byFamily.get('ColorPicker').api.parts.length, 'ColorPicker anatomy rows are rendered');
    assert.ok(anatomyParts.some((part) => part.getAttribute('data-muxui-storybook-api-part-status') === 'found'), 'ColorPicker anatomy resolves live DOM hooks');
  } finally {
    await act(async () => root.unmount());
    env.resolveAnimations();
    env.restore();
  }
});

test('Activity stories use its single layout and caller-owned finite statuses', () => {
  const binding = descriptorSource.bindings.find(({ export: name }) => name === 'Activity');
  assert.equal(Object.hasOwn(argTypesForBinding(binding), 'variant'), false);
  const root = new JSDOM(renderToStaticMarkup(renderFamily('Activity', {}))).window.document.querySelector('.muxui-activity');
  assert.equal(root.hasAttribute('data-variant'), false);
  for (const status of ['running', 'failed']) {
    assert.equal(stateArgsForBinding(binding, status, 'Activity').status, status);
  }
});

test('CommandPalette Events story opens from its trigger and closes from its popup', async () => {
  const env = installRuntimeDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  try {
    const story = await import('../.storybook/generated/r1-6-command-palette.stories.mjs');
    await act(async () => root.render(story.Events.render(story.Events.args)));
    const palette = host.querySelector('.muxui-command-palette');
    const trigger = host.querySelector('.muxui-command-palette__trigger');
    assert.ok(palette, 'CommandPalette root');
    assert.ok(trigger, 'CommandPalette trigger');
    assert.equal(palette.hasAttribute('data-open'), false);

    await act(async () => trigger.click());
    assert.equal(palette.hasAttribute('data-open'), true);
    assert.ok(document.body.querySelector('.muxui-command-palette__popup'), 'CommandPalette popup after trigger activation');
    assert.match(host.querySelector('[data-muxui-storybook-event-log]').textContent, /openChange: true/u);

    const close = document.body.querySelector('.muxui-command-palette__close');
    assert.ok(close, 'CommandPalette close control');
    await act(async () => close.click());
    assert.equal(palette.hasAttribute('data-open'), false);
    assert.match(host.querySelector('[data-muxui-storybook-event-log]').textContent, /openChange: false/u);
  } finally {
    await act(async () => root.unmount());
    env.resolveAnimations();
    env.restore();
  }
});

test('anatomy proof resolves every canonical part to a live DOM or executable route', async () => {
  const unresolved = [];
  for (const record of historicalManifest.families) {
    const binding = descriptor.bindings.find(({ export: name }) => name === record.family);
    const env = installRuntimeDom();
    const host = document.querySelector('#root');
    const root = createRoot(host);
    const slug = record.family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const tranche = record.tranche.replace('.', '-').toLowerCase();
    try {
      const story = await import(`../.storybook/generated/${tranche}-${slug}.stories.mjs`);
      await act(async () => root.render(story.Anatomy.render(story.Anatomy.args)));
      // Toast is queued by a declarative effect and rendered by RAC's region on
      // the following task; allow that portal-like queue update to settle.
      await act(async () => new Promise((resolvePromise) => setTimeout(resolvePromise, record.family === 'Toast' ? 100 : 20)));
      const rows = [...host.querySelectorAll(`[data-muxui-storybook-api-parts="${record.family}"] > li`)];
      assert.equal(rows.length, binding.api.parts.length, `${record.family} anatomy part rows`);
      assert.ok(rows.every((row) => row.getAttribute('data-muxui-storybook-api-part-route')), `${record.family} anatomy routes`);
      const missing = rows.filter((row) => {
        const status = row.getAttribute('data-muxui-storybook-api-part-status');
        if (status === 'found') return false;
        return status !== 'executable' || row.getAttribute('data-muxui-storybook-api-part-proof') !== 'browser';
      }).map((row) => row.querySelector('code')?.textContent);
      if (missing.length) unresolved.push(`${record.family}: ${missing.join(', ')}`);
    } finally {
      await act(async () => root.unmount());
      env.resolveAnimations();
      env.restore();
    }
  }
  assert.deepEqual(unresolved, [], 'anatomy unresolved parts');
});

test('control inference and composition adapters preserve canonical values', () => {
  const textFieldBinding = descriptor.bindings.find(({ export: name }) => name === 'TextField');
  const textFieldArgTypes = argTypesForBinding(textFieldBinding);
  for (const name of ['label', 'aria-label', 'value', 'defaultValue', 'name', 'placeholder']) {
    assert.equal(textFieldArgTypes[name].control, 'text', name);
  }

  const comboBoxBinding = descriptor.bindings.find(({ export: name }) => name === 'ComboBox');
  assert.equal(argTypesForBinding(comboBoxBinding).items.control, 'object');
  const numberFieldBinding = descriptor.bindings.find(({ export: name }) => name === 'NumberField');
  assert.equal(argTypesForBinding(numberFieldBinding).value.control.type, 'number');
  assert.equal(argTypesForBinding(numberFieldBinding).minValue.control.type, 'number');
  const dialogBinding = descriptor.bindings.find(({ export: name }) => name === 'Dialog');
  assert.equal(argTypesForBinding(dialogBinding).title.control, 'text');
  assert.equal(argTypesForBinding(dialogBinding).children.control, 'text');
  assert.deepEqual(
    argTypesForBinding(descriptor.bindings.find(({ export: name }) => name === 'Popover')).placement.options,
    declaredUnion(publicTypes, 'MuxUIPlacement'),
  );
  assert.deepEqual(
    argTypesForBinding(descriptor.bindings.find(({ export: name }) => name === 'Toast')).variant.options,
    ['neutral', 'success', 'warning', 'danger'],
  );
  assert.deepEqual(
    argTypesForBinding(descriptor.bindings.find(({ export: name }) => name === 'Tabs')).variant.options,
    ['underline', 'pill', 'overflow', 'segment'],
  );
  assert.equal(argTypesForBinding(descriptor.bindings.find(({ export: name }) => name === 'Popover')).placement.options.includes('left'), false);
  assert.equal(argTypesForBinding(descriptor.bindings.find(({ export: name }) => name === 'Popover')).placement.options.includes('right'), false);
  assert.equal(argTypesForBinding(descriptor.bindings.find(({ export: name }) => name === 'Toast')).variant.options.includes('info'), false);
  assert.equal(argTypesForBinding(descriptor.bindings.find(({ export: name }) => name === 'Toast')).variant.options.includes('error'), false);
  assert.deepEqual(
    argTypesForBinding(descriptor.bindings.find(({ export: name }) => name === 'FileTrigger')).defaultCamera.options,
    ['user', 'environment'],
  );
  assert.equal(
    argTypesForBinding(descriptor.bindings.find(({ export: name }) => name === 'FileTrigger')).defaultCamera.options.includes('front'),
    false,
  );
  assert.deepEqual(
    argTypesForBinding(descriptor.bindings.find(({ export: name }) => name === 'Group')).role.options,
    ['group', 'region', 'presentation'],
  );
  assert.equal(
    argTypesForBinding(descriptor.bindings.find(({ export: name }) => name === 'Group')).role.options.includes('textbox'),
    false,
  );
  assert.deepEqual(
    argTypesForBinding(descriptorSource.bindings.find(({ export: name }) => name === 'Sidebar')).density.options,
    ['default', 'compact'],
  );
  const group = renderFamily('Group', storyArgsForBinding(
    descriptor.bindings.find(({ export: name }) => name === 'Group'),
    'default',
    'Group',
  ));
  const groupMarkup = renderToStaticMarkup(group);
  assert.match(groupMarkup, /role="group"/u);
  assert.match(groupMarkup, /aria-label="Document actions"/u);
  assert.equal((groupMarkup.match(/<button\b/gu) ?? []).length, 3);
  assert.deepEqual(
    React.Children.toArray(group.props.children).map((child) => React.Children.toArray(child.props.children).join('')),
    ['Save', 'Duplicate', 'Archive'],
  );
  const tooltipBinding = descriptor.bindings.find(({ export: name }) => name === 'Tooltip');
  assert.equal(argTypesForBinding(tooltipBinding).content.control, 'text');
  for (const name of ['Dialog', 'Popover', 'PreviewTrigger', 'Tooltip']) {
    const trigger = argTypesForBinding(descriptor.bindings.find(({ export: family }) => family === name)).trigger;
    assert.equal(trigger.control, false, name);
    assert.equal(trigger.table.type.summary, 'React element', name);
  }
  const textField = renderFamily('TextField', {
    label: 'Email',
    value: 'hello@example.com',
    name: 'email',
    placeholder: 'Email address',
  });
  assert.equal(textField.props.label, 'Email');
  assert.equal(textField.props.value, 'hello@example.com');
  assert.equal(textField.props.name, 'email');
  assert.equal(textField.props.placeholder, 'Email address');

  const trigger = React.createElement('button', null, 'Custom trigger');
  const content = React.createElement('p', null, 'Custom content');
  for (const family of ['Dialog', 'Popover', 'PreviewTrigger']) {
    const rendered = renderFamily(family, { trigger, children: content, title: 'Custom title' });
    assert.strictEqual(rendered.props.trigger, trigger, family);
    assert.strictEqual(rendered.props.children, content, family);
    if (family === 'Dialog') assert.equal(rendered.props.title, 'Custom title');
  }
  const tooltip = renderFamily('Tooltip', { trigger, content: 'Custom tooltip' });
  assert.strictEqual(tooltip.props.trigger, trigger);
  assert.equal(tooltip.props.content, 'Custom tooltip');
  assert.equal(renderFamily('DropZone', { children: 'Custom drop target' }).props.children, 'Custom drop target');
  assert.strictEqual(renderFamily('FileTrigger', { children: trigger }).props.children, trigger);
});

test('default and state stories use uncontrolled pairs without collapsing state variants', () => {
  const pairs = [
    ['checked', 'defaultChecked'],
    ['expanded', 'defaultExpanded'],
    ['expandedIds', 'defaultExpandedIds'],
    ['open', 'defaultOpen'],
    ['selected', 'defaultSelected'],
    ['selectedId', 'defaultSelectedId'],
    ['selectedIds', 'defaultSelectedIds'],
    ['value', 'defaultValue'],
  ];
  const bindings = new Map(descriptor.bindings.map((binding) => [binding.export, binding]));
  for (const family of ['Checkbox', 'Disclosure', 'DisclosureGroup', 'ToggleButton', 'Autocomplete', 'Switch']) {
    const binding = bindings.get(family);
    const defaultArgs = storyArgsForBinding(binding, 'default', family);
    const stateArgs = storyArgsForBinding(binding, 'states', family);
    for (const [controlled, uncontrolled] of pairs) {
      if (!binding.api.props.includes(controlled) || !binding.api.props.includes(uncontrolled)) continue;
      assert.equal(defaultArgs[controlled], undefined, `${family} default ${controlled}`);
      assert.notEqual(defaultArgs[uncontrolled], undefined, `${family} default ${uncontrolled}`);
      assert.equal(stateArgs[controlled], undefined, `${family} states ${controlled}`);
      assert.notEqual(stateArgs[uncontrolled], undefined, `${family} states ${uncontrolled}`);
    }
  }

  assert.equal(stateArgsForBinding(bindings.get('Checkbox'), 'selected', 'Checkbox').checked, true);
  assert.equal(stateArgsForBinding(bindings.get('Disclosure'), 'expanded', 'Disclosure').expanded, true);
  assert.deepEqual(
    stateArgsForBinding(bindings.get('DisclosureGroup'), 'expanded', 'DisclosureGroup').expandedIds,
    ['one'],
  );
  assert.equal(stateArgsForBinding(bindings.get('ToggleButton'), 'selected', 'ToggleButton').selected, true);
  assert.equal(stateArgsForBinding(bindings.get('Switch'), 'selected', 'Switch').selected, true);
  assert.equal(storyArgsForBinding(bindings.get('Autocomplete'), 'default', 'Autocomplete').defaultValue, '');
  const emptySearchArgs = stateArgsForBinding(bindings.get('SearchField'), 'empty', 'SearchField');
  assert.equal(emptySearchArgs.value, '');
  assert.match(renderToStaticMarkup(renderFamily('SearchField', emptySearchArgs)), /data-empty="true"/u);
});

test('SearchField empty state renders in the generated States showcase', () => {
  const binding = descriptor.bindings.find(({ export: family }) => family === 'SearchField');
  const emptySearchStates = renderToStaticMarkup(renderStateCoverage({
    family: 'SearchField',
    tranche: 'R1.2',
    binding,
  }));
  assert.doesNotMatch(emptySearchStates, /Unavailable: MuxUI SearchField has no public prop or supported interaction for the empty state/u);
  assert.match(emptySearchStates, /<h3[^>]*>empty<\/h3>[\s\S]*data-empty="true"/u);
});

test('state coverage metadata exposes isolated supported states with canonical args', () => {
  const byFamily = new Map(descriptor.bindings.map((binding) => [binding.export, binding]));
  const comparableCoverage = (coverage) => coverage.map(({ name, args }) => ({
    name,
    args: Object.fromEntries(Object.entries(args).map(([prop, value]) => [prop, typeof value === 'function' ? '[callback]' : value])),
  }));
  for (const record of historicalManifest.families) {
    const binding = byFamily.get(record.family);
    const coverage = stateCoverageForBinding(binding, record.family);
    assert.ok(coverage.length >= record.states.length, record.family);
    assert.deepEqual(coverage.slice(0, record.states.length).map(({ name }) => name), record.states, record.family);
    for (const { name, args } of coverage) {
      assert.ok(Object.keys(args).every((prop) => binding.api.props.includes(prop)
        || record.family === 'TagGroup' && name === 'removable' && prop === 'onRemove'), `${record.family}/${name} leaked a non-Mux UI prop`);
    }
    const story = createStory({ family: record.family, tranche: record.tranche, binding }, 'states');
    assert.deepEqual(comparableCoverage(story.parameters.muxuiStateCoverage), comparableCoverage(coverage), `${record.family} metadata`);
    assert.deepEqual(Object.keys(story.argTypes).sort(), binding.api.props.slice().sort(), `${record.family} controls`);
  }

  const binding = (family) => byFamily.get(family);
  assert.equal(stateArgsForBinding(binding('Button'), 'pending', 'Button').pending, true);
  assert.equal(stateArgsForBinding(binding('Button'), 'pending', 'Button').disabled, false);
  assert.equal(stateArgsForBinding(binding('Checkbox'), 'disabled', 'Checkbox').disabled, true);
  assert.equal(stateArgsForBinding(binding('Checkbox'), 'disabled', 'Checkbox').invalid, false);
  assert.equal(stateArgsForBinding(binding('Checkbox'), 'invalid', 'Checkbox').invalid, true);
  assert.equal(stateArgsForBinding(binding('Checkbox'), 'indeterminate', 'Checkbox').indeterminate, true);
  const checkboxFieldBinding = descriptorSource.bindings.find(({ export: family }) => family === 'CheckboxField');
  assert.ok(checkboxFieldBinding);
  assert.equal(stateArgsForBinding(checkboxFieldBinding, 'checked', 'CheckboxField').checked, true);
  assert.equal(stateArgsForBinding(checkboxFieldBinding, 'unchecked', 'CheckboxField').checked, false);
  assert.equal(stateArgsForBinding(binding('TextField'), 'read-only', 'TextField').readOnly, true);
  assert.equal(stateArgsForBinding(binding('Disclosure'), 'expanded', 'Disclosure').expanded, true);
  assert.equal(stateArgsForBinding(binding('Dialog'), 'open', 'Dialog').open, true);
  assert.equal(stateArgsForBinding(binding('DropZone'), 'drop-target', 'DropZone').disabled, false);
  assert.equal(stateArgsForBinding(binding('DropZone'), 'dragging', 'DropZone').disabled, false);
  assert.equal(stateArgsForBinding(binding('Popover'), 'placement', 'Popover').placement, 'top');
  assert.equal(stateArgsForBinding(binding('Popover'), 'entering', 'Popover').open, true);
  assert.equal(stateArgsForBinding(binding('Popover'), 'exiting', 'Popover').open, false);

  const rendered = renderStateCoverage({ family: 'Button', tranche: 'R1.1', binding: binding('Button') });
  assert.equal(rendered.type, 'div');
  assert.equal(rendered.props.className, 'muxui-storybook-states');
  assert.equal(rendered.props.children.length, binding('Button').states.length);
});

test('CheckboxField checked and unchecked coverage renders available icon states', () => {
  const checkboxFieldBinding = descriptorSource.bindings.find(({ export: family }) => family === 'CheckboxField');
  assert.ok(checkboxFieldBinding);
  const markup = renderToStaticMarkup(renderStateCoverage({
    family: 'CheckboxField',
    tranche: 'R1.6',
    binding: checkboxFieldBinding,
  }));
  const dom = new JSDOM(`<!doctype html>${markup}`);
  try {
    const section = (state) => [...dom.window.document.querySelectorAll('.muxui-storybook-state')]
      .find((candidate) => candidate.querySelector('h3')?.textContent === state);
    const checked = section('checked');
    const unchecked = section('unchecked');
    assert.ok(checked);
    assert.ok(unchecked);
    assert.equal(checked.querySelector('[data-muxui-storybook-state="unavailable"]'), null);
    assert.equal(unchecked.querySelector('[data-muxui-storybook-state="unavailable"]'), null);
    assert.equal(checked.querySelector('.lucide-check') !== null, true);
    assert.equal(unchecked.querySelector('.muxui-checkbox-field__indicator svg'), null);
  } finally {
    dom.window.close();
  }
});

test('unsupported state coverage is explicit while supported state args remain observable', () => {
  const byFamily = new Map(descriptor.bindings.map((binding) => [binding.export, binding]));
  const unsupportedStates = [
    ['Link', 'pressed'],
    ['ToggleButton', 'pressed'],
    ['Form', 'submitting'],
    ['Form', 'invalid'],
    ['Slider', 'selected'],
  ];
  for (const [family, state] of unsupportedStates) {
    const binding = byFamily.get(family);
    const markup = renderToStaticMarkup(renderStateCoverage({ family, tranche: 'R1.5', binding }));
    const dom = new JSDOM(`<!doctype html>${markup}`);
    const section = [...dom.window.document.querySelectorAll('.muxui-storybook-state')]
      .find((candidate) => candidate.querySelector('h3')?.textContent === state);
    assert.ok(section, `${family}/${state} section`);
    const stateBody = section.querySelector('[data-muxui-storybook-state="unavailable"]');
    assert.ok(stateBody, `${family}/${state}`);
    assert.match(stateBody.textContent, /Unavailable:/u, `${family}/${state}`);
    dom.window.close();
  }

  const link = renderToStaticMarkup(renderFamily('Link', stateArgsForBinding(byFamily.get('Link'), 'current', 'Link')));
  assert.match(link, /aria-current="page"/u);
  const toggle = renderToStaticMarkup(renderFamily('ToggleButton', stateArgsForBinding(byFamily.get('ToggleButton'), 'selected', 'ToggleButton')));
  assert.match(toggle, /aria-pressed="true"/u);
});

test('Link icon composition story renders the canonical leading and trailing SVG children', async () => {
  const canonicalSource = await readFile(resolve(repositoryRoot, 'catalog/components/link/examples/react/icon-composition.tsx'), 'utf8');
  const source = await readFile(resolve(appRoot, '.storybook/generated/r1-1-link.stories.mjs'), 'utf8');
  assert.match(source, /link-icon-composition\.example\.mjs/u);
  assert.match(source, /export const IconComposition/u);

  const story = await import('../.storybook/generated/r1-1-link.stories.mjs');
  assert.equal(story.IconComposition.name, 'Icon composition');
  assert.deepEqual(story.IconComposition.parameters.docs.source, { code: canonicalSource, language: 'tsx' });
  const markup = renderToStaticMarkup(story.IconComposition.render());
  const ltr = new JSDOM(`<!doctype html><body dir="ltr">${markup}</body>`);
  const rtl = new JSDOM(`<!doctype html><body dir="rtl">${markup}</body>`);
  try {
    for (const document of [ltr.window.document, rtl.window.document]) {
      const navigation = document.querySelector('nav');
      assert.equal(navigation?.getAttribute('aria-label'), 'Example navigation links', `${document.body.dir} navigation name`);
      const navigationStyle = navigation?.getAttribute('style') ?? '';
      assert.match(navigationStyle, /display:inline-flex/u, `${document.body.dir} navigation display`);
      assert.match(navigationStyle, /flex-wrap:wrap/u, `${document.body.dir} navigation wrapping`);
      assert.match(navigationStyle, /gap:0\.75rem/u, `${document.body.dir} navigation spacing`);
      const links = [...document.querySelectorAll('a.muxui-link')];
      assert.equal(links.length, 2, `${document.body.dir} Link count`);
      assert.equal(links[0].firstElementChild?.tagName, 'svg', `${document.body.dir} leading icon order`);
      assert.equal(links[1].lastElementChild?.tagName, 'svg', `${document.body.dir} trailing icon order`);
      assert.equal(links[0].textContent, 'Dashboard', `${document.body.dir} leading link name`);
      assert.equal(links[1].textContent, 'Settings', `${document.body.dir} trailing link name`);
      for (const icon of document.querySelectorAll('a.muxui-link > svg')) {
        assert.equal(icon.getAttribute('aria-hidden'), 'true', `${document.body.dir} decorative icon visibility`);
        assert.equal(icon.getAttribute('focusable'), 'false', `${document.body.dir} decorative icon focusability`);
        assert.equal(icon.getAttribute('width'), '1em', `${document.body.dir} icon width`);
        assert.equal(icon.getAttribute('height'), '1em', `${document.body.dir} icon height`);
        assert.equal(icon.getAttribute('stroke'), 'currentColor', `${document.body.dir} icon color`);
      }
    }
  } finally {
    ltr.window.close();
    rtl.window.close();
  }
});

test('Link icon composition helper is an Oxc projection of the canonical TSX source', async () => {
  const canonicalSourcePath = 'catalog/components/link/examples/react/icon-composition.tsx';
  const canonicalSource = await readFile(resolve(repositoryRoot, canonicalSourcePath), 'utf8');
  const helperSource = await readFile(resolve(appRoot, '.storybook/generated/link-icon-composition.example.mjs'), 'utf8');
  const helperBody = generatedBody(helperSource, 'link-icon-composition.example.mjs');
  const transformed = await transformWithOxc(canonicalSource, canonicalSourcePath, {
    lang: 'tsx',
    jsx: { runtime: 'automatic' },
    sourcemap: false,
  });
  const expected = transformed.code.endsWith('\n') ? transformed.code : `${transformed.code}\n`;
  assert.equal(helperBody, expected);
  assert.equal(manifest.generatedFrom.includes(canonicalSourcePath), true);
});

test('NumberField sizing story renders the canonical fit-content, fixed, and full-width cases', async () => {
  const canonicalSourcePath = 'catalog/components/number-field/examples/react/sizing.tsx';
  const canonicalSource = await readFile(resolve(repositoryRoot, canonicalSourcePath), 'utf8');
  const source = await readFile(resolve(appRoot, '.storybook/generated/r1-2-number-field.stories.mjs'), 'utf8');
  assert.match(source, /number-field-sizing\.example\.mjs/u);
  assert.match(source, /export const Sizing/u);

  const story = await import('../.storybook/generated/r1-2-number-field.stories.mjs');
  assert.equal(story.Sizing.name, 'Sizing');
  assert.deepEqual(story.Sizing.parameters.docs.source, { code: canonicalSource, language: 'tsx' });
  const markup = renderToStaticMarkup(story.Sizing.render());
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`);
  try {
    const example = dom.window.document.querySelector('.muxui-number-field-sizing-example');
    assert.ok(example, 'sizing example root');
    const fields = [...example.querySelectorAll('.muxui-number-field')];
    assert.equal(fields.length, 3);
    assert.deepEqual(fields.map((field) => field.querySelector('.muxui-field-label')?.textContent), [
      'Default fit-content',
      'Fixed 12rem',
      'Full container width',
    ]);
    assert.equal(fields[0].classList.contains('muxui-number-field-sizing-fixed'), false);
    assert.equal(fields[0].classList.contains('muxui-number-field-sizing-full'), false);
    assert.equal(fields[1].classList.contains('muxui-number-field-sizing-fixed'), true);
    assert.equal(fields[2].classList.contains('muxui-number-field-sizing-full'), true);
    const styleText = [...example.querySelectorAll('style')].map((style) => style.textContent).join('\n');
    assert.match(styleText, /--muxui-component-number-field-width:\s*12rem/u);
    assert.match(styleText, /--muxui-component-number-field-width:\s*100%/u);
    assert.doesNotMatch(canonicalSource, /<NumberField[^>]*\bwidth\s*=/u);
  } finally {
    dom.window.close();
  }
});

test('NumberField sizing helper is an Oxc projection of the canonical TSX source', async () => {
  const canonicalSourcePath = 'catalog/components/number-field/examples/react/sizing.tsx';
  const canonicalSource = await readFile(resolve(repositoryRoot, canonicalSourcePath), 'utf8');
  const helperSource = await readFile(resolve(appRoot, '.storybook/generated/number-field-sizing.example.mjs'), 'utf8');
  const helperBody = generatedBody(helperSource, 'number-field-sizing.example.mjs');
  const transformed = await transformWithOxc(canonicalSource, canonicalSourcePath, {
    lang: 'tsx',
    jsx: { runtime: 'automatic' },
    sourcemap: false,
  });
  const expected = transformed.code.endsWith('\n') ? transformed.code : `${transformed.code}\n`;
  assert.equal(helperBody, expected);
  assert.equal(manifest.generatedFrom.includes(canonicalSourcePath), true);
});

test('every pattern variant becomes a Block story that renders its canonical source', async () => {
  const variants = await patternVariantExamples(repositoryRoot);
  assert.ok(variants.length > 0, 'the catalog declares pattern variants');
  const groups = Map.groupBy(variants, ({ patternId }) => patternId);
  // The title carries the label the category registry declares, read here from the registry itself.
  const registry = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/patterns/categories.json'), 'utf8'));
  const categoryLabels = Object.assign({}, ...Object.values(registry));
  assert.deepEqual(manifest.patterns.map(({ pattern }) => pattern), [...groups.keys()]);
  assert.equal(new Set(manifest.patterns.map(({ family }) => family)).size, groups.size);
  for (const [patternId, group] of groups) {
    const [{ patternSlug, patternName, category }] = group;
    const label = categoryLabels[category];
    assert.equal(typeof label, 'string', `${category} has a registry label`);
    const storyFile = `block-${patternSlug}.stories.mjs`;
    const source = await readFile(resolve(appRoot, '.storybook/generated', storyFile), 'utf8');
    generatedBody(source, storyFile);
    const story = await import(`../.storybook/generated/${storyFile}`);
    // A variant reads as Blocks/<Category>/<Pattern>/<Variant> in the sidebar.
    assert.equal(story.default.title, `Blocks/${label}/${patternName}`, patternId);
    assert.equal(story.default.id, `muxui-block-${patternSlug}`, patternId);
    assert.deepEqual(manifest.patterns.find(({ pattern }) => pattern === patternId), {
      family: patternName, slug: patternSlug, pattern: patternId, category,
    });
    const page = manifest.pageIndex.find(({ family }) => family === patternName);
    assert.equal(page.storyFile, `apps/react-storybook/.storybook/generated/${storyFile}`);
    assert.deepEqual(page.stories.map(({ name, source: path }) => [name, path]), group.map(({ variantName, source: path }) => [variantName, path]));
    for (const [index, variant] of group.entries()) {
      const exported = story[page.stories[index].exportName];
      assert.equal(exported.name, variant.variantName, variant.variantId);
      assert.deepEqual(exported.parameters.docs.source, { code: variant.text, language: 'tsx' }, variant.variantId);
      assert.equal(manifest.generatedFrom.includes(variant.source), true, variant.source);
      // The helper is an Oxc projection of the canonical TSX, so the story renders the shipped example.
      const helperName = `block-${patternSlug}-${variant.variantSlug}.example.mjs`;
      const helper = generatedBody(await readFile(resolve(appRoot, '.storybook/generated', helperName), 'utf8'), helperName);
      const transformed = await transformWithOxc(variant.text, variant.source, { lang: 'tsx', jsx: { runtime: 'automatic' }, sourcemap: false });
      assert.equal(helper, transformed.code.endsWith('\n') ? transformed.code : `${transformed.code}\n`, variant.variantId);
      const markup = renderToStaticMarkup(exported.render());
      assert.match(markup, /class="muxui-/u, `${variant.variantId} renders Mux UI components`);
    }
  }
});

test('behavior-only state evidence executes the focused Mux UI interactions', async () => {
  const env = installRuntimeDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const settle = async (milliseconds = 0) => {
    if (milliseconds > 0) await act(async () => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)));
  };
  try {
    let linkActivations = 0;
    await act(async () => root.render(renderFamily('Link', { href: '#', onActivate: () => { linkActivations += 1; } })));
    const link = host.querySelector('.muxui-link');
    assert.ok(link, 'Link behavior target');
    await act(async () => link.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })));
    assert.equal(link.hasAttribute('data-pressed'), true, 'Link exposes the pressed interaction state');
    await act(async () => link.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' })));
    await act(async () => link.click());
    assert.equal(linkActivations, 1, 'Link activation callback');

    let toggleActivations = 0;
    await act(async () => root.render(renderFamily('ToggleButton', { onActivate: () => { toggleActivations += 1; } })));
    const toggle = host.querySelector('.muxui-toggle-button');
    assert.ok(toggle, 'ToggleButton behavior target');
    await act(async () => toggle.click());
    assert.equal(toggle.getAttribute('aria-pressed'), 'true', 'ToggleButton pressed state');
    assert.equal(toggleActivations, 1, 'ToggleButton activation callback');

    let formSubmissions = 0;
    await act(async () => root.render(renderFamily('Form', { onSubmit: () => { formSubmissions += 1; } })));
    const form = host.querySelector('.muxui-form');
    assert.ok(form, 'Form behavior target');
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(formSubmissions, 1, 'Form submit callback');

    const dialogDismissals = [];
    await act(async () => root.render(renderFamily('Dialog', { open: true, title: 'Delete draft', onOpenChange: (open) => dialogDismissals.push(open) })));
    await settle(20);
    const dialogClose = document.querySelector('.muxui-dialog-close');
    assert.ok(dialogClose, 'Dialog dismiss target');
    await act(async () => dialogClose.click());
    assert.deepEqual(dialogDismissals, [false], 'Dialog dismissal callback');

    const popoverDismissals = [];
    await act(async () => root.render(renderFamily('Popover', { open: true, onOpenChange: (open) => popoverDismissals.push(open) })));
    await settle(20);
    const popoverTrigger = host.querySelector('.muxui-button');
    assert.ok(document.querySelector('.muxui-popover'), 'Popover behavior target');
    await act(async () => popoverTrigger.click());
    assert.deepEqual(popoverDismissals, [false], 'Popover dismissal callback');

    let toastDismissals = 0;
    await act(async () => root.render(React.createElement(ToastProvider, null, renderFamily('Toast', { onDismiss: () => { toastDismissals += 1; } }))));
    await settle(100);
    const toastClose = document.querySelector('.muxui-toast-dismiss');
    assert.ok(toastClose, 'Toast dismiss target');
    await act(async () => toastClose.click());
    await settle(40);
    assert.equal(toastDismissals, 1, 'Toast dismissal callback');
    assert.equal(document.querySelector('.muxui-toast'), null, 'Toast leaves the DOM after dismissal');
  } finally {
    await act(async () => root.unmount());
    env.resolveAnimations();
    env.restore();
  }
});

test('interaction-open coverage opens the public field and collection triggers', async () => {
  const bindings = new Map(descriptor.bindings.map((binding) => [binding.export, binding]));
  const families = [
    ['DatePicker', '.muxui-date-popover', '.muxui-date-trigger'],
    ['DateRangePicker', '.muxui-date-popover', '.muxui-date-trigger'],
    ['ComboBox', '.muxui-combo-box-popover', '.muxui-combo-box-trigger'],
    ['Select', '.muxui-select-popover', '.muxui-select-trigger'],
  ];
  for (const [family, overlaySelector, triggerSelector] of families) {
    const env = installRuntimeDom();
    const host = document.querySelector('#root');
    const root = createRoot(host);
    try {
      const binding = bindings.get(family);
      const record = { family, tranche: 'R1.2', binding };
      await act(async () => root.render(React.createElement(React.StrictMode, null, renderStateCoverage(record))));
      await act(async () => new Promise((resolvePromise) => setTimeout(resolvePromise, 50)));

      const section = [...host.querySelectorAll('.muxui-storybook-state')]
        .find((candidate) => candidate.querySelector('h3')?.textContent === 'open');
      assert.ok(section, `${family}/open section`);
      assert.equal(section.querySelector('[data-muxui-storybook-state="unavailable"]'), null, `${family}/open should be supported`);
      const trigger = section.querySelector(triggerSelector);
      assert.ok(trigger, `${family}/open trigger`);
      assert.equal(trigger.getAttribute('aria-expanded'), 'true', `${family}/open trigger state`);
      const overlay = document.querySelector(`${overlaySelector}:not([hidden])`);
      assert.ok(overlay, `${family}/open overlay`);
    } finally {
      if (host.isConnected && host.hasChildNodes()) await act(async () => root.unmount());
      env.restore();
    }
  }
});

function markerForTest(family, state) {
  return `muxui-storybook-lifecycle-${family}-${state}`.replaceAll(/[^a-z0-9-]/gi, '-').toLowerCase();
}

function isInspectableOverlay(marker) {
  return isInspectableOverlayTarget(document.querySelector(`.${marker}`));
}

function isInspectableOverlayTarget(target, requireConnected = true) {
  if (!target || requireConnected && !target.isConnected) return false;
  for (let element = target; element; element = element.parentElement) {
    if (element.getAttribute('aria-hidden') === 'true' || element.hasAttribute('inert')) return false;
  }
  const style = getComputedStyle(target);
  return style.visibility !== 'hidden' && style.opacity !== '0';
}

function observeInitialOverlay(marker) {
  let observed = false;
  const recordVisibility = (records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const target = node.matches(`.${marker}`) ? node : node.querySelector(`.${marker}`);
        if (isInspectableOverlayTarget(target, false)) {
          observed = true;
          return;
        }
      }
    }
  };
  const observer = new MutationObserver((records) => {
    recordVisibility(records);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  if (isInspectableOverlay(marker)) observed = true;
  return () => {
    recordVisibility(observer.takeRecords());
    observer.disconnect();
    return observed || isInspectableOverlay(marker);
  };
}

test('lifecycle state coverage drives observable Mux UI transitions', async () => {
  const env = installRuntimeDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const bindings = new Map(descriptor.bindings.map((binding) => [binding.export, binding]));
  const lifecycleAttributes = {
    entering: 'data-entering',
    opening: 'data-entering',
    exiting: 'data-exiting',
    closing: 'data-exiting',
  };
  const families = ['Dialog', 'Popover', 'PreviewTrigger', 'Toast', 'Tooltip'];
  try {
    for (const family of families) {
      const binding = bindings.get(family);
      const coverage = renderStateCoverage({
        family,
        tranche: historicalManifest.families.find((record) => record.family === family).tranche,
        binding,
      });
      const transitionHistory = [];
      const racLifecycleRecords = [];
      const lifecycleStates = stateCoverageForBinding(binding, family)
        .map(({ name }) => name)
        .filter((name) => lifecycleAttributes[name]);
      const transitionObserver = new MutationObserver((records) => {
        for (const { target, attributeName, oldValue } of records) {
          if (attributeName !== 'data-muxui-storybook-transition') continue;
          transitionHistory.push({ oldValue, newValue: target.getAttribute(attributeName) });
        }
      });
      const recordRacAttribute = (target, attributeName) => {
        const markedOverlay = target.matches('[class*="muxui-storybook-lifecycle-"]')
          ? target
          : target.querySelector('[class*="muxui-storybook-lifecycle-"]');
        if (markedOverlay) racLifecycleRecords.push({ marker: markedOverlay.className, attributeName });
      };
      const racObserver = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'attributes') {
            if (record.attributeName === 'data-entering' || record.attributeName === 'data-exiting') {
              recordRacAttribute(record.target, record.attributeName);
            }
            continue;
          }
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue;
            for (const attributeName of ['data-entering', 'data-exiting']) {
              if (node.matches(`[${attributeName}]`)) recordRacAttribute(node, attributeName);
              for (const target of node.querySelectorAll(`[${attributeName}]`)) {
                recordRacAttribute(target, attributeName);
              }
            }
          }
        }
      });
      transitionObserver.observe(host, { attributes: true, attributeOldValue: true, subtree: true });
      racObserver.observe(document.body, { attributes: true, subtree: true });
      await act(async () => root.render(React.createElement(ToastProvider, null, coverage)));
      assert.ok(lifecycleStates.length > 0, `${family} has lifecycle coverage`);
      const lifecycleSelect = document.querySelector(`[data-muxui-storybook-lifecycle-select="${family}"]`);
      assert.ok(lifecycleSelect, `${family} lifecycle selector`);
      for (const state of lifecycleStates) {
        const marker = markerForTest(family, state);
        const alternateState = lifecycleStates.find((candidate) => candidate !== state);
        assert.ok(alternateState, `${family}/${state} has a reset state`);
        await act(async () => {
          lifecycleSelect.value = alternateState;
          lifecycleSelect.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const transitionStart = transitionHistory.length;
        const racStart = racLifecycleRecords.length;
        const closing = state === 'closing' || state === 'exiting';
        const initialOverlayObservation = family === 'Toast' && closing
          ? observeInitialOverlay(marker)
          : undefined;
        // Sample the committed lifecycle state before its requestAnimationFrame
        // transition can mount an entering overlay.
        act(() => {
          lifecycleSelect.value = state;
          lifecycleSelect.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const initialOverlayState = initialOverlayObservation
          ? initialOverlayObservation()
          : isInspectableOverlay(marker);
        const overlayHistory = [initialOverlayState];
        const recordCurrentRacAttributes = () => {
          const target = document.querySelector(`.${marker}`);
          if (!target) return;
          for (const attributeName of ['data-entering', 'data-exiting']) {
            for (let element = target; element; element = element.parentElement) {
              if (element.hasAttribute(attributeName)) racLifecycleRecords.push({ marker: target.className, attributeName });
            }
            for (const element of target.querySelectorAll(`[${attributeName}]`)) {
              racLifecycleRecords.push({ marker: target.className, attributeName });
            }
          }
        };
        recordCurrentRacAttributes();
        for (let tick = 0; tick < 35; tick += 1) {
          await act(async () => new Promise((resolvePromise) => setTimeout(resolvePromise, 25)));
          overlayHistory.push(isInspectableOverlay(marker));
          recordCurrentRacAttributes();
        }
        const section = document.querySelector(`[data-muxui-storybook-lifecycle="${state}"]`);
        assert.ok(section, `${family}/${state} section`);
        const overlay = document.querySelector(`.${marker}`);
        assert.ok(overlay, `${family}/${state} overlay`);
        const expectedPhaseStart = closing ? 'open' : 'closed';
        const presence = overlayHistory;
        assert.equal(initialOverlayState, closing, `${family}/${state} initial overlay visibility`);
        assert.equal(presence.at(-1), true, `${family}/${state} settled overlay visibility (${presence.join(',')})`);
        const transitionRecords = transitionHistory.slice(transitionStart);
        const racRecords = racLifecycleRecords.slice(racStart);
        assert.equal(
          transitionRecords.some(({ oldValue }) => oldValue === expectedPhaseStart),
          true,
          `${family}/${state} transition phase (${transitionRecords.map(({ oldValue, newValue }) => `${oldValue}->${newValue}`).join(', ')})`,
        );
        if (closing) {
          if (family === 'Toast') {
            const firstVisible = presence.findIndex(Boolean);
            const removedAfterVisible = presence.findIndex((visible, index) => index > firstVisible && !visible);
            const visibleAgain = presence.findIndex((visible, index) => index > removedAfterVisible && visible);
            assert.ok(firstVisible >= 0 && removedAfterVisible >= 0 && visibleAgain >= 0,
              `${family}/${state} RAC queue close/reopen (${presence.join(',')})`);
          } else {
            // PreviewTrigger's marked element is React Aria's popover itself, so it
            // shares the generic data-exiting transition.
            assert.equal(
              racRecords.some(({ marker: recordMarker, attributeName }) => recordMarker.includes(marker)
                && attributeName === 'data-exiting'),
              true,
              `${family}/${state} RAC exit transition (${racRecords.map(({ marker: recordMarker, attributeName }) => `${attributeName}:${recordMarker}`).join(', ')})`,
            );
          }
        }
        assert.equal(section.querySelector('[data-muxui-storybook-transition="open"]')?.textContent, `${state}: open`);
      }
      transitionObserver.disconnect();
      racObserver.disconnect();
      env.resolveAnimations();
      await act(async () => root.render(null));
      host.replaceChildren();
    }
  } finally {
    env.resolveAnimations();
    if (host.isConnected && host.hasChildNodes()) await act(async () => root.unmount());
    env.restore();
  }
});

test('Breadcrumbs defaults show the adapter sample while explicit empty items stay empty', () => {
  const binding = descriptor.bindings.find(({ export: family }) => family === 'Breadcrumbs');
  const defaultArgs = storyArgsForBinding(binding, 'default', 'Breadcrumbs');
  assert.equal(defaultArgs.items, undefined);
  const defaultMarkup = renderToStaticMarkup(renderFamily('Breadcrumbs', defaultArgs));
  assert.match(defaultMarkup, /Home/u);
  assert.match(defaultMarkup, /Docs/u);

  const emptyMarkup = renderToStaticMarkup(renderFamily('Breadcrumbs', { ...defaultArgs, items: [] }));
  assert.doesNotMatch(emptyMarkup, /Home|Docs/u);

  const disabledMarkup = renderToStaticMarkup(renderFamily('Breadcrumbs', stateArgsForBinding(binding, 'disabled', 'Breadcrumbs')));
  assert.match(disabledMarkup, /data-disabled="true"/u);
  assert.match(disabledMarkup, /aria-current="page"/u);
});

test('generated stories are stock CSF modules with default and state coverage', async () => {
  for (const record of historicalManifest.families) {
    const slug = record.family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const tranche = record.tranche.replace('.', '-').toLowerCase();
    const fileName = `${tranche}-${slug}.stories.mjs`;
    const source = await readFile(resolve(appRoot, '.storybook/generated', fileName), 'utf8');
    const body = generatedBody(source, fileName);
    assert.match(body, /include: binding\.api\.props/);
    assert.match(body, /argTypesForBinding/);
    assert.match(body, /export const Default/);
    assert.match(body, /export const States/);
  }

  const buttonBinding = descriptor.bindings.find(({ export: name }) => name === 'Button');
  const buttonStory = await import('../.storybook/generated/r1-1-button.stories.mjs');
  assert.deepEqual(buttonStory.default.parameters.controls.include, buttonBinding.api.props);
  const autocompleteStory = await readFile(resolve(appRoot, '.storybook/generated/r1-2-autocomplete.stories.mjs'), 'utf8');
  assert.match(autocompleteStory, /DisabledItemsInteraction/u);
  assert.match(autocompleteStory, /disabled: true/u);
});

test('showcase does not expose React Aria as a public import', async () => {
  const packageManifest = JSON.parse(await readFile(resolve(appRoot, 'package.json'), 'utf8'));
  assert.equal(packageManifest.dependencies['@muxui/react'], 'workspace:*');
  assert.equal(packageManifest.devDependencies['react-aria-components'], undefined);
  assert.ok(packageManifest.devDependencies['@storybook/addon-docs'], 'the docs addon is a declared dependency');
  const factory = await readFile(resolve(appRoot, 'src/storybook-factory.mjs'), 'utf8');
  assert.doesNotMatch(factory, /react-aria-components/i);
  const main = await readFile(resolve(appRoot, '.storybook/main.mjs'), 'utf8');
  assert.match(main, /@storybook\/addon-docs/);
  assert.match(main, /reactDocgen: false/);
  const preview = await readFile(resolve(appRoot, '.storybook/preview.mjs'), 'utf8');
  assert.match(preview, /@muxui\/react/);
  assert.doesNotMatch(preview, /react-aria-components/);
});

test('manager disables network-dependent What\'s new notifications', async () => {
  const { default: main } = await import('../.storybook/main.mjs');
  assert.equal(main.core?.disableWhatsNewNotifications, true);
});

test('preview exposes the Mux UI theme and direction host contract', async () => {
  const preview = await readFile(resolve(appRoot, '.storybook/preview.mjs'), 'utf8');
  const previewCss = await readFile(resolve(appRoot, '.storybook/preview.css'), 'utf8');

  assert.match(preview, /globalTypes/);
  assert.match(preview, /colorScheme/);
  assert.match(preview, /value: 'light'/);
  assert.match(preview, /value: 'dark'/);
  assert.match(preview, /value: 'ltr'/);
  assert.match(preview, /value: 'rtl'/);
  assert.match(preview, /document\.documentElement\.setAttribute\('data-muxui-color-scheme'/);
  assert.match(preview, /document\.documentElement\.setAttribute\('data-muxui-direction'/);
  assert.match(preview, /document\.documentElement\.dir = direction/);
  assert.doesNotMatch(preview, /data-muxui-contrast|contrastItems|applyAccessibilityModes/u);
  assert.match(preview, /className: 'muxui-storybook-surface'/);
  assert.match(preview, /return React\.createElement\(\s*viewMode === 'story' \? 'main' : 'div',/u);
  assert.match(preview, /MutationObserver/);
  assert.match(preview, /observer\.observe\(document\.body, \{ childList: true \}\)/);
  assert.match(preview, /element\.style\.display === 'contents'/);
  assert.match(preview, /element\.hasAttribute\('data-overlay-container'\)/);
  assert.match(preview, /element\.classList\.contains\('muxui-dialog-backdrop'\)/);
  assert.match(preview, /element\.classList\.contains\('muxui-toast-region'\)/);
  assert.match(preview, /child\.setAttribute\('role', 'region'\)/);
  assert.match(preview, /child\.setAttribute\('aria-label', 'Mux UI overlay'\)/);
  assert.match(preview, /element\.removeAttribute\('role'\)/);
  assert.match(preview, /element\.removeAttribute\('aria-label'\)/);
  assert.doesNotMatch(preview, /\.append\(/u);
  assert.match(preview, /'data-muxui-color-scheme': scheme/);
  assert.match(preview, /'data-muxui-direction': direction/);
  assert.doesNotMatch(preview, /'data-muxui-contrast'/u);
  assert.match(preview, /test: 'error'/);
  const packageManifest = JSON.parse(await readFile(resolve(appRoot, 'package.json'), 'utf8'));
  assert.deepEqual(exactLockedProblems(await readLockfile(), 'apps/react-storybook', packageManifest, ['dependencies', 'devDependencies']), []);

  assert.match(previewCss, /:root\[data-muxui-color-scheme='dark'\]/);
  assert.match(previewCss, /background: var\(--muxui-semantic-surface-canvas\)/);
  assert.match(previewCss, /color: var\(--muxui-semantic-content-strong\)/);
  assert.match(previewCss, /\[data-muxui-storybook-lifecycle-select\]\s*\{[^}]*background: var\(--muxui-semantic-surface-canvas\);[^}]*color: var\(--muxui-semantic-content-strong\);/u);
  assert.match(previewCss, /\[data-muxui-storybook-lifecycle-select\]:focus-visible\s*\{[^}]*var\(--muxui-semantic-focus-ring\)/u);
  assert.match(previewCss, /font-family: ui-sans-serif, system-ui/);
  assert.doesNotMatch(previewCss, /#(?:fff|000|171717)/iu);
  assert.match(previewCss, /#storybook-root,\s*main\.muxui-storybook-surface\s*\{[^}]*min-height: 100vh;/u);
  assert.doesNotMatch(previewCss, /(?:^|\n)\.muxui-storybook-surface\s*\{[^}]*min-height: 100vh;/u);
  assert.doesNotMatch(previewCss, /Inter/i);
});

test('manager theme derives every hover surface from the canonical Mux UI token', () => {
  for (const colorScheme of ['light', 'dark']) {
    const theme = buildTheme(colorScheme);
    const hover = canonicalColorValue(colorScheme, 'semantic.surface.hover');
    assert.equal(theme.appHoverBg, hover, `${colorScheme} public Storybook hover theme`);
    assert.equal(convert(theme).background.hoverable, hover, `${colorScheme} derived manager hover theme`);
    assert.notEqual(theme.appHoverBg, colorScheme === 'light' ? '#DBECFF' : '#233952', `${colorScheme} Storybook default hover color`);
  }
});

test('manager projection covers internal chrome and keeps docs syntax scoped', async () => {
  const managerCss = managerThemeCss();
  const previewCss = await readFile(resolve(appRoot, '.storybook/preview.css'), 'utf8');

  assert.match(managerCss, /\.sidebar-item\[data-ref-id='storybook_internal'\]\[data-nodetype\]/u);
  assert.match(managerCss, /\.react-aria-Popover\[role='dialog'\]/u);
  assert.match(managerCss, /\[aria-label='Story status: Pass'\]/u);
  assert.match(managerCss, /\[aria-label='Story status: Fail'\]/u);
  assert.match(managerCss, /\[aria-label='Story status: Runs'\]/u);
  for (const colorScheme of ['light', 'dark']) {
    const hover = canonicalColorValue(colorScheme, 'semantic.surface.hover');
    const success = canonicalColorValue(colorScheme, 'semantic.status.success');
    assert.match(managerCss, new RegExp(`--muxui-storybook-surface-hover: ${hover}`, 'u'));
    assert.match(managerCss, new RegExp(`--muxui-storybook-status-success: ${success}`, 'u'));
  }
  assert.match(previewCss, /:is\(\.sbdocs\.sbdocs-preview, \.docblock-source\) \.prismjs/u);
  assert.doesNotMatch(previewCss, /\.sbdocs-content\s+a\s*\{/u);
});
