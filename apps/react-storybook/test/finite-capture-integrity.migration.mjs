import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import finiteFixtures from '../../../catalog/react-r1-6/finite-fixtures.json' with { type: 'json' };
import { noApplicableDonorFamilies } from '../src/visual-migration-contract.mjs';

import { targetSelector } from './run-r1-6-finite-paired.mjs';

import {
  FINITE_CAPTURE_REPORT_SCHEMA,
  PINNED_FINITE_DONOR,
  artifactRecord,
  assertAllowedRequests,
  assertCaptureInput,
  assertFiniteInventory,
  assertFiniteReportSchema,
  assertMuxOnlyRuntimeClosure,
  assertMuxOnlySourceBoundary,
  assertPinnedFiniteDonor,
  assertReplayFactShape,
  assertReplayFacts,
  assertReportRelativePath,
  assertReferenceBinding,
  assertStableCaptureFingerprint,
  buildContentManifest,
  captureFingerprint,
  compareReplayFacts,
  readRetainedArtifact,
  sha256Bytes,
} from './finite-capture-integrity.mjs';

const scenarios = [
  { id: 'button--default', props: {}, action: undefined },
  { id: 'dialog--open', props: { open: true }, action: { type: 'click', selector: '.trigger' } },
];

function result(scenario, mode) {
  return {
    scenario: scenario.id,
    mode,
    input: { props: scenario.props, action: scenario.action ?? null },
  };
}

function replayFacts() {
  return {
    styleFacts: { selector: '.muxui-button', properties: { color: 'rgb(0, 0, 0)' } },
    facts: { state: 'idle', portal: null },
    actualNamedAnatomyParts: { root: { selector: '.muxui-button' }, label: { selector: '.muxui-button__label' } },
    fonts: [{ family: 'Inter', loaded: true, checked: true }],
    motion: { reducedMotion: true, animations: [] },
    lifecycle: null,
    rawPNG: { sha256: `sha256:${'1'.repeat(64)}`, width: 1, height: 1 },
  };
}

