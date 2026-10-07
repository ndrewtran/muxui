import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import manifest from '../.storybook/generated/manifest.mjs';
import { fetchStorybookIndex } from './helpers/storybook-index.mjs';
import { resolveStorybookPageSelection, validateRuntimeStoryPages } from './storybook-page-selection.mjs';
import { scopedStorybookCheckPlan } from '../src/check-scoped.mjs';

const appRoot = resolve(import.meta.dirname, '..');

function env(proof, families, storyIds) {
  return {
    ...(proof ? { MUXUI_STORYBOOK_AUDIT_PROOF: proof } : {}),
    ...(families ? { MUXUI_STORYBOOK_FAMILIES: families } : {}),
    ...(storyIds !== undefined ? { MUXUI_STORYBOOK_STORY_IDS: storyIds } : {}),
  };
}

test('storybook page selection resolves one exact authored page and its family', () => {
  const selection = resolveStorybookPageSelection(env(
    'story',
    'NumberField',
    'muxui-react-r1-2-number-field--sizing',
  ));
  assert.equal(selection.pages.length, 1);
  assert.equal(selection.pages[0].name, 'Sizing');
  assert.equal(selection.pages[0].source, 'catalog/components/number-field/examples/react/sizing.tsx');
  assert.deepEqual(selection.families, ['NumberField']);
});

test('storybook page index mirrors static CSF fallback and explicit story names', () => {
  const stories = manifest.pageIndex.find(({ family }) => family === 'Button').stories;
  // CSF indexes expression exports by their export names; only explicit object-literal names override that fallback.
  assert.equal(stories.find(({ exportName }) => exportName === 'Anatomy').name, 'Anatomy');
  assert.equal(stories.find(({ exportName }) => exportName === 'BrowserProof').name, 'Browser Proof');
  assert.equal(stories.find(({ exportName }) => exportName === 'Matrix').name, 'Variant × size');
  const autocomplete = manifest.pageIndex.find(({ family }) => family === 'Autocomplete').stories;
  assert.equal(autocomplete.find(({ exportName }) => exportName === 'DisabledItemsInteraction').name, 'Disabled items keyboard navigation');
  const sizing = manifest.pageIndex.find(({ family }) => family === 'NumberField').stories
    .find(({ exportName }) => exportName === 'Sizing');
  assert.equal(sizing.name, 'Sizing');
});

test('storybook page selection covers every page in one component family and all pages for theme proof', () => {
  const component = resolveStorybookPageSelection(env('component', 'Button'));
  assert.deepEqual(component.pages, manifest.pageIndex
    .find(({ family }) => family === 'Button').stories.map((story) => ({
      ...story,
      family: 'Button',
      storyFile: manifest.pageIndex.find(({ family }) => family === 'Button').storyFile,
    })));
  assert.ok(component.pages.every(({ family }) => family === 'Button'));

  const theme = resolveStorybookPageSelection(env('theme'));
  assert.equal(theme.pages.length, manifest.pageIndex.flatMap(({ stories }) => stories)
    .filter(({ exportName }) => exportName !== 'BrowserProof').length);
  assert.ok(theme.pages.some(({ family }) => family === 'Button'));
  assert.ok(theme.pages.some(({ family }) => family === 'NumberField'));
  assert.ok(theme.pages.every(({ exportName }) => exportName !== 'BrowserProof'));

  const familyTheme = resolveStorybookPageSelection(env('theme', 'Button'));
  assert.ok(familyTheme.pages.every(({ family, exportName }) => family === 'Button' && exportName !== 'BrowserProof'));
  const pageTheme = resolveStorybookPageSelection(env('theme', 'NumberField', 'muxui-react-r1-2-number-field--sizing'));
  assert.deepEqual(pageTheme.pages.map(({ id }) => id), ['muxui-react-r1-2-number-field--sizing']);
});

