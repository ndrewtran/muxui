// The probe program of the public-surface check. For every subject both snapshots hold (`O` the baseline,
// `N` the current build) it asserts, one assertion a line so a compile diagnostic names its subject:
//   pair proof    mutual assignability, and the key set, required keys, optional keys, readonly keys (of the
//                 examined members, below), keys that accept an explicit `undefined` (read through
//                 `Required<Pick<T, K>>[K]`, and as an object literal) and open or closed index sets
//   handler probes for each callable member that is declared in a snapshot's own files, or differs from
//                 React's, and for each exported callback type: at every parameter position, a narrow, a
//                 wide and a record (`Record<string, unknown>`) handler built from each side, assigned to
//                 the member of each side, must be accepted by both or neither; the same for the exact
//                 handler; and the readonly keys of each parameter object must match
// A union is compared arm by arm: an arm of one side is paired with the arms of the other it is mutually
// assignable with (an arm with none, which `arms` reports, with the whole other side), because an aggregate
// can stay equal while one arm changes its variance.
// An absent diagnostic is a pass, so the program starts with an assertion that must fail (the canary), and
// every other diagnostic is a failure: see `interpretDiagnostics`.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertResolution } from './public-surface-snapshots.mjs';
import { PROJECT_OPTIONS, aliasModule, classifyMembers, commonSubjects, listSubjects } from './public-surface-subjects.mjs';
import { tscDiagnostics } from './declaration-surface.mjs';

