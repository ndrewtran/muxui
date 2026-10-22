// What public-surface-baseline.test.mjs relies on, shown by running it: each kind of check fails on the change
// it exists for (a synthetic baseline and a mutated copy of it go through the same harness), the packages
// resolve as intended, and a compile that cannot be trusted stops the check instead of passing it.
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { consumerTsc, tscDiagnostics, typeScript7Tsc } from './support/declaration-surface.mjs';
import { applyAccepted, comparePublicSurfaces, interpretDiagnostics } from './support/public-surface-probes.mjs';
import { assertResolution, createSnapshots, entrySpecifier } from './support/public-surface-snapshots.mjs';
import { MAX_NESTED_DEPTH, inventoryOf, inventoryProblems, listSubjects } from './support/public-surface-subjects.mjs';

const compilers = [{ label: 'TypeScript 7', tsc: typeScript7Tsc() }, { label: 'TypeScript 6', tsc: consumerTsc() }];

test('an accepted difference absorbs only its own assertion, with the values it states', () => {
  const failure = { subject: 'S', assertion: 'keyof', message: '', old: 'string', new: 'string | number' };
  const entry = { subject: 'S', assertion: 'keyof', old: 'string', new: 'string | number' };
  assert.deepEqual(applyAccepted([failure], [entry]), { unaccepted: [], stale: [] });
  // Anything else on the subject, or a different value, is not absorbed, and the entry then reads as stale.
  for (const other of [{ ...failure, assertion: 'mutual' }, { ...failure, new: 'string | symbol' }, { ...failure, subject: 'T' }]) {
    const result = applyAccepted([other], [entry]);
    assert.deepEqual(result.unaccepted, [other]);
    assert.deepEqual(result.stale, [entry]);
  }
});

test('a compile that rejects nothing, or something the probe did not ask for, is not a pass', () => {
  const probe = { records: [{ subject: 'canary', assertion: 'canary' }, { subject: 'S', assertion: 'mutual' }], firstLine: 10 };
  const canary = "probe.ts(10,21): error TS2344: Type 'false' does not satisfy the constraint 'true'.";
  assert.deepEqual(interpretDiagnostics([canary], probe), []);
  assert.deepEqual(interpretDiagnostics([canary, canary.replace('(10,', '(11,')], probe).map(({ subject }) => subject), ['S']);
  // No diagnostic at all means the probe was not evaluated; so does a diagnostic elsewhere or of another kind.
  assert.throws(() => interpretDiagnostics([], probe), /canary/u);
  for (const stray of [canary.replace('(10,', '(12,'), canary.replace('TS2344', 'TS2322'), canary.replace('probe.ts', 'baseline/generated/index.d.ts'), "probe.ts(11,5): error TS2304: Cannot find name 'X'."]) {
    assert.throws(() => interpretDiagnostics([canary, stray], probe), /unexpected diagnostic/u, stray);
  }
});

// Controls: a synthetic baseline and a mutated copy of it, through the same harness.
const manifestOf = (name, version) => ({ name, version, type: 'module', exports: { '.': { types: './generated/index.d.ts' } } });
const controlPair = (before, after, options = {}) => createSnapshots({
  baseline: { files: before.files ?? { 'index.d.ts': before }, manifest: before.manifest ?? manifestOf('@muxui/react', '0.0.0-control-baseline') },
  current: { files: after.files ?? { 'index.d.ts': after }, manifest: after.manifest ?? manifestOf('@muxui/react', '0.0.0-control-current') },
  ...options,
});
const withPair = (before, after, run, options) => {
  const snapshots = controlPair(before, after, options);
  try {
    return run(snapshots);
  } finally {
    snapshots.dispose();
  }
};
const failuresOf = (comparison, mode) => comparison.runs.map((run) => `${run.label}: ${run[mode].failures.map(({ subject, assertion }) => `${subject.replace(/^\.:\w+:/u, '')} ${assertion}`).sort().join(', ')}`);
const expected = (modeFailures) => compilers.map(({ label }) => `${label}: ${modeFailures.sort().join(', ')}`);

