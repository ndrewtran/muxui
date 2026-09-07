import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entryPaths = [
  resolve(appRoot, 'visual-migration/bootstrap/r1-6-mux-entry.mjs'),
  resolve(appRoot, 'visual-migration/bootstrap/r1-6-donor-entry.mjs'),
];
const runnerPath = resolve(appRoot, 'test/run-r1-6-finite-paired.mjs');
const entrySources = await Promise.all(entryPaths.map((path) => readFile(path, 'utf8')));
const runnerSource = await readFile(runnerPath, 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}()`);
  assert.notEqual(start, -1, `${name} must remain a named entry helper`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`could not extract ${name}`);
}

function runMotionBinding(source, initialMatches) {
  let media;
  let changeListener;
  const calls = [];
  const context = {
    window: {
      matchMedia(query) {
        assert.equal(query, '(prefers-reduced-motion: reduce)');
        media = {
          matches: initialMatches,
          addEventListener(type, listener) {
            assert.equal(type, 'change');
            changeListener = listener;
          },
        };
        return media;
      },
    },
    document: {
      documentElement: {
        toggleAttribute(name, force) {
          calls.push([name, force]);
        },
      },
    },
  };
  const helper = vm.runInNewContext(
    `${extractFunction(source, 'bindReducedMotionPreference')}; bindReducedMotionPreference`,
    context,
  );
  helper();
  return {
    calls,
    setMatches(value) {
      media.matches = value;
      changeListener();
    },
  };
}

test('R1.6 Mux and donor entries mirror the live reduced-motion preference', () => {
  for (const source of entrySources) {
    const helperSource = extractFunction(source, 'bindReducedMotionPreference');
    assert.match(helperSource, /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)/u);
    assert.match(helperSource, /toggleAttribute\('data-reduced-motion', preference\.matches\)/u);
    assert.doesNotMatch(helperSource, /data-(?:entering|opening|exiting|closing|open)/u);
    assert.doesNotMatch(source, /dataset\.reducedMotion\s*=\s*['"]true['"]/u);
    assert.ok(source.indexOf('bindReducedMotionPreference();') < source.indexOf('createRoot(root).render('), 'motion preference must be applied before render');

    const reduced = runMotionBinding(source, true);
    assert.deepEqual(reduced.calls, [['data-reduced-motion', true]]);
    reduced.setMatches(false);
    assert.deepEqual(reduced.calls.at(-1), ['data-reduced-motion', false]);

    const unrestricted = runMotionBinding(source, false);
    assert.deepEqual(unrestricted.calls, [['data-reduced-motion', false]]);
    unrestricted.setMatches(true);
    assert.deepEqual(unrestricted.calls.at(-1), ['data-reduced-motion', true]);
  }
});

test('R1.6 capture cases enable real lifecycle motion but reduce ordinary captures', () => {
  const states = runnerSource.match(/const motionStates = new Set\(\[([\s\S]*?)\]\);/u)?.[1].match(/'([^']+)'/gu)?.map((state) => state.slice(1, -1));
  assert.ok(states, 'finite runner must declare its motion-state contract');
  assert.ok(states.includes('opening'));
  assert.ok(states.includes('closing'));
  assert.ok(!states.includes('idle'));
  assert.match(runnerSource, /page\.emulateMedia\(\{ reducedMotion: preserveMotion \? 'no-preference' : 'reduce' \}\)/u);
  assert.match(runnerSource, /const preserveMotion = motionStates\.has\(String\(scenario\.state\)\.toLowerCase\(\)\)/u);

  for (const source of entrySources) {
    for (const state of ['opening', 'closing']) {
      const initialMatches = !states.includes(state);
      const binding = runMotionBinding(source, initialMatches);
      assert.equal(binding.calls[0][1], initialMatches, `${state} must preserve no-preference for real lifecycle markers`);
    }
    for (const state of ['idle', 'filled', 'selected']) {
      assert.equal(states.includes(state), false, `${state} is an ordinary reduced-motion capture state`);
      const initialMatches = !states.includes(state);
      const binding = runMotionBinding(source, initialMatches);
      assert.equal(binding.calls[0][1], initialMatches, `${state} must stay reduced for deterministic capture`);
    }
  }
});
