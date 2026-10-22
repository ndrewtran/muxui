// Decision 0031 Part 1 promises no change to the public TypeScript surface of @muxui/react. This holds the
// current declarations against the frozen declarations from before the TypeScript moves
// (test/fixtures/public-surface-baseline), under TypeScript 7 and the pinned TypeScript 6, with
// exactOptionalPropertyTypes off and on: every exported type, `typeof` value, component and static part
// (its props and its own statics), on every entry point of the export map, by the pair proof and the
// callback probes of test/support/public-surface-probes.mjs.
//
// What it does not claim, so the focused family gates (T10b, T11) keep it:
// - nested callbacks inside a callback's parameter objects, and overloads: only the callback's own
//   parameters are varied, and only a type's first signature is probed;
// - generic binders and inference: a generic type is compared at its defaults or constraints;
// - JSX use: props are compared as types, and no element is compiled against them;
// - the statics of a `typeof` value or part value, which are held by the pair proof (mutual assignability, key
//   sets, readonly modifiers) and not probed by name;
// - an `any` member, which has no call signature to probe, and an index-signature type, whose named keys the
//   key check cannot read;
// - a member inherited unchanged: the same declaration, resolved type and readonly modifier on both sides is
//   not examined (React's own attributes are shared by both snapshots).
// A symbol-keyed own member, or a callback with a rest parameter, stops the check instead of passing unprobed.
//
// The declarations are generated, so this test runs whenever one of its generating inputs changes: the sources
// and declarations under packages/react/src, the package manifest and lockfile importer, the catalog mapping
// of supplemental families (via the full React check), and the token source behind ./themes,
// 'catalog/tokens/default-theme.json', which is routed to this test by `reactTestInputs` in repository-policy.json.
//
// A difference that is deliberate goes in test/fixtures/public-surface-accepted.json with its reason.
// public-surface-controls.test.mjs shows each kind of check can fail, and that the packages resolve as intended.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { consumerTsc, typeScript7Tsc } from './support/declaration-surface.mjs';
import { applyAccepted, comparePublicSurfaces } from './support/public-surface-probes.mjs';
import { createSnapshots, loadBaseline, loadCurrent } from './support/public-surface-snapshots.mjs';
import { inventoryOf, inventoryProblems } from './support/public-surface-subjects.mjs';

const fixtures = resolve(import.meta.dirname, 'fixtures');
const readJson = (name) => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));
const { accepted } = readJson('public-surface-accepted.json');
const manifest = readJson('public-surface-inventory.json');
const compilers = [{ label: 'TypeScript 7', tsc: typeScript7Tsc() }, { label: 'TypeScript 6', tsc: consumerTsc() }];
const describeFailure = ({ subject, assertion, message }) => `${subject} ${assertion}: ${message.slice(0, 200)}`;

// The comparison of the real packages, run once for every test that reads it.
let real;
function realComparison() {
  if (real === undefined) {
    const snapshots = createSnapshots({ baseline: loadBaseline(), current: loadCurrent() });
    try {
      real = { result: comparePublicSurfaces(snapshots, compilers) };
    } catch (error) {
      real = { error };
    } finally {
      snapshots.dispose();
    }
  }
  if (real.error) throw real.error;
  return real.result;
}

test('every subject the package exported before the TypeScript moves is still exported, and the record still holds', (t) => {
  const { baseline, current } = realComparison();
  const { drifted, vanished, added } = inventoryProblems({ baseline, current, manifest });
  assert.deepEqual(drifted, [], 'the baseline enumerates as recorded');
  assert.deepEqual(vanished, [], 'no recorded subject has been removed');
  if (added.length > 0) t.diagnostic(`${added.length} subjects are new since the record; add them with node test/support/public-surface-subjects.mjs: ${added.join(', ')}`);
  const counts = Object.fromEntries(Object.entries(inventoryOf(baseline)).map(([entry, lists]) => [entry, Object.fromEntries(Object.entries(lists).map(([list, names]) => [list, names.length]))]));
  t.diagnostic(`baseline subjects ${JSON.stringify(counts)}`);
});

for (const { label } of compilers) {
  for (const mode of ['loose', 'exact']) {
    test(`the current declarations keep the public surface of the baseline under ${label}, exactOptionalPropertyTypes ${mode === 'exact'}`, (t) => {
      const run = realComparison().runs.find((candidate) => candidate.label === label)[mode];
      t.diagnostic(`${run.seconds.toFixed(1)} s`);
      const { unaccepted, stale } = applyAccepted(run.failures, accepted);
      assert.deepEqual(unaccepted.map(describeFailure), [], 'differences from the baseline that are not accepted');
      assert.deepEqual(stale.map(({ subject, assertion }) => `${subject} ${assertion}`), [], 'accepted differences the check no longer finds');
    });
  }
}