const PRELUDE = `
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type Quiet<D> = [keyof D] extends [never] ? never : D;
type Expand<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;
type Clean<X> = [X] extends [never] ? true : Expand<X>;
type Diff<X, Y> = Mutual<X, Y> extends true ? never : { old: X; new: Y };
type Twin<A, B> = B extends unknown ? (Mutual<A, B> extends true ? B : never) : never;
type Pair<A, B> = [Twin<A, B>] extends [never] ? B : Twin<A, B>;
type Member<A, K extends PropertyKey> = A extends unknown ? (K extends keyof A ? A[K] : never) : never;

type Field<T, F extends string, E = never> = T extends unknown ? (
  F extends 'keyof' ? keyof T
  : F extends 'required' ? keyof { [K in keyof T as {} extends Pick<T, K> ? never : K]: 0 }
  : F extends 'optional' ? keyof { [K in keyof T as {} extends Pick<T, K> ? K : never]: 0 }
  : F extends 'undefined' ? keyof { [K in keyof T as {} extends Pick<T, K> ? (undefined extends Required<Pick<T, K>>[K] ? K : never) : never]: 0 }
  : F extends 'literal' ? keyof { [K in keyof T as {} extends Pick<T, K> ? ({ [Q in K]: undefined } extends Pick<T, K> ? K : never) : never]: 0 }
  : F extends 'open' ? (string extends keyof T ? true : false)
  : F extends 'readonly' ? ReadonlyIn<T, E>
  : never) : never;
// An arm is as before when some arm of the other side, one of its mutual twins, has the same field; otherwise
// it is set against all its twins together (or the whole other side when it has none), which names the difference.
type FieldTwin<A, X, F extends string, E> = X extends unknown ? (Mutual<A, X> extends true ? ([Diff<Field<A, F, E>, Field<X, F, E>>] extends [never] ? true : false) : never) : never;
type FieldDiff<O, N, F extends string, E = never> =
  | (O extends unknown ? (true extends FieldTwin<O, N, F, E> ? never : Diff<Field<O, F, E>, Field<Pair<O, N>, F, E>>) : never)
  | (N extends unknown ? (true extends FieldTwin<N, O, F, E> ? never : Diff<Field<Pair<N, O>, F, E>, Field<N, F, E>>) : never);
type Unpaired<O, N> =
  | (O extends unknown ? ([Twin<O, N>] extends [never] ? { old: O } : never) : never)
  | (N extends unknown ? ([Twin<N, O>] extends [never] ? { new: N } : never) : never);

// A member typed any has no call signature to probe, like the enumerator's classification.
type Fn<M> = 0 extends 1 & M ? never : Extract<NonNullable<M>, (...a: never[]) => unknown>;
type Params<F> = F extends (...a: infer P) => unknown ? P : never;
type Ret<F> = F extends (...a: never[]) => infer R ? R : never;
type Pos<F> = Extract<keyof Params<F>, \`\${number}\`>;
type Mut<X, K> = K extends 'narrow' ? X & { __narrow: 1 } : K extends 'wide' ? X | { __wide: 1 } : Record<string, unknown>;
type At<P extends unknown[], I, K> = { [J in keyof P]: J extends I ? Mut<P[J], K> : P[J] };
type Build<F, K, I> = (...a: At<Extract<Params<F>, unknown[]>, I, K>) => Ret<F>;
type Takes<T, H> = [H] extends [T] ? 1 : 0;
type Bits<F, TO, TN, Tag extends string> = {
  [Q in \`\${Tag}:\${'narrow' | 'wide' | 'record'}:\${Pos<F>}\` | \`\${Tag}:exact\`]:
    Q extends \`\${string}:exact\` ? [Takes<TO, F>, Takes<TN, F>]
    : Q extends \`\${string}:\${infer K}:\${infer I}\` ? [Takes<TO, Build<F, K, I>>, Takes<TN, Build<F, K, I>>] : never;
};
type ReadonlyIn<T, E> = T extends object ? ({ [K in keyof T as K extends E ? K : never]-?: Same<{ [Q in K]: T[K] }, { -readonly [Q in K]: T[K] }> extends true ? never : K } extends infer M ? M[keyof M] : never) : never;
type ReadonlyKeys<P> = P extends object ? { [K in keyof P]-?: Same<{ [Q in K]: P[K] }, { -readonly [Q in K]: P[K] }> extends true ? never : K }[keyof P] : never;
type ParamAt<F, I> = I extends keyof Params<F> ? Params<F>[I] : never;
type Writes<FO, FN> = { [Q in \`readonly:\${Pos<FO> | Pos<FN>}\`]: Q extends \`readonly:\${infer I}\` ? [ReadonlyKeys<ParamAt<FO, I>>, ReadonlyKeys<ParamAt<FN, I>>] : never };
type Evidence<MO, MN> = Bits<Fn<MO>, MO, MN, 'old'> & Bits<Fn<MN>, MO, MN, 'new'> & Writes<Fn<MO>, Fn<MN>>;
type Disagree<E> = { [Q in keyof E as E[Q] extends [infer A, infer B] ? (Mutual<A, B> extends true ? never : Q) : never]: E[Q] };
type HandlerTwin<A, X, K extends PropertyKey> = X extends unknown ? (Mutual<A, X> extends true ? ([Quiet<Disagree<Evidence<Member<A, K>, Member<X, K>>>>] extends [never] ? true : false) : never) : never;
type VarianceDiff<O, N, K extends PropertyKey> =
  | (O extends unknown ? (true extends HandlerTwin<O, N, K> ? never : Quiet<Disagree<Evidence<Member<O, K>, Member<Pair<O, N>, K>>>>) : never)
  | (N extends unknown ? (true extends HandlerTwin<N, O, K> ? never : Quiet<Disagree<Evidence<Member<Pair<N, O>, K>, Member<N, K>>>>) : never);
type Keys<T> = T extends unknown ? (string extends keyof T ? never : Extract<keyof T, string>) : never;
type Callable<T, E> = T extends unknown ? { [K in keyof T & E]-?: [Fn<T[K]>] extends [never] ? never : K }[keyof T & E] : never;
`;

