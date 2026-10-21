import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { barrelDeclarations } from './support/declaration-surface.mjs';

const packageRoot = resolve(import.meta.dirname, '..');

// A TypeScript move re-emits each public type, and the emit follows what the source declares. An
// interface is open to consumers' module augmentation and a type alias is not, and a type alias is
// assignable to an index signature where an interface is not, so a name that changes kind changes
// the public API. The record is the kinds the barrel had before the moves, read from git history.
const record = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/public-declaration-kinds.json'), 'utf8'));
const kindsOf = (declarations) => Object.fromEntries(Object.entries(barrelDeclarations(resolve(packageRoot, 'generated', declarations))).map(([name, { kind }]) => [name, kind]));

// Each side is its entry's own declarations: generated/index.d.ts for the barrel, generated/<slug>.d.ts for a subpath module.
function assertKindsHold(recorded, current) {
  assert.deepEqual(
    Object.entries(recorded).filter(([name, kind]) => name in current && current[name] !== kind).map(([name, kind]) => `${name}: ${kind} -> ${current[name]}`),
    [],
  );
  // The record still names real exports; a rename is a decision to make in the record.
  assert.deepEqual(Object.keys(recorded).filter((name) => !(name in current)), []);
}

test('every name the package barrel exported before the TypeScript moves keeps its declaration kind', () => {
  assertKindsHold(record.kinds, kindsOf('index.d.ts'));
});

// A subpath module (E4) is a root-barrel-free entry, so the barrel check never reads it.
for (const [slug, recorded] of Object.entries(record.subpathKinds)) {
  test(`every name the @muxui/react/${slug} subpath exported before the TypeScript moves keeps its declaration kind`, () => {
    assertKindsHold(recorded, kindsOf(`${slug}.d.ts`));
  });
}