test('storybook page selection treats a Block page group like a family and lists Block pages in the full audit', () => {
  const [block] = manifest.patterns;
  assert.ok(block, 'the generated manifest lists at least one Block');
  const group = manifest.pageIndex.find(({ family }) => family === block.family);
  assert.ok(!manifest.families.some(({ family }) => family === block.family), 'a Block is not a component family');
  for (const key of [block.family, block.slug]) {
    const component = resolveStorybookPageSelection(env('component', key));
    assert.deepEqual(component.families, [block.family]);
    assert.deepEqual(component.pages.map(({ id }) => id), group.stories.map(({ id }) => id));
  }
  const [first] = group.stories;
  assert.deepEqual(resolveStorybookPageSelection(env('story', block.family, first.id)).pages.map(({ id }) => id), [first.id]);
  assert.deepEqual(resolveStorybookPageSelection(env('theme', block.family)).pages.map(({ id }) => id), group.stories.map(({ id }) => id));
  assert.throws(() => resolveStorybookPageSelection(env('story', 'Button', first.id)), /FAMILY_MISMATCH/u);

  // The full audit walks every component family itself and lists only the Block pages for the page-level audits.
  const full = resolveStorybookPageSelection({});
  assert.equal(full.proof, 'full');
  assert.deepEqual(
    full.pages.map(({ id }) => id),
    manifest.patterns.flatMap(({ family }) => manifest.pageIndex.find((page) => page.family === family).stories.map(({ id }) => id)),
  );
  assert.throws(() => resolveStorybookPageSelection(env('full', block.family)), /FULL_FILTER_UNEXPECTED/u);

  // The served index titles a Block page Blocks/<Category>/<Pattern>, whose last segment is the group key.
  const selection = resolveStorybookPageSelection(env('story', block.family, first.id));
  const runtimeEntry = { id: first.id, type: 'story', title: `Blocks/Category/${block.family}`, name: first.name };
  assert.deepEqual(validateRuntimeStoryPages(selection, { entries: { [first.id]: runtimeEntry } }), [runtimeEntry]);
});

test('storybook page selection fails closed for empty, unknown, or mismatched selectors', () => {
  assert.throws(() => resolveStorybookPageSelection(env('story', 'Button', '')), /STORY_IDS_EMPTY/u);
  assert.throws(() => resolveStorybookPageSelection(env('story', 'Button', 'muxui-react-missing--default')), /STORY_ID_UNKNOWN/u);
  assert.throws(() => resolveStorybookPageSelection(env('story', 'Button', 'muxui-react-r1-2-number-field--sizing')), /FAMILY_MISMATCH/u);
  assert.throws(() => resolveStorybookPageSelection(env('component', 'Unknown')), /FAMILY_UNKNOWN/u);
  assert.throws(() => resolveStorybookPageSelection(env('theme', 'Button', 'muxui-react-r1-1-checkbox--states')), /FAMILY_MISMATCH/u);
  assert.throws(() => resolveStorybookPageSelection(env('theme', 'Button', 'muxui-react-r1-1-button--browser-proof')), /THEME_BEHAVIOR_PAGE_UNSUPPORTED/u);
});

test('storybook page selection validates every selected ID against the served index', () => {
  const page = manifest.pageIndex.find(({ family }) => family === 'Button').stories[0];
  const selection = resolveStorybookPageSelection(env('story', 'Button', page.id));
  const runtimeEntry = { id: page.id, type: 'story', title: 'Mux UI React/Button', name: page.name };
  assert.deepEqual(validateRuntimeStoryPages(selection, { entries: { [page.id]: runtimeEntry } }), [runtimeEntry]);
  assert.throws(() => validateRuntimeStoryPages(selection, { entries: {} }), /RUNTIME_PAGE_MISSING/u);
  assert.throws(() => validateRuntimeStoryPages(selection, {
    entries: { [page.id]: { ...runtimeEntry, title: 'Mux UI React/Checkbox' } },
  }), /RUNTIME_PAGE_FAMILY_MISMATCH/u);
  assert.throws(() => validateRuntimeStoryPages(selection, {
    entries: { [page.id]: { ...runtimeEntry, name: 'Wrong page' } },
  }), /RUNTIME_PAGE_NAME_MISMATCH/u);
});