const FIELDS = [['keyof', 'keyof'], ['required', 'required'], ['optional', 'optional'], ['undefined', 'explicitUndefined'], ['literal', 'explicitUndefinedLiteral'], ['open', 'open']];
const union = (names) => (names.length === 0 ? 'never' : names.map((name) => JSON.stringify(name)).join(' | '));

/**
 * The probe source for `common` subjects (pairs `{ old, new }`, with `members` from `classifyMembers`),
 * and the record of each assertion line: `[{ subject, assertion }]` in line order.
 */
export function buildProbe(snapshots, common, members) {
  const { lines, names } = aliasModule(snapshots, common);
  const head = [...lines, PRELUDE];
  const records = [{ subject: CANARY, assertion: CANARY }];
  const body = [`type L0 = Assert<Mutual<'canary', 'not the canary'>>;`];
  // A long list of names is written once and shared by the subjects that have it (React's attributes, mostly).
  const lists = new Map();
  const listOf = (text) => {
    if (!lists.has(text)) {
      lists.set(text, `K${lists.size}`);
      head.push(`type K${lists.size - 1} = ${text};`);
    }
    return lists.get(text);
  };
  const assert = (subject, assertion, expression) => {
    records.push({ subject: subject.id, assertion });
    body.push(`type L${records.length - 1} = Assert<${expression}>;`);
  };
  for (const { old } of common) {
    const [O, N] = [names.get(old.id).old, names.get(old.id).new];
    const { shape, selfCallable, examined, callable, inherited } = members.get(old.id);
    assert(old, 'mutual', `Mutual<${O}, ${N}>`);
    if (shape === 'object') {
      assert(old, 'arms', `Clean<Unpaired<${O}, ${N}>>`);
      for (const [field, assertion] of FIELDS) assert(old, assertion, `Clean<FieldDiff<${O}, ${N}, '${field}'>>`);
      // Readonly is read for the members the probe examines: the others are the same declaration with the same readonly modifier.
      if (examined.length > 0) assert(old, 'readonly', `Clean<FieldDiff<${O}, ${N}, 'readonly', ${union(examined)}>>`);
    }
    if (selfCallable) assert(old, 'handler', `Clean<Quiet<Disagree<Evidence<${O}, ${N}>>>>`);
    // The compiler's own keys of the subject are the classification's, so a member cannot lose its probes by losing its entry.
    if (inherited) assert(old, 'members', `Clean<Exclude<Keys<${O}> | Keys<${N}>, ${listOf(union([...examined, ...inherited]))}>>`);
    // The compiler's own view of which examined members are callable must be the classification's.
    if (examined.length > 0) assert(old, 'callable-members', `Mutual<Callable<${O}, ${union(examined)}> | Callable<${N}, ${union(examined)}>, ${union(callable)}>`);
    for (const name of callable) assert(old, `handler:${name}`, `Clean<VarianceDiff<${O}, ${N}, ${JSON.stringify(name)}>>`);
  }
  return { text: `${head.join('\n')}\n${body.join('\n')}\n`, records, firstLine: head.join('\n').split('\n').length + 1 };
}

const PROBE_FILE = 'probe.ts';
const CANARY = 'canary';
const DIAGNOSTIC = /^(.*?)\((\d+),\d+\): error (TS\d+): (.*)$/u;
const REJECTED = /^Type '(.*)' does not satisfy the constraint 'true'\.$/u;
const OLD_NEW = /^\{ old: (.*); new: (.*); \}$/u;

/** A printed type with its whitespace collapsed, so the two compilers' layouts compare equal. */
const tidy = (text) => text.replace(/\s+/gu, ' ').trim();

/**
 * Turns the compiler's diagnostics for the probe into failures `[{ subject, assertion, message, old?, new? }]`.
 * Every diagnostic must be a rejected assertion of the probe: one in any other file or line, or of any other
 * kind, throws, and so does a compile that did not reject the canary, which shows it did not evaluate the probe.
 */