const SHARED = `import type * as React from 'react';
export interface ActivateEvent { readonly type: 'activate' }
export interface StableProps { onClick?: React.MouseEventHandler<HTMLButtonElement>; onValue?: (value: string) => void; label?: string }
export type StableArms = { kind: 'a'; onChange?: (event: { id: string }) => void } | { kind: 'b'; onChange?: { method(event: { id: string }): void }['method'] };
`;
const BEFORE = `${SHARED}
export interface FormProps { onSubmit?: React.FormEventHandler<HTMLFormElement> }
export interface ActivateProps { onActivate?: (event: ActivateEvent) => void }
export interface VariantProps { variant?: 'a' | 'b' }
export interface RecordEvent { readonly id: string }
export interface RecordProps { onRecord?: (event: RecordEvent) => void }
export type SecondProps = { onRequest?: (request: { id: string }, actions: { close(): void }) => void };
export type ArmProps = { kind: 'a'; onChange?: (event: { id: string }) => void } | { kind: 'b'; onChange?: { method(event: { id: string }): void }['method'] };
export type ReadonlyProps = { onChange?: (event: { readonly id: string }) => void };
`;
const AFTER = `${SHARED}
export interface FormProps { onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void }
export interface ActivateProps { onActivate?(event: ActivateEvent): void }
export interface VariantProps { variant?: 'a' | 'b' | undefined }
export type RecordEvent = { readonly id: string };
export interface RecordProps { onRecord?: (event: RecordEvent) => void }
export interface Actions { close(): void }
export type SecondProps = { onRequest?: (request: { id: string }, actions: Actions) => void };
export type ArmProps = { kind: 'a'; onChange?: { method(event: { id: string }): void }['method'] } | { kind: 'b'; onChange?: (event: { id: string }) => void };
export type ReadonlyProps = { onChange?: (event: { id: string }) => void };
`;

test('the pair proof and the callback probes each fail on the change they exist for', () => {
  withPair(BEFORE, AFTER, (snapshots) => {
    const comparison = comparePublicSurfaces(snapshots, compilers);
    // C1 a bivariant React alias restated as a function, C2 a function property turned into a method, C4 an
    // interface turned into a type alias (the record handler), the second parameter of a callback turned from
    // a literal into an interface, the arms of a union exchanging variance, and a callback parameter losing
    // readonly. The stable subjects and the added export Actions fail nothing.
    const everywhere = [
      'FormProps handler:onSubmit', 'ActivateProps handler:onActivate', 'RecordProps handler:onRecord',
      'SecondProps handler:onRequest', 'ArmProps handler:onChange', 'ReadonlyProps handler:onChange',
    ];
    assert.deepEqual(failuresOf(comparison, 'loose'), expected(everywhere));
    // C3 an optional property gaining `| undefined` shows only when exactOptionalPropertyTypes is on: the object
    // is no longer mutually assignable (so its arm has no twin), and both explicit-undefined key sets differ.
    assert.deepEqual(failuresOf(comparison, 'exact'), expected([...everywhere, 'VariantProps arms', 'VariantProps mutual', 'VariantProps explicitUndefined', 'VariantProps explicitUndefinedLiteral']));
  });
});

test('dropping a callable member from the classification fails the cross-check instead of skipping its probe', () => {
  withPair(BEFORE, BEFORE, (snapshots) => {
    const dropActivate = (members) => {
      const classified = members.get('.:type:ActivateProps');
      members.set('.:type:ActivateProps', { ...classified, callable: classified.callable.filter((name) => name !== 'onActivate') });
      return members;
    };
    const comparison = comparePublicSurfaces(snapshots, compilers, { tamper: dropActivate });
    assert.deepEqual(failuresOf(comparison, 'loose'), expected(['ActivateProps callable-members']));
  });
});