test('storybook scoped check runner includes only suites for the selected proof', () => {
  const story = scopedStorybookCheckPlan(resolveStorybookPageSelection(env(
    'story',
    'NumberField',
    'muxui-react-r1-2-number-field--sizing',
  )));
  assert.match(story.args.join(' '), /storybook-a11y\.test\.mjs/u);
  assert.match(story.args.join(' '), /storybook-colors\.test\.mjs/u);
  assert.match(story.args.join(' '), /NumberField sizing story computes fit-content/u);
  assert.match(story.args.join(' '), /Storybook colour audit recognizes canonical token mixes and shadow-only focus opacity/u);

  const unrelatedPages = scopedStorybookCheckPlan(resolveStorybookPageSelection(env('component', 'Tree,TagSelect')));
  assert.doesNotMatch(unrelatedPages.args.join(' '), /NumberField sizing story computes/u);

  const theme = scopedStorybookCheckPlan(resolveStorybookPageSelection(env('theme')));
  assert.match(theme.args.join(' '), /storybook-a11y\.test\.mjs/u);
  assert.match(theme.args.join(' '), /all selected Storybook pages meet theme contrast in light and dark/u);
  assert.match(theme.args.join(' '), /Storybook colour audit recognizes canonical token mixes and shadow-only focus opacity/u);
  assert.doesNotMatch(theme.args.join(' '), /selected Mux UI React Storybook pages are axe-clean/u);
  assert.match(theme.args.join(' '), /selected Storybook pages paint only canonical Mux colours/u);
  assert.doesNotMatch(theme.args.join(' '), /Browser Proof/u);

  const chrome = scopedStorybookCheckPlan(resolveStorybookPageSelection(env('chrome')));
  assert.doesNotMatch(chrome.args.join(' '), /storybook-a11y\.test\.mjs/u);
  assert.match(chrome.args.join(' '), /manager and docs paint only canonical Mux colours/u);

  const full = scopedStorybookCheckPlan(resolveStorybookPageSelection({}));
  assert.deepEqual(full, { command: 'pnpm', args: ['check'], label: 'full package audit' });
});

test('storybook scoped check runner rejects an implicit full audit at its entrypoint', async () => {
  const stubDirectory = await mkdtemp(join(tmpdir(), 'muxui-storybook-check-'));
  const pnpmStub = join(stubDirectory, 'pnpm');
  await writeFile(pnpmStub, '#!/bin/sh\nprintf "FULL_AUDIT_CHILD_INVOKED\\n"\n', { mode: 0o755 });
  const environment = { ...process.env, PATH: stubDirectory };
  delete environment.MUXUI_STORYBOOK_AUDIT_PROOF;
  delete environment.MUXUI_STORYBOOK_FAMILIES;
  delete environment.MUXUI_STORYBOOK_STORY_IDS;

  try {
    const implicit = spawnSync(process.execPath, ['src/check-scoped.mjs'], {
      cwd: appRoot,
      env: environment,
      encoding: 'utf8',
      timeout: 5_000,
    });
    assert.equal(implicit.status, 1, implicit.stderr);
    assert.match(implicit.stderr, /MUXUI_STORYBOOK_AUDIT_PROOF_REQUIRED/u);
    assert.doesNotMatch(implicit.stdout, /FULL_AUDIT_CHILD_INVOKED/u);

    const explicitFull = spawnSync(process.execPath, ['src/check-scoped.mjs'], {
      cwd: appRoot,
      env: { ...environment, MUXUI_STORYBOOK_AUDIT_PROOF: 'full' },
      encoding: 'utf8',
      timeout: 5_000,
    });
    assert.equal(explicitFull.status, 0, explicitFull.stderr);
    assert.match(explicitFull.stdout, /FULL_AUDIT_CHILD_INVOKED/u);
  } finally {
    await rm(stubDirectory, { recursive: true, force: true });
  }
});

test('storybook page index requests honor cancellation and a bounded timeout', async () => {
  const server = createServer(() => {});
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/index.json`;

  try {
    const controller = new AbortController();
    const cancelRequestArrived = new Promise((resolvePromise) => server.once('request', resolvePromise));
    const canceledRequest = fetchStorybookIndex(url, { signal: controller.signal, timeoutMs: 5_000 });
    await cancelRequestArrived;
    controller.abort();
    await assert.rejects(canceledRequest, { name: 'AbortError' });

    const timeoutRequestArrived = new Promise((resolvePromise) => server.once('request', resolvePromise));
    const timedRequest = fetchStorybookIndex(url, { timeoutMs: 25 });
    await timeoutRequestArrived;
    await assert.rejects(timedRequest, { name: 'TimeoutError' });
  } finally {
    server.closeAllConnections();
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
});