export function interpretDiagnostics(diagnostics, probe) {
  const failures = diagnostics.map((line) => {
    const [, file, row, code, message] = DIAGNOSTIC.exec(line) ?? [];
    const record = probe.records[Number(row) - probe.firstLine];
    if (file !== PROBE_FILE || code !== 'TS2344' || record === undefined || !REJECTED.test(message)) throw new Error(`unexpected diagnostic: ${line}`);
    const payload = REJECTED.exec(message)[1];
    const [, previous, next] = (payload.includes('} | {') ? undefined : OLD_NEW.exec(payload)) ?? [];
    return { subject: record.subject, assertion: record.assertion, message: payload, ...(previous === undefined ? {} : { old: tidy(previous), new: tidy(next) }) };
  });
  if (failures.filter(({ subject }) => subject === CANARY).length !== 1) throw new Error('the compiler did not reject the probe\'s canary assertion, so it did not evaluate the probe');
  return failures.filter(({ subject }) => subject !== CANARY);
}

/**
 * Compiles the probe under `tsc` for both `exactOptionalPropertyTypes` settings, after proving the
 * compiler resolves the two packages as intended; returns `{ [mode]: failures }` with `mode` `exact` or
 * `loose`, and the seconds each compile took.
 */
export function runProbe(snapshots, probe, { tsc }) {
  writeFileSync(join(snapshots.root, PROBE_FILE), probe.text);
  const configs = {};
  for (const [mode, exactOptionalPropertyTypes] of [['loose', false], ['exact', true]]) {
    const config = join(snapshots.root, `tsconfig.${mode}.json`);
    writeFileSync(config, `${JSON.stringify({ compilerOptions: { ...PROJECT_OPTIONS, strict: true, noEmit: true, types: [], exactOptionalPropertyTypes }, files: [PROBE_FILE] })}\n`);
    configs[mode] = config;
  }
  assertResolution({ tsc, config: configs.loose, snapshots });
  const results = {};
  for (const [mode, config] of Object.entries(configs)) {
    const started = performance.now();
    const failures = interpretDiagnostics(tscDiagnostics({ tsc, config, directory: snapshots.root }), probe);
    results[mode] = { failures, seconds: (performance.now() - started) / 1000 };
  }
  return results;
}

/**
 * Sets `failures` against the accepted map (`[{ subject, assertion, old, new, reason }]`): an accepted entry
 * absorbs only the failure of that subject and assertion whose old and new values it states, and nothing
 * else on the subject. Returns what is left: `{ unaccepted, stale }`.
 */
export function applyAccepted(failures, accepted) {
  const used = new Set();
  const unaccepted = failures.filter((failure) => {
    const index = accepted.findIndex((entry) => entry.subject === failure.subject && entry.assertion === failure.assertion && entry.old === failure.old && entry.new === failure.new);
    if (index === -1) return true;
    used.add(index);
    return false;
  });
  return { unaccepted, stale: accepted.filter((_, index) => !used.has(index)) };
}

/**
 * The whole comparison of the two snapshots: both are enumerated, the subjects they share are probed
 * under each of `compilers` (`[{ label, tsc }]`) in both optional-property modes, and the result is
 * `{ baseline, current, runs: [{ label, loose, exact }] }` with each mode `{ failures, seconds }`.
 * `tamper` rewrites the member classification before it is probed, for the control that drops a member.
 */
export function comparePublicSurfaces(snapshots, compilers, { tamper } = {}) {
  const baseline = listSubjects(snapshots, snapshots.baseline);
  const current = listSubjects(snapshots, snapshots.current);
  const common = commonSubjects(baseline, current);
  const members = classifyMembers(snapshots, common);
  const probe = buildProbe(snapshots, common, tamper ? tamper(members) : members);
  return { baseline, current, runs: compilers.map(({ label, tsc }) => ({ label, ...runProbe(snapshots, probe, { tsc }) })) };
}