test('a member that loses its whole classification fails the key check instead of escaping every probe', () => {
  const event = "export interface Activation { readonly id: string }\n";
  const before = `${event}export interface ActivateProps { onActivate?: (event: Activation) => void }\n`;
  const after = `${event}export interface ActivateProps { onActivate?(event: Activation): void }\n`;
  withPair(before, after, (snapshots) => {
    // Honest classification: the method form is bivariant, so the handler probe fails on it.
    assert.deepEqual(failuresOf(comparePublicSurfaces(snapshots, compilers), 'loose'), expected(['ActivateProps handler:onActivate']));
    // The member dropped from the examined and the callable list alike has no probe left to fail, and no cross-check
    // of the callable list to disagree: only the compiler's own keys of the subject show it was lost.
    const dropBoth = (members) => {
      const classified = members.get('.:type:ActivateProps');
      members.set('.:type:ActivateProps', { ...classified, examined: classified.examined.filter((name) => name !== 'onActivate'), callable: classified.callable.filter((name) => name !== 'onActivate') });
      return members;
    };
    assert.deepEqual(failuresOf(comparePublicSurfaces(snapshots, compilers, { tamper: dropBoth }), 'loose'), expected(['ActivateProps members']));
  });
});

test('arms of a union that overlap but are the same on both sides pass, and the arms that exchange variance still fail', () => {
  // The first two arms of each type are mutually assignable (a function property and its method form; an optional
  // key and the same beside an optional key typed undefined), so each arm has two twins on the other side and only one of them is its own.
  const overlapping = `export type E = { id: string };
export type S = (e: E) => void;
export type B = { m(e: E): void }['m'];
export type Props = { onChange?: S } | { onChange?: B };
export type Keys = { a?: 1 } | { a?: 1; b?: undefined };
`;
  withPair(overlapping, overlapping, (snapshots) => {
    const comparison = comparePublicSurfaces(snapshots, compilers);
    assert.deepEqual(failuresOf(comparison, 'loose'), expected([]));
    assert.deepEqual(failuresOf(comparison, 'exact'), expected([]));
  });
  // Both arms turned into the method form: the function property arm has no twin as it was, though it has twins.
  const bivariant = overlapping.replace('{ onChange?: S } | { onChange?: B }', '{ onChange?: B } | { onChange?: { m(e: E): void }[\'m\'] & {} }');
  withPair(overlapping, bivariant, (snapshots) => {
    assert.deepEqual(failuresOf(comparePublicSurfaces(snapshots, compilers), 'loose'), expected(['Props handler:onChange']));
  });
});

test('a callback with a rest parameter stops the check, because no probe varies the rest element', () => {
  const item = 'export interface Item { id: string }\n';
  // A function property turned into its bivariant method form accepts narrower handlers; no position names a rest element.
  const member = (type) => `${item}export interface ListProps { cb?: ${type} }\n`;
  withPair(member('(...items: Item[]) => void'), member("{ m(...items: Item[]): void }['m']"), (snapshots) => {
    assert.throws(() => comparePublicSurfaces(snapshots, compilers), /ListProps member cb is a callback with a rest parameter/u);
  });
  // An exported callback type is the same: the check names it.
  const callback = (type) => `${item}export type Handler = ${type};\n`;
  withPair(callback('(...items: Item[]) => void'), callback("{ m(...items: Item[]): void }['m']"), (snapshots) => {
    assert.throws(() => comparePublicSurfaces(snapshots, compilers), /Handler is a callback with a rest parameter/u);
  });
});

test('a type, value, component or part missing from the current build is named, and a recorded addition stays recorded', () => {
  const before = `import type * as React from 'react';
export interface Dropped { x?: string }
export declare const Gone: { readonly a: 1 };
export declare const Kept: React.FC<{ label?: string }> & { Part: React.FC<{ part?: string }>; Other: React.FC<{ other?: string }> };
export declare const Panel: React.FC<{ label?: string }>;
`;
  const after = `import type * as React from 'react';
export declare const Kept: React.FC<{ label?: string }> & { Other: React.FC<{ other?: string }> };
`;
  withPair(before, after, (snapshots) => {
    const baseline = listSubjects(snapshots, snapshots.baseline);
    const current = listSubjects(snapshots, snapshots.current);
    const recorded = { baseline: inventoryOf(baseline), added: {} };
    assert.deepEqual(inventoryProblems({ baseline, current, manifest: recorded }).vanished, [
      '.:components:Panel', '.:partValues:Kept.Part', '.:parts:Kept.Part', '.:types:Dropped', '.:values:Gone', '.:values:Panel',
    ]);
    // A subject added since is only reported until it is recorded, and then it may not go away either.
    const grown = [...current, { id: '.:type:Extra', entry: '.', kind: 'type', name: 'Extra' }];
    assert.deepEqual(inventoryProblems({ baseline, current: grown, manifest: recorded }).added, ['.:types:Extra']);
    const withExtra = { ...recorded, added: { '.': { types: ['Extra'] } } };
    assert.deepEqual(inventoryProblems({ baseline, current: grown, manifest: withExtra }).added, []);
    assert.ok(inventoryProblems({ baseline, current, manifest: withExtra }).vanished.includes('.:types:Extra'));
    // A baseline that enumerates differently from its record means the enumerator or the fixture changed.
    assert.equal(inventoryProblems({ baseline: baseline.slice(1), current, manifest: recorded }).drifted.length, 1);
  });
});

