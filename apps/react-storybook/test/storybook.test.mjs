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
import { Menu, ToastProvider } from '@muxui/react';
import { TextEditor, isTextEditorDocument } from '@muxui/react/text-editor';
import { StorybookThemeContext } from '../src/storybook-theme.mjs';
import defaultTheme from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { componentCategory, groupComponentNavigation } from '../../component-navigation.mjs';
import { componentRecordCategory } from '../src/component-categories.mjs';
import { exactLockedProblems, readLockfile } from '../../../packages/react/test/support/locked-dependencies.mjs';
import {
  argTypesForBinding,
  adapterNames,
  AVATAR_LOADED_SRC,
  isLifecycleState,
  HISTORICAL_BROWSER_PROOF_FAMILIES,
  BROWSER_PROOF_FAMILIES,
  createAnatomyStory,
  createButtonMatrixStory,
  createBrowserProofStory,
  createControlledStory,
  createEventsStory,
  createMenuNestedStory,
  createSelectNativeSelectionStory,
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
  STORY_API_PARTS,
  STORY_APPLICABILITY,
  storyApi,
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

// What a family declares, read from the committed declaration reference (Decision 0031), not from the shipped text.
const referenceInventory = JSON.parse(await readFile(resolve(repositoryRoot, 'packages/react/reference/inventory.json'), 'utf8'));

/** The reference file of the owner of `family`'s own export. */
async function referenceFileOf(family) {
  const { owner } = referenceInventory.entries.flatMap((entry) => entry.exports ?? []).find(({ name }) => name === family);
  return JSON.parse(await readFile(resolve(repositoryRoot, 'packages/react', 'reference', referenceInventory.owners[owner]), 'utf8'));
}

/** The member names `family`'s own export declares in any part and any alternative of it, from an owner's reference file. */
function declaredMembers(file, family) {
  const record = file.exports.find(({ name, kind }) => name === family && kind === 'component');
  return new Set((record?.parts ?? [])
    .flatMap((part) => [...(part.members ?? []), ...(part.alternatives ?? []).flatMap(({ members }) => members)])
    .map(({ name }) => name));
}

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
  // The prerequisites are the app's workspace dependencies: React and the catalog the component docs query.
  assert.equal(packageManifest.scripts.generate, 'node ../../tooling/audits/repository-policy/src/prepare-prerequisites.mjs @muxui/react-storybook^... && node src/generate-stories.mjs');
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
    assert.deepEqual(Object.keys(argTypesForBinding(binding)).sort(), storyApi(binding).props.slice().sort(), record.family);
    assert.deepEqual(record.props, storyApi(binding).props, record.family);
    assert.equal(record.tranche, snapshot.families.find(({ muxuiPublicFamily, corePublicFamily }) => (muxuiPublicFamily ?? corePublicFamily) === record.family).tranche, record.family);
  }
});

// A compound's Controls and states take one set of args, so the adapter folds the parts it renders from them into the
// root's API. That is the adapter's choice: every part stays in the binding's partApis, which the reference lists.
test('storyApi folds the parts the adapter names into the root\'s API and leaves the binding alone', () => {
  const block = (props, extra = {}) => ({
    props: Object.keys(props),
    events: [],
    defaults: {},
    propDetails: Object.fromEntries(Object.entries(props).map(([name, type]) => [name, { type: { kind: type }, required: false }])),
    eventDetails: {},
    types: {},
    ...extra,
  });
  const api = {
    ...block({ open: 'boolean', placement: 'string' }, { events: ['openChange'], defaults: { placement: 'bottom' }, eventDetails: { openChange: { prop: 'onOpenChange' } }, parts: ['root', 'popup', 'list', 'item'] }),
    partApis: {
      popup: { member: 'Popup', ...block({ placement: 'number', offset: 'number', modal: 'boolean' }, { defaults: { offset: 4, placement: 7 } }) },
      list: { member: 'List', ...block({ items: 'string' }, { events: ['action', 'openChange'], eventDetails: { action: { prop: 'onAction' }, openChange: { prop: 'onOpenChange' } } }) },
      item: { member: 'Item', ...block({ id: 'string' }) },
    },
  };
  const binding = Object.freeze({ export: 'Thing', api: Object.freeze(api) });
  // A family with no entry reads its root API as it is.
  assert.equal(storyApi(binding, {}), binding.api);
  assert.equal(storyApi(binding, { Other: ['popup'] }), binding.api);
  const merged = storyApi(binding, { Thing: ['popup', 'list', 'absent'] });
  // The root's props come first, each prop and event once, and a part the binding lacks adds nothing.
  assert.deepEqual(merged.props, ['open', 'placement', 'offset', 'modal', 'items']);
  assert.deepEqual(merged.events, ['openChange', 'action']);
  // The root's default and detail win over a part's, and a part's fill what the root lacks.
  assert.deepEqual(merged.defaults, { placement: 'bottom', offset: 4 });
  assert.equal(merged.propDetails.placement.type.kind, 'string');
  assert.deepEqual(Object.keys(merged.propDetails).sort(), merged.props.slice().sort());
  assert.deepEqual(Object.keys(merged.eventDetails).sort(), ['action', 'openChange']);
  // A part the adapter does not name stays out of the controls, though the binding still lists it.
  assert.equal(merged.props.includes('id'), false);
  assert.equal(merged.partApis.item.member, 'Item');
  assert.deepEqual(merged.parts, ['root', 'popup', 'list', 'item']);
  // The binding it read from is untouched.
  assert.deepEqual(binding.api.props, ['open', 'placement']);
  // Every part the shipped table names exists in that family's partApis, so a renamed part cannot leave a stale entry.
  const byFamily = new Map(descriptor.bindings.map((entry) => [entry.export, entry]));
  for (const [family, parts] of Object.entries(STORY_API_PARTS)) {
    assert.ok(byFamily.has(family), `${family} is a family`);
    for (const part of parts) assert.ok(byFamily.get(family).api.partApis?.[part] !== undefined, `${family} has a ${part} part API`);
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
    assert.deepEqual(metadata.props, storyApi(binding).props, `${record.family} props`);
    assert.deepEqual(metadata.events, storyApi(binding).events, `${record.family} events`);
    assert.deepEqual(metadata.parts, binding.api.parts, `${record.family} parts`);
    assert.deepEqual(metadata.states, binding.states, `${record.family} states`);
    assert.deepEqual(metadata.controlled, controlledDefaultPairsForBinding(binding), `${record.family} controlled pairs`);
    assert.equal(new Set(metadata.parts).size, metadata.parts.length, `${record.family} duplicate parts`);
    partCount += metadata.parts.length;
  }
  assert.equal(partCount, descriptor.bindings.reduce((count, binding) => count + binding.api.parts.length, 0));
});