test('retained artifacts are bounded, present, and byte-addressed', async () => {
  const root = await mkdtemp('/tmp/muxui-finite-integrity-artifacts-');
  const outside = await mkdtemp('/tmp/muxui-finite-integrity-outside-');
  const bytes = Buffer.from('finite capture bytes', 'utf8');
  const relativePath = 'artifacts/button--default--light.png';
  try {
    await mkdir(join(root, 'artifacts'), { recursive: true });
    await writeFile(join(root, relativePath), bytes);
    const record = artifactRecord(relativePath, bytes);
    const retained = await readRetainedArtifact(root, record.path, record.sha256);
    assert.equal(retained.sha256, sha256Bytes(bytes));
    assert.deepEqual(retained.bytes, bytes);
    const manifestBefore = await buildContentManifest(root, [relativePath]);
    assert.deepEqual(manifestBefore, [{ path: relativePath, sha256: record.sha256, byteLength: bytes.byteLength }]);

    await writeFile(join(root, relativePath), Buffer.from('changed source bytes', 'utf8'));
    const manifestAfter = await buildContentManifest(root, [relativePath]);
    assert.notDeepEqual(manifestBefore, manifestAfter);
    assert.throws(() => assertReferenceBinding({ sourceInput: manifestBefore }, { sourceInput: manifestAfter }, { requiredPaths: ['sourceInput'] }), /stale/u);
    await writeFile(join(root, relativePath), Buffer.from('corrupt', 'utf8'));
    await assert.rejects(readRetainedArtifact(root, relativePath, record.sha256), /corrupt/u);
    await rm(join(root, relativePath));
    await assert.rejects(readRetainedArtifact(root, relativePath, record.sha256), /missing/u);
    assert.throws(() => assertReportRelativePath('../escape.png'), /inside the report directory/u);
    assert.throws(() => assertReportRelativePath('/tmp/escape.png'), /report-relative/u);
    assert.throws(() => assertReportRelativePath('artifacts\\escape.png'), /report-relative/u);

    await writeFile(join(outside, 'outside.png'), bytes);
    await symlink(join(outside, 'outside.png'), join(root, relativePath));
    await assert.rejects(readRetainedArtifact(root, relativePath, record.sha256), /symbolic link/u);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('the report schema and donor identity are exact Mux-owned bindings', () => {
  assert.doesNotThrow(() => assertFiniteReportSchema({ schema: FINITE_CAPTURE_REPORT_SCHEMA }));
  assert.throws(() => assertFiniteReportSchema({ schema: 'muxui-react-r1-6-finite-paired-capture-v1' }), /schema/u);
  assert.doesNotThrow(() => assertPinnedFiniteDonor(PINNED_FINITE_DONOR));
  const drift = { ...PINNED_FINITE_DONOR, commit: `0${PINNED_FINITE_DONOR.commit.slice(1)}` };
  assert.throws(() => assertPinnedFiniteDonor(drift), /not pinned/u);
});

test('finite inventory proves complete unique case/mode coverage and exact props/actions', () => {
  const complete = [
    result(scenarios[0], 'light'), result(scenarios[0], 'dark'),
    result(scenarios[1], 'light'), result(scenarios[1], 'dark'),
  ];
  assert.deepEqual(assertFiniteInventory({ scenarios, results: complete }), {
    requested: 2,
    modes: ['light', 'dark'],
    captureCount: 4,
    complete: true,
  });
  assert.throws(() => assertFiniteInventory({ scenarios, results: [...complete, result(scenarios[0], 'light')] }), /duplicate result/u);
  assert.throws(() => assertFiniteInventory({ scenarios, results: complete.slice(0, -1) }), /missing results/u);
  const changedProps = structuredClone(complete);
  changedProps[0].input.props = { variant: 'quiet' };
  assert.throws(() => assertFiniteInventory({ scenarios, results: changedProps }), /props do not match/u);
  const changedAction = structuredClone(complete);
  changedAction[2].input.action = { type: 'focus' };
  assert.throws(() => assertCaptureInput(changedAction[2], scenarios[1]), /action does not match/u);
  const omittedAction = structuredClone(complete);
  delete omittedAction[0].input.action;
  assert.throws(() => assertCaptureInput(omittedAction[0], scenarios[0]), /explicit props and action/u);
  assert.throws(() => assertFiniteInventory({ scenarios: [...scenarios, scenarios[0]], results: complete }), /duplicate scenario/u);
  assert.throws(() => assertFiniteInventory({ scenarios: [], results: [] }), /at least one scenario/u);
  assert.throws(() => assertFiniteInventory({ scenarios, modes: [], results: [] }), /modes are invalid/u);
});

test('reference bindings reject changed source, tool, fixture, input, font, or browser facts', () => {
  const binding = {
    source: { runtime: 'sha256:runtime', styles: 'sha256:styles' },
    tool: { runner: 'sha256:runner', node: '24.19.0' },
    fixture: { contract: 'sha256:fixture' },
    input: { props: { open: true }, action: { type: 'click' } },
    fonts: { manifest: 'sha256:fonts' },
    browser: { version: 'Chrome 140', osBuild: 'macOS 15', architecture: 'arm64', dpr: 2, viewport: { width: 1000, height: 700 } },
  };
  const requiredPaths = ['source', 'tool', 'fixture', 'input.props', 'input.action', 'fonts', 'browser'];
  assert.doesNotThrow(() => assertReferenceBinding(binding, structuredClone(binding), { requiredPaths }));
  for (const key of ['source', 'tool', 'fixture', 'fonts', 'browser']) {
    const stale = structuredClone(binding);
    stale[key].manifest = 'sha256:stale';
    stale[key].runtime = 'sha256:stale';
    stale[key].version = 'stale';
    assert.throws(() => assertReferenceBinding(binding, stale, { requiredPaths }), /stale/u, key);
  }
  const staleProps = structuredClone(binding);
  staleProps.input.props.open = false;
  assert.throws(() => assertReferenceBinding(binding, staleProps, { requiredPaths }), /stale/u);
  const staleAction = structuredClone(binding);
  staleAction.input.action.type = 'focus';
  assert.throws(() => assertReferenceBinding(binding, staleAction, { requiredPaths }), /stale/u);
});

test('replay fact comparison is strict about named anatomy, lifecycle null, motion, and raw PNG', () => {
  const reference = replayFacts();
  assert.doesNotThrow(() => assertReplayFactShape(reference));
  assert.deepEqual(compareReplayFacts(reference, structuredClone(reference)), { pass: true, issues: [] });
  assert.doesNotThrow(() => assertReplayFacts(reference, structuredClone(reference)));

  const lifecycleMissing = structuredClone(reference);
  delete lifecycleMissing.lifecycle;
  assert.equal(compareReplayFacts(reference, lifecycleMissing).pass, false);
  assert.throws(() => assertReplayFacts(reference, lifecycleMissing), /lifecycle/u);
  const bothLifecycleMissing = structuredClone(reference);
  delete bothLifecycleMissing.lifecycle;
  const missingReference = structuredClone(reference);
  delete missingReference.lifecycle;
  assert.equal(compareReplayFacts(missingReference, bothLifecycleMissing).pass, false);

  const styleMissing = structuredClone(reference);
  delete styleMissing.styleFacts.selector;
  assert.throws(() => assertReplayFactShape(styleMissing), /styleFacts/u);

  const rawChanged = structuredClone(reference);
  rawChanged.rawPNG.sha256 = `sha256:${'2'.repeat(64)}`;
  assert.equal(compareReplayFacts(reference, rawChanged).pass, false);
  assert.throws(() => assertReplayFacts(reference, rawChanged), /rawPNG/u);
});

test('strict motion replay comparison retains renderer mapping and checks timing/keyframes', () => {
  const reference = replayFacts();
  reference.motion.animations = [{
    target: 'tale-button tale-fade',
    animationName: 'tale-fade',
    transition: 'opacity 120ms ease',
    timing: {
      delay: 0,
      direction: 'normal',
      duration: 120,
      easing: 'ease',
      endDelay: 0,
      fill: 'both',
      iterationStart: 0,
      iterations: 'infinite',
    },
    keyframes: [
      { offset: 0, opacity: '0', easing: 'linear', composite: 'replace' },
      { offset: 1, opacity: '1', easing: 'linear', composite: 'replace' },
    ],
    duration: 120,
    currentTime: 60,
    progress: 0.5,
    playState: 'paused',
  }];
  const mux = structuredClone(reference);
  mux.motion.animations[0].target = 'muxui-button mux-fade';
  mux.motion.animations[0].animationName = 'mux-fade';
  assert.throws(() => assertReplayFacts(reference, mux), /motion/u);

  const changedEasing = structuredClone(mux);
  changedEasing.motion.animations[0].timing.easing = 'linear';
  assert.throws(() => assertReplayFacts(reference, changedEasing), /motion/u);

  const changedKeyframe = structuredClone(mux);
  changedKeyframe.motion.animations[0].keyframes[1].opacity = '0.9';
  assert.throws(() => assertReplayFacts(reference, changedKeyframe), /motion/u);
});

test('finite capture rejects unexpected requests and records source invalidation', () => {
  assert.doesNotThrow(() => assertAllowedRequests([
    'data:text/plain,ok',
    'http://127.0.0.1:4173/app.js',
    'http://localhost:4174/mux-fonts/Inter.ttf',
  ], ['http://127.0.0.1:4173', 'http://localhost:4174']));
  assert.throws(() => assertAllowedRequests(['https://example.com/remote.css'], ['http://127.0.0.1:4173']), /unexpected requests/u);
  assert.doesNotThrow(() => assertMuxOnlySourceBoundary(['export const render = () => null;']));
  assert.doesNotThrow(() => assertMuxOnlySourceBoundary(["export const donorRecord = '@tale-ui/react';"]));
  assert.throws(() => assertMuxOnlySourceBoundary(["import '@tale-ui/react';"]), /Tale or network boundary/u);
  assert.throws(() => assertMuxOnlySourceBoundary(["fetch('https://example.com');"]), /Tale or network boundary/u);
  assert.deepEqual(captureFingerprint({ runtime: 'a' }, { runtime: 'a' }), { stable: true, invalidatedSource: false, differences: [] });
  const changed = captureFingerprint({ runtime: 'a' }, { runtime: 'b' });
  assert.equal(changed.invalidatedSource, true);
  assert.throws(() => assertStableCaptureFingerprint({ runtime: 'a' }, { runtime: 'b' }), /invalidated/u);
});

test('Mux-only runtime boundary walks transitive local imports and rejects Tale or filesystem edges', async () => {
  const root = await mkdtemp('/tmp/muxui-finite-runtime-boundary-');
  try {
    await writeFile(join(root, 'entry.mjs'), "import './nested.mjs';\nexport const record = '@tale-ui/react';\n");
    await writeFile(join(root, 'nested.mjs'), 'export const render = () => null;\n');
    const closure = await assertMuxOnlyRuntimeClosure({ rootDirectory: root, entryPaths: [join(root, 'entry.mjs')] });
    assert.deepEqual(closure.files, ['entry.mjs', 'nested.mjs']);

    await writeFile(join(root, 'nested.mjs'), "import '@tale-ui/react';\n");
    await assert.rejects(assertMuxOnlyRuntimeClosure({ rootDirectory: root, entryPaths: [join(root, 'entry.mjs')] }), /Tale import/u);
    await writeFile(join(root, 'nested.mjs'), "import 'node:fs';\n");
    await assert.rejects(assertMuxOnlyRuntimeClosure({ rootDirectory: root, entryPaths: [join(root, 'entry.mjs')] }), /filesystem import/u);
    await writeFile(join(root, 'nested.mjs'), "const fs = require('fs');\nexport { fs };\n");
    await assert.rejects(assertMuxOnlyRuntimeClosure({ rootDirectory: root, entryPaths: [join(root, 'entry.mjs')] }), /filesystem import/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('finite target selectors cover every requested fixture family and reject unknown families', () => {
  const families = new Set(finiteFixtures.components.map(({ family }) => family === 'Modal' ? 'Dialog' : family));
  for (const family of families) {
    assert.match(targetSelector(family, 'mux'), /^\S+$/u, `${family} Mux selector`);
    if (!noApplicableDonorFamilies.includes(family)) {
      assert.match(targetSelector(family, 'donor'), /^\S+$/u, `${family} donor selector`);
    }
  }
  assert.throws(() => targetSelector('UnknownFiniteFamily', 'mux'), /no target selector/u);
});