test('a part that loses its own statics fails through its value subject, which its props cannot show', () => {
  const part = (component) => `import type * as React from 'react';
export declare const Kept: { Search: React.${component}<{ label?: string } & React.RefAttributes<HTMLDivElement>> };
`;
  // ForwardRefExoticComponent carries displayName, defaultProps and propTypes; ExoticComponent does not, and the
  // props the part takes are the same either way.
  withPair(part('ForwardRefExoticComponent'), part('ExoticComponent'), (snapshots) => {
    const comparison = comparePublicSurfaces(snapshots, compilers);
    for (const mode of ['loose', 'exact']) {
      const failed = comparison.runs.map((run) => run[mode].failures.filter(({ subject }) => subject.includes('Search')).map(({ subject, assertion }) => `${subject} ${assertion}`).sort());
      // propTypes is typed any, so its loss shows in the any members as well as in the keys.
      assert.deepEqual(failed, compilers.map(() => ['.:partValue:Kept.Search any', '.:partValue:Kept.Search explicitUndefined', '.:partValue:Kept.Search explicitUndefinedLiteral', '.:partValue:Kept.Search keyof', '.:partValue:Kept.Search optional']), mode);
    }
    // Nothing about the props of the part differs, so only its value subject shows it.
    assert.ok(!comparison.runs.some((run) => run.loose.failures.some(({ subject }) => subject === '.:part:Kept.Search')));
  });
});

test('a readonly modifier that goes missing from a member fails the pair proof, whether the member is declared here or inherited', () => {
  // Assignability ignores readonly, so mutual assignability passes both.
  const own = (modifier) => `export interface Swatch { ${modifier}primary: string; readonly secondary: string }\n`;
  withPair(own('readonly '), own(''), (snapshots) => {
    const comparison = comparePublicSurfaces(snapshots, compilers);
    assert.deepEqual(failuresOf(comparison, 'loose'), expected(['Swatch readonly']));
    assert.deepEqual(failuresOf(comparison, 'exact'), expected(['Swatch readonly']));
    const [{ loose }] = comparison.runs;
    assert.deepEqual(loose.failures.map(({ old, new: next }) => [old, next]), [['"primary" | "secondary"', '"secondary"']]);
  });
  // An inherited member is the same declaration with the same type, so only its modifier tells the packages apart.
  const inherited = (wrap) => `import type * as React from 'react';\nexport type Div = ${wrap('React.HTMLAttributes<HTMLDivElement>')} & { label?: string };\n`;
  withPair(inherited((type) => type), inherited((type) => `Readonly<${type}>`), (snapshots) => {
    const comparison = comparePublicSurfaces(snapshots, compilers);
    assert.deepEqual(failuresOf(comparison, 'loose'), expected(['Div readonly']));
  });
});

test('a readonly modifier that goes missing from a value or from a static of a part fails the pair proof', () => {
  // Readonly<Record<...>> turned into the Record: its keys stay the same, and assignability ignores readonly.
  const value = (wrap) => `export interface Preset { readonly id: string }\nexport declare const PRESETS_BY_ID: ${wrap('Record<\'a\' | \'b\', Preset>')};\n`;
  withPair(value((type) => `Readonly<${type}>`), value((type) => type), (snapshots) => {
    const comparison = comparePublicSurfaces(snapshots, compilers);
    assert.deepEqual(failuresOf(comparison, 'loose'), expected(['PRESETS_BY_ID readonly']));
    assert.deepEqual(comparison.runs[0].loose.failures.map(({ old, new: next }) => [old, next]), [['"a" | "b"', 'never']]);
  });
  // The custom static of a part: its props are untouched, so only the part value carries it.
  const part = (modifier) => `import type * as React from 'react';
export declare const Panel: { Header: React.FC<{ label?: string }> & { ${modifier}slot: string } };
`;
  withPair(part('readonly '), part(''), (snapshots) => {
    assert.deepEqual(failuresOf(comparePublicSurfaces(snapshots, compilers), 'loose'), expected(['Panel.Header readonly']));
  });
});