test('every family has live controls, events, modes, anatomy, and a hidden browser play, whichever stories it displays', async () => {
  assert.deepEqual(
    [...HISTORICAL_BROWSER_PROOF_FAMILIES].sort(),
    historicalManifest.families.map(({ family }) => family).sort(),
    'every exact manifest family has a substantive Browser Proof plan',
  );
  let pairCount = 0;
  let eventCount = 0;
  let partCount = 0;
  for (const record of historicalManifest.families) {
    const binding = descriptor.bindings.find(({ export: name }) => name === record.family);
    assert.ok(binding, `${record.family} descriptor binding`);
    const slug = record.family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const tranche = record.tranche.replace('.', '-').toLowerCase();
    const module = await import(`../.storybook/generated/${tranche}-${slug}.stories.mjs`);
    // Every family keeps BrowserProof, which the sidebar hides. The other proof stories are built from the factory,
    // so each family's proof holds even where its page does not display the story.
    assert.equal(typeof module.BrowserProof?.play, 'function', `${record.family}/BrowserProof play`);
    assert.equal(module.BrowserProof.parameters.muxuiProof.browser, true, `${record.family}/BrowserProof metadata`);
    assert.deepEqual(module.BrowserProof.tags, ['!dev', '!autodocs'], `${record.family}/BrowserProof is left out of the sidebar and autodocs`);
    const proof = { family: record.family, tranche: record.tranche, binding };
    const story = {
      Controlled: createControlledStory(proof),
      Uncontrolled: createUncontrolledStory(proof),
      Events: createEventsStory(proof),
      Anatomy: createAnatomyStory(proof),
    };
    for (const [name, built] of Object.entries(story)) assert.equal(typeof built.render, 'function', `${record.family}/${name} render`);
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
    // The callback is a member of one of this family's own parts in the declaration reference, not a name found anywhere in the package.
    const declared = declaredMembers(await referenceFileOf(record.family), record.family);
    for (const { prop } of events) assert.ok(declared.has(prop), `${record.family}/${prop} must be a real public callback`);
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

test('a family\'s callback must be declared by that family, not by an unrelated export or a comment', () => {
  const member = (name, doc) => ({ name, ...(doc && { doc }) });
  const component = (name, ...parts) => ({ name, kind: 'component', parts });
  const file = { exports: [
    component('Slider', { member: null, members: [member('onChange', 'Called with the value')] }),
    component('Helper', { member: null, members: [member('onChange'), member('onClear')] }),
    component('Clear', { member: null, members: [member('label', 'onClear: describes the member.')] }),
    // A compound's callbacks sit on its parts, and an alternative's members count with them.
    component('Menu', { member: null, members: [] }, { member: 'Root', members: [member('onOpenChange')] }, { member: 'Item', alternatives: [{ members: [member('onAction')] }] }),
  ] };
  assert.ok(declaredMembers(file, 'Slider').has('onChange'));
  // Slider declares onChange; it does not declare onClear, which only an unrelated helper does.
  assert.equal(declaredMembers(file, 'Slider').has('onClear'), false);
  // The name in a member's description is not the member.
  assert.equal(declaredMembers(file, 'Clear').has('onClear'), false);
  assert.ok(declaredMembers(file, 'Menu').has('onOpenChange'));
  assert.ok(declaredMembers(file, 'Menu').has('onAction'));
  assert.equal(declaredMembers(file, 'Menu').has('onClear'), false);
  assert.equal(declaredMembers(file, 'Missing').size, 0, 'a family the file does not hold declares nothing');
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

// MuxUIPlacement is declared by tsc with the overlays that take it; the index only names it.
const overlayTypes = await readFile(resolve(repositoryRoot, 'packages/react/generated/overlays.d.ts'), 'utf8');
// Truncated image data: the browser fires an error event instead of loading it.
const AVATAR_FAILING_SRC = 'data:image/png;base64,AAAA';
const supplementalTypes = await readFile(resolve(repositoryRoot, 'packages/react/generated/supplemental.d.ts'), 'utf8');
const selectNativeTypes = await readFile(resolve(repositoryRoot, 'packages/react/generated/select-native.d.ts'), 'utf8');

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
    await body({ host, root, env });
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
  // value, defaultValue, and onChange are native passthrough, outside SelectNative's derived API
  // (Decision 0031), so it has no controlled, uncontrolled, or events story; its Default story seeds them.
  for (const name of ['Controlled', 'Uncontrolled', 'Events']) assert.equal(STORY_APPLICABILITY[name](record.binding, record.family), false, name);
  try {
    const story = createStory(record, 'default');
    for (const multiple of [false, true]) {
      let received;
      let receivedTarget;
      const args = { ...story.args, multiple, onChange: (event) => { received = event; receivedTarget = event.currentTarget; } };
      await act(async () => root.render(React.cloneElement(story.render(args), { key: `${story.name}-${multiple}` })));
      const select = host.querySelector('select');
      assert.deepEqual([...select.selectedOptions].map((option) => option.value), multiple ? [] : ['']);
      if (multiple) {
        for (const option of select.options) option.selected = option.value !== '';
      } else select.value = 'research';
      await act(async () => select.dispatchEvent(new Event('change', { bubbles: true })));
      assert.equal(received.type, 'change');
      assert.strictEqual(receivedTarget, select);
      assert.deepEqual([...select.selectedOptions].map((option) => option.value), multiple ? ['inbox', 'research'] : ['research']);
    }
  } finally {
    await act(async () => root.unmount());
    env.resolveAnimations();
    env.restore();
  }
});

test('the nested submenu story is a closed menu with a submenu and a control after it, apart from the state matrix', async () => {
  const env = installRuntimeDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const story = createMenuNestedStory(currentRecord('Menu'));
  assert.equal(story.name, 'Nested submenu keyboard navigation');
  assert.throws(() => createMenuNestedStory(currentRecord('Button')), /require the Menu family/u);
  try {
    await act(async () => root.render(story.render(story.args)));
    // Closed: the trigger, and the control Tab lands on, and no state matrix beside them.
    assert.deepEqual([...host.querySelectorAll('button')].map((button) => button.textContent), ['Actions', 'After']);
    assert.equal(host.querySelector('#menu-nested-trigger').getAttribute('aria-expanded'), 'false');
    assert.equal(host.querySelector('.muxui-storybook-state'), null, 'the specimen is not a state of the matrix');
    assert.equal(document.querySelectorAll('[role="menu"]').length, 0);
    await act(async () => host.querySelector('#menu-nested-trigger').click());
    const menu = document.querySelector('[role="menu"][aria-label="Actions"]');
    assert.ok(menu, 'the trigger opens the menu');
    // The submenu is in the list as one item that announces a menu, named for what it opens.
    assert.deepEqual([...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent), ['Rename', 'Share', 'Delete']);
    assert.equal(menu.querySelector('.muxui-menu-item[data-has-submenu]').textContent, 'Share');
  } finally {
    await act(async () => root.unmount());
    env.resolveAnimations();
    env.restore();
  }
});

// The Anatomy story composes Menu from fixed children, which take precedence over `items`, so offering that control would promise what the story ignores.
test('the Menu Anatomy story offers no items or children control, though the other stories do', async () => {
  const menu = currentRecord('Menu');
  const anatomy = createAnatomyStory(menu);
  assert.equal(anatomy.argTypes.items.control, false, 'items is listed without a control');
  assert.equal(anatomy.argTypes.children?.control ?? false, false, 'children is not a control');
  assert.ok(createStory(menu, 'default').argTypes.items.control, 'the Default story keeps the items control');
  assert.ok(createStory(menu, 'states').argTypes.items.control, 'the States story keeps the items control');
  // The reason, as rendered: items given to the story change nothing in the composition.
  const rendered = async (values) => {
    let labels;
    await withRuntime(async ({ root }) => {
      await act(async () => root.render(anatomy.render({ ...anatomy.args, ...values })));
      await settleRuntime();
      labels = [...new Set([...document.querySelectorAll('.muxui-menu-item')].map((item) => item.textContent))].sort();
    });
    return labels;
  };
  const fixed = await rendered({});
  assert.deepEqual(fixed, ['Delete', 'Save', 'Share']);
  assert.deepEqual(await rendered({ items: [{ id: 'probe', label: 'Review probe' }] }), fixed, 'the supplied item is not rendered');
});

// Menu's part-owned controls reach the elements the Anatomy story composes. The adapter has no submenu to give the delay to, so the story builds
// one with it, and a popup inside it, and the root's popup and list take theirs from the adapter. What each element sends React Aria is read where it is sent.
test('the Menu Anatomy story forwards the delay, popup, and close-on-select controls to its submenu, popups, and list', async () => {
  const menu = currentRecord('Menu');
  const story = createAnatomyStory(menu);
  const controls = ['delay', 'placement', 'offset', 'crossOffset', 'shouldFlip', 'containerPadding', 'modal', 'shouldCloseOnSelect'];
  assert.deepEqual(controls.filter((control) => !(control in story.argTypes)), [], 'the controls are advertised');
  const sentToReactAria = async (values) => {
    const sent = { delays: [], popups: [], closes: [], placements: { root: [], submenu: [] } };
    const create = React.createElement;
    React.createElement = (type, props, ...children) => {
      if (props !== null && typeof props === 'object') {
        // The placement a Menu.Popup is given, by whether it is the submenu's (the one whose list is named Share) or the root's.
        if (type === Menu.Popup) sent.placements[children[0].props['aria-label'] === 'Share' ? 'submenu' : 'root'].push(props.placement);
        if ('delay' in props && Array.isArray(props.children)) sent.delays.push(props.delay);
        if ('isNonModal' in props && 'offset' in props) {
          const { offset, crossOffset, shouldFlip, containerPadding, isNonModal } = props;
          sent.popups.push(JSON.stringify({ offset, crossOffset, shouldFlip, containerPadding, modal: !isNonModal }));
        }
        if ('shouldCloseOnSelect' in props && 'disabledKeys' in props) sent.closes.push(props.shouldCloseOnSelect);
      }
      return create(type, props, ...children);
    };
    try {
      await withRuntime(async ({ root }) => {
        await act(async () => root.render(story.render({ ...story.args, ...values })));
        await settleRuntime();
      });
    } finally {
      React.createElement = create;
    }
    const placements = { root: [...new Set(sent.placements.root)].sort(), submenu: [...new Set(sent.placements.submenu)].sort() };
    return { delays: [...new Set(sent.delays)], popups: [...new Set(sent.popups)], closes: [...new Set(sent.closes)], placements, rendered: sent.popups.length };
  };
  const changed = await sentToReactAria({ delay: 987, placement: 'end-bottom', offset: 9, crossOffset: 5, shouldFlip: false, containerPadding: 31, modal: false, shouldCloseOnSelect: false });
  assert.ok(changed.rendered > 0 && changed.delays.length > 0 && changed.closes.length > 0, 'each element was rendered');
  assert.deepEqual(changed.delays, [987], 'every submenu takes the delay control');
  assert.deepEqual(changed.popups, [JSON.stringify({ offset: 9, crossOffset: 5, shouldFlip: false, containerPadding: 31, modal: false })], 'every popup, the submenu\'s too, takes the geometry controls');
  assert.deepEqual(changed.closes, [false], 'every list takes the close-on-select control');
  // The placement is read on the popup elements themselves, the root's and the submenu's, which React Aria turns into its own spelling.
  assert.deepEqual(changed.placements, { root: ['end-bottom'], submenu: ['end-bottom'] }, 'both popups take the placement control');
  // Left alone, the controls are the components' own defaults.
  const unset = await sentToReactAria({});
  assert.deepEqual([unset.delays, unset.popups], [[200], [JSON.stringify({ offset: 4, crossOffset: 0, shouldFlip: true, containerPadding: 12, modal: true })]]);
  // The story pins no placement either, so each popup falls back by itself: the submenu's beside its item, the root's below its trigger.
  // The state matrix gives the root's popup a placement on its own placement row (top), which is the one it sets.
  assert.deepEqual(unset.placements, { root: ['top', undefined], submenu: [undefined] });
  // The nested specimen offers no controls to follow.
  assert.equal(createMenuNestedStory(menu).parameters.controls.disable, true);
});

test('the native selection story follows a controlled value through its change event beside a default-value select', async () => {
  const env = installRuntimeDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  const story = createSelectNativeSelectionStory(currentRecord('SelectNative'));
  assert.equal(story.name, 'Native selection');
  assert.throws(() => createSelectNativeSelectionStory(currentRecord('Button')), /require the SelectNative family/u);
  try {
    await act(async () => root.render(story.render(story.args)));
    const [controlled, uncontrolled] = host.querySelectorAll('select');
    const label = (select) => host.querySelector(`label[for="${select.id}"]`).textContent;
    assert.deepEqual([label(controlled), label(uncontrolled)], ['Controlled panel', 'Default panel']);
    const value = host.querySelector('[data-muxui-select-native-value]');
    const log = () => [...host.querySelectorAll('[data-muxui-storybook-event-log="SelectNative"] li')].map((item) => item.textContent);
    assert.deepEqual([controlled.value, value.textContent, uncontrolled.value], ['inbox', 'inbox', 'research']);
    assert.deepEqual(log(), ['Waiting for: change']);
    // The change event sets the controlled value; the default-value select keeps its own selection.
    controlled.value = 'research';
    await act(async () => controlled.dispatchEvent(new Event('change', { bubbles: true })));
    assert.deepEqual([controlled.value, value.textContent], ['research', 'research']);
    assert.deepEqual(log(), ['change: research']);
    uncontrolled.value = 'inbox';
    await act(async () => uncontrolled.dispatchEvent(new Event('change', { bubbles: true })));
    assert.deepEqual([uncontrolled.value, controlled.value, value.textContent], ['inbox', 'research', 'research']);
    assert.deepEqual(log(), ['change: research']);
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

// The Events and Browser proof stories wrap every event callback to log it. The component gets back what its own callback returned:
// TextEditor shows the pending and failure states of a selection request from the promise the handler returns.
test('the Events story hands a supplied callback\'s result back to the component', async () => {
  const story = createEventsStory(currentRecord('TextEditor'));
  const result = Promise.resolve('sent');
  const received = [];
  let wrapped;
  let editor;
  let editorDestroyed;
  const create = React.createElement;
  const env = installRuntimeDom();
  const host = document.querySelector('#root');
  const root = createRoot(host);
  React.createElement = (type, props, ...children) => {
    if (type === TextEditor && props !== null) wrapped = props.onSelectionRequest;
    return create(type, props, ...children);
  };
  try {
    await act(async () => root.render(React.cloneElement(story.render({ ...story.args, onSelectionRequest: (...payload) => { received.push(payload); return result; } }), { key: 'events' })));
    editor = host.querySelector('.ProseMirror').editor;
    editorDestroyed = new Promise((resolve) => editor.on('destroy', resolve));
    assert.equal(typeof wrapped, 'function');
    let returned;
    await act(async () => { returned = wrapped({ type: 'instruction', text: 'Shorten' }, null); });
    assert.equal(returned, result, 'the very promise the caller returned');
    assert.equal(received.length, 1);
    assert.match(host.querySelector('[data-muxui-storybook-event-log]').textContent, /selectionRequest:/u, 'the call is still logged');
  } finally {
    React.createElement = create;
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
  const placements = declaredUnion(overlayTypes, 'MuxUIPlacement');
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
  // SelectNative's size is a visual size or a positive native row count; every other family offers the visual sizes alone.
  assert.match(selectNativeTypes, /size\?: SelectNativeVisualSize \| number;/u);
  const [rowCount, ...unexpected] = controls('SelectNative').size.options.filter((option) => typeof option === 'number');
  assert.deepEqual(unexpected, []);
  assert.ok(Number.isInteger(rowCount) && rowCount > 0, 'the offered native size is a positive integer');
  assert.deepEqual(controls('SelectNative').size.options.filter((option) => typeof option === 'string'), declaredUnion(selectNativeTypes, 'SelectNativeVisualSize'));
  // A derived API's finite values are the control's options, in source order (Decision 0031).
  for (const [family, name] of [['Avatar', 'size'], ['Image', 'radius'], ['Image', 'fit'], ['IconButton', 'variant'], ['Message', 'sender'], ['Activity', 'status']]) {
    assert.deepEqual(controls(family)[name].options, currentRecord(family).binding.api.propDetails[name].enum, `${family}.${name}`);
  }
  assert.deepEqual(controls('Avatar').size.options, ['sm', 'md', 'lg']);
  const nativeList = new JSDOM(renderToStaticMarkup(renderFamily('SelectNative', { size: rowCount }))).window.document.querySelector('select');
  assert.equal(nativeList.getAttribute('size'), String(rowCount));
  assert.equal(nativeList.getAttribute('data-size'), 'md', 'a native row count keeps the medium visual size');
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
  // Only loading is unavailable: no public prop holds an image mid-load.
  assert.deepEqual(unavailable.map((node) => node.closest('.muxui-storybook-state').querySelector('h3').textContent), ['loading']);
  // The loaded row carries a real picture, so a load shows an image over the initials instead of an invisible pixel.
  assert.equal(sections.get('loaded').querySelector('.muxui-avatar__image').getAttribute('src'), AVATAR_LOADED_SRC);
  assert.match(AVATAR_LOADED_SRC, /^data:image\/png;base64,/u);
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
  // load and error are Avatar.Image's native events, outside Avatar's derived API, so Avatar has no Events story.
  assert.equal(STORY_APPLICABILITY.Events(currentRecord('Avatar').binding, 'Avatar'), false);
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

test('Dialog open row is picked with the lifecycle rows and mounts one open dialog at a time', async () => {
  const { document: states, sections } = stateSections('Dialog');
  assert.equal(states.querySelectorAll('[data-muxui-storybook-state="unavailable"]').length, 1, 'only dismissed has no public prop or interaction');
  const select = states.querySelector('[data-muxui-storybook-lifecycle-select="Dialog"]');
  assert.deepEqual([...select.options].map((option) => option.value), ['open', 'entering', 'exiting']);
  assert.equal(sections.get('open').getAttribute('data-muxui-storybook-lifecycle'), 'open');
  // The open row is the one mounted, and it starts settled rather than entering.
  assert.equal(sections.get('open').querySelector('.muxui-storybook-transition-status').textContent, 'open: open');
  for (const state of ['entering', 'exiting']) assert.match(sections.get(state).textContent, new RegExp(`Select ${state} to inspect`, 'u'));
  assert.ok(sections.get('closed').querySelector('.muxui-dialog-trigger'), 'the closed row still renders its trigger');

  await withRuntime(async ({ root: reactRoot }) => {
    const modals = () => document.querySelectorAll('.muxui-dialog-backdrop').length;
    await act(async () => reactRoot.render(renderStateCoverage(currentRecord('Dialog'))));
    await settleRuntime(60);
    // Open from the first frame: no closed phase, and exactly one modal even though three rows could open one.
    assert.equal(modals(), 1);
    const dialog = document.querySelector('.muxui-dialog.muxui-storybook-lifecycle-dialog-open');
    assert.ok(dialog, 'the open row is the open dialog');
    assert.equal(document.querySelector('[data-muxui-storybook-lifecycle="open"] [data-muxui-storybook-transition]').getAttribute('data-muxui-storybook-transition'), 'open');
    // The row's own close button reports the change, like a real Dialog.
    const phase = () => document.querySelector('[data-muxui-storybook-lifecycle="open"] [data-muxui-storybook-transition]').getAttribute('data-muxui-storybook-transition');
    await act(async () => dialog.querySelector('.muxui-dialog-close').click());
    assert.equal(phase(), 'closed');
    // Another row replaces the open one instead of stacking a second modal.
    const lifecycleSelect = document.querySelector('[data-muxui-storybook-lifecycle-select="Dialog"]');
    await act(async () => {
      lifecycleSelect.value = 'entering';
      lifecycleSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settleRuntime(400);
    assert.equal(modals(), 1);
    assert.ok(document.querySelector('.muxui-dialog.muxui-storybook-lifecycle-dialog-entering'));
    assert.equal(document.querySelector('.muxui-storybook-lifecycle-dialog-open'), null);
  });

  // A Dialog the user set closed stays closed in the open row, like every other row.
  await withRuntime(async ({ root: reactRoot }) => {
    const closed = { ...createStory(currentRecord('Dialog'), 'states').args, open: false };
    await act(async () => reactRoot.render(renderStateCoverage(currentRecord('Dialog'), closed)));
    await settleRuntime(60);
    assert.equal(document.querySelectorAll('.muxui-dialog-backdrop').length, 0);
    assert.equal(document.querySelector('[data-muxui-storybook-lifecycle="open"] [data-muxui-storybook-transition]').getAttribute('data-muxui-storybook-transition'), 'closed');
  });
});

test('Controls changed on the mounted States story drive the Dialog open row', async () => {
  await withRuntime(async ({ root: reactRoot, env }) => {
    const record = currentRecord('Dialog');
    const stock = createStory(record, 'states').args;
    const row = () => document.querySelector('[data-muxui-storybook-lifecycle="open"]');
    const phase = () => row().querySelector('[data-muxui-storybook-transition]').getAttribute('data-muxui-storybook-transition');
    // The trigger reports the Dialog's open state at once, where jsdom never finishes React Aria's exit animation.
    const expanded = () => row().querySelector('.muxui-dialog-trigger').getAttribute('aria-expanded');
    // Storybook re-renders the same story with new args, so the tree stays mounted between these renders.
    const settle = async () => {
      await settleRuntime(30);
      env.resolveAnimations();
      await settleRuntime(30);
    };
    const render = async (args) => {
      await act(async () => reactRoot.render(renderStateCoverage(record, args)));
      await settle();
    };
    await render(stock);
    assert.deepEqual([expanded(), phase()], ['true', 'open']);

    await render({ ...stock, open: false });
    assert.deepEqual([expanded(), phase()], ['false', 'closed'], 'open: false closes the mounted Dialog');
    await render({ ...stock, open: true });
    assert.deepEqual([expanded(), phase()], ['true', 'open'], 'open: true opens it again');

    // A controlled Dialog stays open until its owner closes it, but still reports the attempt.
    const attempts = [];
    await render({ ...stock, open: true, onOpenChange: (next) => attempts.push(next) });
    await act(async () => document.querySelector('.muxui-dialog-close').click());
    await settle();
    assert.deepEqual(attempts, [false]);
    assert.deepEqual([expanded(), phase()], ['true', 'open']);

    // With open unset again the row keeps its own dismissal.
    await render(stock);
    await act(async () => document.querySelector('.muxui-dialog-close').click());
    await settle();
    assert.deepEqual([expanded(), phase()], ['false', 'closed']);
  });
});

test('a supplied open mounts one modal across a modal family States rows, and every popover row still follows it', async () => {
  const modalCount = () => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter((modal) => !modal.closest('[data-exiting]')).length;
  for (const family of ['Dialog', 'AlertDialog', 'CommandPalette', 'Lightbox']) {
    await withRuntime(async ({ root: reactRoot }) => {
      const record = currentRecord(family);
      const stock = createStory(record, 'states').args;
      // The rows that would each open a modal: Dialog closed and focused, AlertDialog closed, focused and disabled, and so on.
      await act(async () => reactRoot.render(renderStateCoverage(record, { ...stock, open: true })));
      await settleRuntime(80);
      assert.equal(modalCount(), 1, `${family}: one modal for a supplied open`);
    });
  }
  // Popovers are not modal, so the supplied value still opens the closed and focused rows too.
  await withRuntime(async ({ root: reactRoot }) => {
    const record = currentRecord('Popover');
    await act(async () => reactRoot.render(renderStateCoverage(record, { ...createStory(record, 'states').args, open: true })));
    await settleRuntime(80);
    const expanded = [...document.querySelectorAll('.muxui-storybook-state')]
      .filter((row) => row.querySelector('[aria-expanded="true"]')).map((row) => row.querySelector('h3').textContent);
    assert.ok(expanded.includes('closed') && expanded.includes('open'), `Popover rows opened: ${expanded.join(', ')}`);
  });
});

test('DropZone disabled row renders a disabled drop zone and the other rows stay enabled', () => {
  const { document: states, sections } = stateSections('DropZone');
  assert.equal(states.querySelectorAll('[data-muxui-storybook-state="unavailable"]').length, 0);
  const disabled = sections.get('disabled').querySelector('.muxui-drop-zone');
  assert.equal(disabled.getAttribute('data-disabled'), 'true');
  assert.equal(disabled.getAttribute('aria-disabled'), 'true');
  const idle = sections.get('idle').querySelector('.muxui-drop-zone');
  assert.equal(idle.hasAttribute('data-disabled'), false);
  assert.equal(idle.hasAttribute('aria-disabled'), false);
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
  const { document: states, sections } = stateSections('Image');
  // Every row has a specimen. A radius row frames the transparent image in a token fill, so the rounding shows.
  assert.equal(states.querySelectorAll('[data-muxui-storybook-state="unavailable"]').length, 0);
  for (const radius of ['sm', 'md', 'lg', 'full']) {
    const framed = sections.get(`radius-${radius}`).querySelector('img');
    assert.ok(framed.classList.contains(`muxui-image--radius-${radius}`), radius);
    assert.equal(framed.style.background, 'var(--muxui-semantic-surface-strong)', `${radius} row paints the image box with a token`);
  }
  assert.equal(sections.get('fallback').querySelector('img').style.background, '', 'the other rows stay unframed');
  // A radius the user sets wins in every row.
  assert.ok(stateSections('Image', { ...createStory(currentRecord('Image'), 'states').args, radius: 'lg' }).sections.get('radius-sm').querySelector('img').classList.contains('muxui-image--radius-lg'));

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
    assert.match(row('fallback').querySelector('img').getAttribute('src'), /^data:image\/png/u, 'the working fallback is the verified transparent pixel');
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

test('every States story leaves its named states unmasked by binding defaults', () => {
  // Each row's own props must reach it: a stock States story that kept `disabled: false` would hide the disabled row.
  const masked = [];
  for (const binding of descriptorSource.bindings) {
    const family = binding.export;
    const stock = storyArgsForBinding(binding, 'states', family);
    for (const { name, args } of stateCoverageForBinding(binding, family)) {
      const shown = stateArgsForBinding(binding, name, family, stock);
      for (const [prop, value] of Object.entries(args)) {
        if (typeof value === 'object' || typeof value === 'function') continue;
        if (Object.hasOwn(shown, prop) && shown[prop] !== value) masked.push(`${family}/${name}: ${prop} is ${String(shown[prop])}, not ${String(value)}`);
      }
    }
  }
  assert.deepEqual(masked, []);
});

test('named states render their public state in sampled families, and a supplied value still wins', () => {
  const sampled = [
    ['TagSelect', 'disabled', 'disabled', '.muxui-tag-select[data-disabled]'],
    ['TagSelect', 'invalid', 'invalid', '.muxui-tag-select[data-invalid]'],
    ['RadioField', 'disabled', 'disabled', '.muxui-radio-field[data-disabled]'],
    ['RadioField', 'invalid', 'invalid', '.muxui-radio-field__error'],
    ['Checkbox', 'indeterminate', 'indeterminate', '.muxui-checkbox[data-indeterminate]'],
    ['Checkbox', 'disabled', 'disabled', '.muxui-checkbox[data-disabled]'],
    ['TextField', 'read-only', 'readOnly', 'input[readonly]'],
    ['Button', 'pending', 'pending', '.muxui-button[data-pending]'],
    ['Switch', 'disabled', 'disabled', '.muxui-switch[data-disabled]'],
  ];
  for (const [family, state, prop, selector] of sampled) {
    const { args } = createStory(currentRecord(family), 'states');
    assert.equal(Object.hasOwn(args, prop), false, `${family} States story leaves ${prop} to its rows`);
    const { sections } = stateSections(family);
    assert.ok(sections.get(state).querySelector(selector), `${family} ${state} row shows ${state}`);
    for (const [name, row] of sections) {
      if (name !== state && !['disabled', 'invalid'].includes(name)) assert.equal(row.querySelector(selector), null, `${family} ${state} does not leak into ${name}`);
    }
    // An explicit false is the user's value, so it wins even over the row that names the state.
    const overridden = stateSections(family, { ...args, [prop]: false }).sections;
    assert.equal(overridden.get(state).querySelector(selector), null, `${family} ${prop}: false wins in the ${state} row`);
  }
});

test('a value the user sets wins over a named state at render time, even false, empty, or the default', () => {
  const rows = (family, args) => stateSections(family, { ...createStory(currentRecord(family), 'states').args, ...args }).sections;
  const streaming = (sections) => sections.get('streaming').querySelector('.muxui-message').hasAttribute('data-streaming');
  assert.equal(streaming(rows('Message', {})), true);
  assert.equal(streaming(rows('Message', { streaming: false })), false);

  const codeBlock = (sections, row) => sections.get(row).querySelector('.muxui-code-block');
  const codeStock = rows('CodeBlock', {});
  assert.equal(codeBlock(codeStock, 'wrap').getAttribute('data-wrap'), 'true');
  assert.equal(codeBlock(codeStock, 'diff').getAttribute('data-mode'), 'diff');
  const codeOverridden = rows('CodeBlock', { wrap: false, mode: 'code' });
  assert.equal(codeBlock(codeOverridden, 'wrap').hasAttribute('data-wrap'), false, 'wrap: false wins in the wrap row');
  assert.equal(codeBlock(codeOverridden, 'diff').getAttribute('data-mode'), 'code', 'a mode equal to the default wins in the diff row');

  const composerError = (sections) => sections.get('error').querySelector('.muxui-prompt-composer-error');
  assert.equal(composerError(rows('PromptComposer', {})).textContent, 'Unable to send. Try again.');
  assert.equal(composerError(rows('PromptComposer', { error: '' })), null, 'an empty error wins in the error row');

  const selectAll = (sections) => sections.get('mixed').querySelector('.muxui-data-diff-selection input').getAttribute('aria-checked');
  assert.equal(selectAll(rows('DataDiff', {})), 'mixed');
  assert.equal(selectAll(rows('DataDiff', { defaultSelectedIds: [] })), 'false', 'an empty selection wins in the mixed row');
});

test('every States row renders exactly the args its state projects, so a user value reaches it', () => {
  // The rows are projected by stateArgsForBinding, which lets an explicit user value win. A row that rendered
  // anything other than renderFamily(projected args) would have set state values again at render time.
  const neutralOf = (value, control, name) => typeof value === 'boolean' ? false
    : Array.isArray(value) ? []
    // A blank image source is not a neutral value.
    : typeof value === 'string' && control === 'text' && !/src/iu.test(name) ? '' : undefined;
  const fragment = (html) => new JSDOM(`<div id="host">${html}</div>`).window.document.getElementById('host');
  // Strips only what the matrix adds to keep rows apart: generated ids, lifecycle markers, row labels.
  const comparable = (html, family, state) => html
    .replace(/ (?:id|for|aria-labelledby|aria-describedby|aria-controls|aria-owns|name|form|aria-activedescendant|data-collection|data-key)="[^"]*"/gu, '')
    .replace(/_R_\w*_|react-aria[\w-]*/gu, '#')
    .replace(/muxui-storybook-lifecycle-[a-z0-9-]*/gu, '')
    .replace(/<span hidden="" aria-hidden="true"><\/span>/gu, '')
    .replace(/ class=" *"/gu, '')
    .replace(/class="([^"]*?) +"/gu, 'class="$1"')
    .replace(`Proposed token cleanup ${state}`, 'Proposed token cleanup')
    .replace(['Breadcrumbs', 'Group', 'HeaderNav'].includes(family) ? / aria-label="[^"]*"/gu : /$^/u, '');
  const mismatched = [];
  let compared = 0;
  for (const binding of descriptorSource.bindings) {
    const family = binding.export;
    const record = { family, tranche: 'x', binding };
    const base = storyArgsForBinding(binding, 'default', family);
    const stock = storyArgsForBinding(binding, 'states', family);
    const controls = argTypesForBinding(binding);
    const wrap = (element) => family === 'Toast' ? React.createElement(ToastProvider, null, element) : element;
    // Lifecycle rows animate open themselves, and unavailable rows render no specimen.
    for (const { name, args } of stateCoverageForBinding(binding, family).filter(({ name: state }) => !isLifecycleState(family, state))) {
      // Override each prop this row drives with an explicit neutral value: false, empty, or the default.
      const user = { ...stock };
      for (const prop of new Set([...Object.keys(args), ...Object.keys(base)])) {
        if (typeof args[prop] === 'function' || JSON.stringify(args[prop]) === JSON.stringify(base[prop])) continue;
        const neutral = neutralOf(args[prop] ?? base[prop], controls[prop]?.control, prop);
        if (neutral !== undefined) user[prop] = neutral;
      }
      const section = [...fragment(renderToStaticMarkup(wrap(renderStateCoverage(record, user)))).querySelectorAll('.muxui-storybook-state')]
        .find((node) => node.querySelector('h3').textContent === name);
      if (section.querySelector('[data-muxui-storybook-state="unavailable"]')) continue;
      section.querySelector('h3').remove();
      const actual = comparable((section.querySelector('[data-muxui-storybook-popup-room]') ?? section).innerHTML, family, name);
      const expected = comparable(fragment(renderToStaticMarkup(wrap(renderFamily(family, stateArgsForBinding(binding, name, family, user))))).innerHTML, family, name);
      compared += 1;
      if (actual !== expected) mismatched.push(`${family}/${name}`);
    }
  }
  assert.ok(compared > 300, `compared ${compared} rows`);
  assert.deepEqual(mismatched, []);
});

test('the open row clicks its trigger open, unless the user set it closed', async () => {
  // The click is an effect of the mounted row, which a static render cannot see.
  const isOpen = {
    DatePicker: (row) => row.querySelector('.muxui-date-trigger').getAttribute('aria-expanded') === 'true',
    DateRangePicker: (row) => row.querySelector('.muxui-date-trigger').getAttribute('aria-expanded') === 'true',
    Select: (row) => row.querySelector('.muxui-select-trigger').getAttribute('aria-expanded') === 'true',
    CommandPalette: (row) => row.querySelector('.muxui-command-palette').hasAttribute('data-open'),
  };
  for (const [family, opened] of Object.entries(isOpen)) {
    const story = createStory(currentRecord(family), 'states');
    for (const [label, args, expected] of [
      ['stock', story.args, true],
      ['defaultOpen: false', { ...story.args, defaultOpen: false }, false],
      ['open: false', { ...story.args, open: false }, false],
    ]) {
      await withRuntime(async ({ host, root: reactRoot }) => {
        await act(async () => reactRoot.render(story.render(args)));
        await settleRuntime(120);
        const row = [...host.querySelectorAll('.muxui-storybook-state')].find((node) => node.querySelector('h3').textContent === 'open');
        assert.equal(opened(row), expected, `${family} open row with ${label}`);
      });
    }
  }
});

test('ColorSwatchPicker read-only row ignores clicks and keeps keyboard navigation', async () => {
  await withRuntime(async ({ host, root: reactRoot }) => {
    const story = createStory(currentRecord('ColorSwatchPicker'), 'states');
    assert.equal(Object.hasOwn(story.args, 'readOnly'), false, 'the States story leaves readOnly to the row');
    await act(async () => reactRoot.render(story.render(story.args)));
    await settleRuntime(60);
    const row = [...host.querySelectorAll('.muxui-storybook-state')].find((node) => node.querySelector('h3').textContent === 'read-only');
    assert.equal(row.querySelector('.muxui-color-swatch-picker').getAttribute('aria-readonly'), 'true');
    const items = [...row.querySelectorAll('[role="option"]')];
    const selected = () => items.map((item) => item.getAttribute('aria-selected'));
    const before = selected();
    await act(async () => items[1].click());
    assert.deepEqual(selected(), before, 'a click does not select a swatch in the read-only row');
    // The row still takes focus and moves it with the arrow keys, where a disabled picker would not.
    await act(async () => items[0].focus());
    await act(async () => items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, items[1], 'ArrowRight moves focus to the next swatch');
    assert.deepEqual(selected(), before, 'moving focus does not select');

    // A readOnly the user sets, even false, wins in every row, so the same click then selects.
    await act(async () => reactRoot.render(React.cloneElement(story.render({ ...story.args, readOnly: false }), { key: 'user-override' })));
    await settleRuntime(60);
    const overridden = [...host.querySelectorAll('.muxui-storybook-state')].find((node) => node.querySelector('h3').textContent === 'read-only');
    assert.equal(overridden.querySelector('.muxui-color-swatch-picker').hasAttribute('aria-readonly'), false);
    const [, second] = overridden.querySelectorAll('[role="option"]');
    await act(async () => second.click());
    assert.equal(second.getAttribute('aria-selected'), 'true');
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
  assert.equal(matrix.parameters.muxuiButtonMatrix.combinations, 21, 'the matrix counts the derived variants and sizes');
  assert.deepEqual(new Set(tuples), new Set(
    ['sm', 'md', 'lg'].flatMap((size) => ['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse'].map((variant) => `${variant}/${size}`)),
  ));
  assert.deepEqual(Object.keys(matrix.argTypes).sort(), storyApi(binding).props.slice().sort());

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
    try {
      // Built from the factory so root-only families, whose pages omit Anatomy, still prove their parts.
      const story = createAnatomyStory({ family: record.family, tranche: record.tranche, binding });
      await act(async () => root.render(story.render(story.args)));
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
  for (const name of ['label', 'value', 'defaultValue', 'name', 'placeholder']) {
    assert.equal(textFieldArgTypes[name].control, 'text', name);
  }

  const comboBoxBinding = descriptor.bindings.find(({ export: name }) => name === 'ComboBox');
  assert.equal(argTypesForBinding(comboBoxBinding).items.control, 'object');
  const numberFieldBinding = descriptor.bindings.find(({ export: name }) => name === 'NumberField');
  assert.equal(argTypesForBinding(numberFieldBinding).value.control.type, 'number');
  assert.equal(argTypesForBinding(numberFieldBinding).minValue.control.type, 'number');
  const dialogBinding = descriptor.bindings.find(({ export: name }) => name === 'Dialog');
  assert.equal(argTypesForBinding(dialogBinding).title.control, 'text');
  assert.deepEqual(
    argTypesForBinding(descriptor.bindings.find(({ export: name }) => name === 'Popover')).placement.options,
    declaredUnion(overlayTypes, 'MuxUIPlacement'),
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
      if (!storyApi(binding).props.includes(controlled) || !storyApi(binding).props.includes(uncontrolled)) continue;
      assert.equal(defaultArgs[controlled], undefined, `${family} default ${controlled}`);
      assert.notEqual(defaultArgs[uncontrolled], undefined, `${family} default ${uncontrolled}`);
      // The States story never sets the controlled prop, and leaves unset the uncontrolled default a row drives.
      assert.equal(stateArgs[controlled], undefined, `${family} states ${controlled}`);
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
      assert.ok(Object.keys(args).every((prop) => storyApi(binding).props.includes(prop)
        || record.family === 'TagGroup' && name === 'removable' && prop === 'onRemove'), `${record.family}/${name} leaked a non-Mux UI prop`);
    }
    const story = createStory({ family: record.family, tranche: record.tranche, binding }, 'states');
    assert.deepEqual(comparableCoverage(story.parameters.muxuiStateCoverage), comparableCoverage(coverage), `${record.family} metadata`);
    assert.deepEqual(Object.keys(story.argTypes).sort(), storyApi(binding).props.slice().sort(), `${record.family} controls`);
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

test('generated stories are stock CSF modules that display only the stories that teach something', async () => {
  const standard = ['States', 'Controlled', 'Uncontrolled', 'Events', 'Anatomy'];
  for (const record of historicalManifest.families) {
    const slug = record.family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const tranche = record.tranche.replace('.', '-').toLowerCase();
    const fileName = `${tranche}-${slug}.stories.mjs`;
    const source = await readFile(resolve(appRoot, '.storybook/generated', fileName), 'utf8');
    const body = generatedBody(source, fileName);
    assert.match(body, /include: storyApi\(binding\)\.props/);
    assert.match(body, /argTypesForBinding/);
    assert.match(body, /export const Default/);
    assert.match(body, /export const BrowserProof/);
    assert.match(body, /BrowserProof\.tags = \['!dev', '!autodocs'\];/);

    const binding = descriptor.bindings.find(({ export: name }) => name === record.family);
    const pairs = controlledDefaultPairsForBinding(binding).length > 0;
    const expected = {
      States: STORY_APPLICABILITY.States(binding, record.family),
      Controlled: pairs,
      Uncontrolled: pairs,
      Events: binding.api.events.length > 0,
      Anatomy: binding.api.parts.some((part) => part !== 'root'),
    };
    const exported = standard.filter((name) => new RegExp(`^export const ${name} =`, 'mu').test(body));
    assert.deepEqual(exported, standard.filter((name) => expected[name]), `${record.family} displays the stories that apply to it`);
    // The manifest the audits select pages from lists exactly what the module exports.
    const pageNames = manifest.pageIndex.find(({ family }) => family === record.family).stories.map(({ exportName }) => exportName);
    assert.deepEqual(pageNames.filter((name) => name === 'Default' || name === 'BrowserProof' || standard.includes(name)),
      ['Default', ...exported, 'BrowserProof'], `${record.family} page index`);
  }

  // A family without events, a controlled pair, or states beyond its default shows none of those stories.
  const exportsOf = async (family) => {
    const { tranche } = manifest.families.find((record) => record.family === family);
    const slug = family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const module = await import(`../.storybook/generated/${tranche.replace('.', '-').toLowerCase()}-${slug}.stories.mjs`);
    return Object.keys(module).filter((name) => name !== 'default').sort();
  };
  assert.deepEqual(await exportsOf('Text'), ['BrowserProof', 'Default'], 'Text has no events, pair, parts, or supported state');
  const group = await exportsOf('Group');
  assert.ok(group.includes('Anatomy') && group.includes('States'), 'Group has parts and states');
  assert.ok(!group.includes('Events'), 'Group declares no events, so it has no Events story');
  assert.ok(!group.includes('Controlled') && !group.includes('Uncontrolled'), 'Group has no controlled pair');
  assert.deepEqual(await exportsOf('Button'), ['Anatomy', 'BrowserProof', 'Default', 'Events', 'Matrix', 'States']);
  // A nested submenu is unreachable in the state matrix, so Menu has a story of its own for it.
  assert.ok((await exportsOf('Menu')).includes('NestedSubmenu'));
  // SelectNative's native value and change event are outside its derived API; its own story shows them.
  assert.ok((await exportsOf('SelectNative')).includes('NativeSelection'));
  assert.ok((await exportsOf('Checkbox')).includes('Controlled'), 'a family with a controlled pair keeps the pair');
  // A family whose named states the specimen cannot show has no States page of unavailable rows.
  for (const family of ['Form', 'Markdown', 'Meter']) assert.ok(!(await exportsOf(family)).includes('States'), family);

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