test('a member that becomes or stops being any fails, because mutual assignability cannot see it', () => {
  // any is assignable to and from every type, so a member typed any passes against a callback typed (x: never) => any.
  const props = (type) => `export interface Props { cb: ${type} }\n`;
  withPair(props('any'), props('(x: never) => any'), (snapshots) => {
    const comparison = comparePublicSurfaces(snapshots, compilers);
    assert.deepEqual(failuresOf(comparison, 'loose'), expected(['Props any']));
    assert.deepEqual(comparison.runs[0].loose.failures.map(({ old, new: next }) => [old, next]), [['"cb"', 'never']]);
  });
  // The same for an exported type that is any itself, which the mutual proof reads as any being a string.
  const alias = (type) => `export type Handler = ${type};\n`;
  withPair(alias('any'), alias('string'), (snapshots) => {
    assert.deepEqual(failuresOf(comparePublicSurfaces(snapshots, compilers), 'loose'), expected(['Handler mutual']));
  });
});

test('a readonly index signature that loses its modifier fails the pair proof, beside a named member or alone', () => {
  // Assignability ignores readonly on an index signature as on a property, and an index signature is no named member.
  const indexed = (modifier) => `export interface Dictionary { ${modifier}[key: string]: string }
export interface Indexed { ${modifier}[key: number]: string; name: string }
export interface Patterned { ${modifier}[key: \`data-\${string}\`]: string }
`;
  withPair(indexed('readonly '), indexed(''), (snapshots) => {
    const comparison = comparePublicSurfaces(snapshots, compilers);
    assert.deepEqual(failuresOf(comparison, 'loose'), expected(['Dictionary readonly', 'Indexed readonly', 'Patterned readonly']));
    const payloads = Object.fromEntries(comparison.runs[0].loose.failures.map(({ subject, old, new: next }) => [subject.replace(/^\.:\w+:/u, ''), [old, next]]));
    assert.deepEqual(payloads, { Dictionary: ['string', 'never'], Indexed: ['number', 'never'], Patterned: ['`data-${string}`', 'never'] });
  });
});

test('a readonly modifier that goes missing from a nested object member fails the pair proof, at any depth up to the bound', () => {
  // A named exported type is its own subject; an anonymous object, optional or not, is read through its member.
  const nested = (modifier) => `export interface Settings { data?: { ${modifier}id: string }; label?: string }
export interface Deep { a: { b: { ${modifier}c: string } } }
`;
  withPair(nested('readonly '), nested(''), (snapshots) => {
    const comparison = comparePublicSurfaces(snapshots, compilers);
    assert.deepEqual(failuresOf(comparison, 'loose'), expected(['Settings readonly:data', 'Deep readonly:a.b']));
    assert.deepEqual(failuresOf(comparison, 'exact'), expected(['Settings readonly:data', 'Deep readonly:a.b']));
    const payloads = Object.fromEntries(comparison.runs[0].loose.failures.map(({ subject, old, new: next }) => [subject.replace(/^\.:\w+:/u, ''), [old, next]]));
    assert.deepEqual(payloads, { Settings: ['"id"', 'never'], Deep: ['"c"', 'never'] });
  });
  // A nested member that becomes any is read the same way.
  const anyMember = (type) => `export interface Options { data: { value: ${type} } }\n`;
  withPair(anyMember('any'), anyMember('(x: never) => any'), (snapshots) => {
    assert.deepEqual(failuresOf(comparePublicSurfaces(snapshots, compilers), 'loose'), expected(['Options any:data']));
  });
});

test('nested objects are followed through own members only, stop at a cycle and at a type both sides share, and fail closed at the depth bound', () => {
  const chain = (levels, modifier) => `export interface Holder { ${'a: { '.repeat(levels)}${modifier}id: string${' }'.repeat(levels)} }\n`;
  // Up to the bound the chain is read; one level more stops the check instead of passing unread.
  withPair(chain(MAX_NESTED_DEPTH, 'readonly '), chain(MAX_NESTED_DEPTH, ''), (snapshots) => {
    assert.deepEqual(failuresOf(comparePublicSurfaces(snapshots, compilers), 'loose'), expected([`Holder readonly:${Array(MAX_NESTED_DEPTH).fill('a').join('.')}`]));
  });
  withPair(chain(MAX_NESTED_DEPTH + 1, 'readonly '), chain(MAX_NESTED_DEPTH + 1, ''), (snapshots) => {
    assert.throws(() => comparePublicSurfaces(snapshots, compilers), new RegExp(`Holder nests object members more than ${MAX_NESTED_DEPTH} levels deep at ${Array(MAX_NESTED_DEPTH + 1).fill('a').join('\\.')}`, 'u'));
  });
  // A type that refers to itself is read once; React's own types are the same on both sides, and a callable or
  // constructable member is no nested object, so none of them is followed.
  const cyclic = (modifier) => `import type * as React from 'react';
interface Node { ${modifier}id: string; next?: Node }
interface Thing { id: string }
export interface Holder { head: Node; style?: React.CSSProperties; view: React.ComponentType<{ id: string }>; ref: React.RefObject<Thing> }
export {};
`;
  const seen = [];
  withPair(cyclic('readonly '), cyclic(''), (snapshots) => {
    const tamper = (members) => {
      seen.push(members.get('.:type:Holder').nested.map(({ path }) => path.join('.')));
      return members;
    };
    assert.deepEqual(failuresOf(comparePublicSurfaces(snapshots, compilers, { tamper }), 'loose'), expected(['Holder readonly:head']));
  });
  // React's `current` is typed by this package's Thing, but it is not an own member, so it is not followed from `ref`.
  assert.deepEqual(seen, [['head', 'ref']]);
});

// Two packages whose declarations import their own name: the self-import is what a wrong layout redirects.
// `Base` differs between them, so a redirected import is a visible type difference.
const packageFiles = (id) => ({
  'index.d.ts': `export * from './more.js';\nexport interface Base { id?: ${id} }\n`,
  'more.d.ts': "import type { Base } from '@muxui/react';\nexport interface More { base?: Base }\n",
});

/** A project importing both entry files, as the probe does, that asserts the current package's `More` holds the current `Base`. */
function projectOfBoth(snapshots) {
  const imports = [snapshots.baseline, snapshots.current].map((snapshot, side) => `import type * as P${side} from '${entrySpecifier(snapshots, snapshot, snapshot.entries[0])}';\nexport type { P${side} };`);
  const mutual = '[A] extends [B] ? ([B] extends [A] ? true : false) : false';
  writeFileSync(join(snapshots.root, 'both.ts'), `${imports.join('\n')}\ntype Mutual<A, B> = ${mutual};\nexport type Own = true extends Mutual<NonNullable<P1.More['base']>, P1.Base> ? true : never;\nexport const own: Own = true;\n`);
  const config = join(snapshots.root, 'tsconfig.both.json');
  writeFileSync(config, `${JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true, types: [] }, files: ['both.ts'] })}\n`);
  return config;
}

test('the two packages resolve their own self-imports and one copy of the React types', () => {
  withPair({ files: packageFiles('string') }, { files: packageFiles('number') }, (snapshots) => {
    for (const { tsc } of compilers) {
      const config = projectOfBoth(snapshots);
      assert.doesNotThrow(() => assertResolution({ tsc, config, snapshots }));
      assert.deepEqual(tscDiagnostics({ tsc, config, directory: snapshots.root }), [], 'the current self-import reaches the current Base');
    }
    // The packages differ in Base alone, and More follows its own package's Base: the pair proof finds exactly that.
    assert.deepEqual(failuresOf(comparePublicSurfaces(snapshots, compilers), 'exact'), expected(['Base arms', 'Base mutual', 'More arms', 'More mutual']));
  });
});

/**
 * A project that reaches each package by its name, as two consumers would (`a` the baseline, `b` the current
 * build), and asserts that the package `b` sees has the current `Base`.
 */
function projectViaPackageNames(snapshots) {
  for (const [side, snapshot] of [['a', snapshots.baseline], ['b', snapshots.current]]) {
    mkdirSync(join(snapshots.root, side, 'node_modules/@muxui'), { recursive: true });
    symlinkSync(snapshot.dir, join(snapshots.root, side, 'node_modules/@muxui/react'), 'junction');
    writeFileSync(join(snapshots.root, side, 'use.ts'), "import type { Base } from '@muxui/react';\nexport type Seen = Base;\n");
  }
  writeFileSync(join(snapshots.root, 'via.ts'), "import type { Seen as A } from './a/use.js';\nimport type { Seen as B } from './b/use.js';\nexport const a: A = { id: 'text' };\nexport const b: B = { id: 1 };\n");
  const config = join(snapshots.root, 'tsconfig.via.json');
  writeFileSync(config, `${JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true, types: [] }, files: ['via.ts'] })}\n`);
  return config;
}

test('packages of the same name and version are merged by TypeScript, and the check refuses to run on them', () => {
  const via = (manifest) => withPair({ files: packageFiles('string'), manifest }, { files: packageFiles('number'), manifest }, (snapshots) => {
    const config = projectViaPackageNames(snapshots);
    return compilers.map(({ tsc }) => tscDiagnostics({ tsc, config, directory: snapshots.root }));
  });
  // Distinct versions keep each package's own Base; the same version makes the second package's Base the first's.
  for (const diagnostics of via(undefined)) assert.deepEqual(diagnostics, []);
  const same = manifestOf('@muxui/react', '0.0.0-control-same');
  for (const diagnostics of via(same)) assert.match(diagnostics.join('\n'), /via\.ts\(4,.*TS2322/u);
  withPair({ files: packageFiles('string'), manifest: same }, { files: packageFiles('number'), manifest: same }, (snapshots) => {
    assert.throws(() => comparePublicSurfaces(snapshots, compilers), /both packages are version 0\.0\.0-control-same/u);
  });
});

test('a baseline renamed away from @muxui/react would resolve its self-imports to the current package, and the check refuses to run', () => {
  const renamed = manifestOf('@muxui/react-baseline', '0.0.0-control-baseline');
  withPair({ files: packageFiles('string'), manifest: renamed }, { files: packageFiles('number') }, (snapshots) => {
    for (const { tsc } of compilers) {
      assert.throws(() => assertResolution({ tsc, config: projectOfBoth(snapshots), snapshots }), /from the baseline package resolves to .*current\/generated\/index\.d\.ts/u);
    }
  }, { linkCurrent: true });
});

test('an import that does not resolve fails the check instead of reading as an any that every pair passes', () => {
  const broken = { ...packageFiles('number'), 'more.d.ts': "import type { Missing } from 'not-installed-anywhere';\nexport interface More { base?: Missing }\n" };
  withPair({ files: packageFiles('string') }, { files: broken }, (snapshots) => {
    for (const { tsc } of compilers) {
      assert.throws(() => assertResolution({ tsc, config: projectOfBoth(snapshots), snapshots }), /not-installed-anywhere is unresolved/u);
    }
    // And the probe's own diagnostics: a declaration the compiler rejects is not an expected rejection.
    assert.throws(() => comparePublicSurfaces(snapshots, compilers), /unresolved|unexpected diagnostic/u);
  });
});

test('a compiler that crashes, is killed, or prints nothing stops the check instead of passing every pair', () => {
  withPair({ files: packageFiles('string') }, { files: packageFiles('number') }, (snapshots) => {
    const compiler = (name, source) => {
      const tsc = join(snapshots.root, name);
      writeFileSync(tsc, source);
      return [{ label: name, tsc }];
    };
    assert.throws(() => comparePublicSurfaces(snapshots, compiler('stderr.mjs', "process.stderr.write('tsc: internal error\\n'); process.exit(1);")), /wrote to stderr: tsc: internal error/u);
    assert.throws(() => comparePublicSurfaces(snapshots, compiler('signal.mjs', "process.kill(process.pid, 'SIGKILL');")), /was stopped by SIGKILL/u);
    assert.throws(() => comparePublicSurfaces(snapshots, compiler('silent.mjs', 'process.exit(0);')), /no resolution of @muxui\/react was traced/u);
  });
});
