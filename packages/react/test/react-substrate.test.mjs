import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { reactCompatibility } from '../generated/index.mjs';
import { compatibilityUpstream } from '../src/r1-contracts.mjs';
import { generatedDeclarations } from './support/declarations.mjs';
import { exactLockedProblems, readLockfile } from './support/locked-dependencies.mjs';

const packageRoot = resolve(import.meta.dirname, '..');

test('package has an exact standalone React Aria substrate identity', async () => {
  assert.equal(reactCompatibility.package, '@muxui/react');
  assert.equal(reactCompatibility.upstream.package, 'react-aria-components');
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.private, true);
  // The declared upstream identity is the exact, locked dependency.
  assert.equal(reactCompatibility.upstream.version, manifest.dependencies['react-aria-components']);
  const substrate = { dependencies: { 'react-aria-components': manifest.dependencies['react-aria-components'] } };
  assert.deepEqual(exactLockedProblems(await readLockfile(), 'packages/react', substrate), []);
});

test('the declared upstream follows the pin and keeps the retained commit only for the retained version', async () => {
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  const pin = manifest.dependencies['react-aria-components'];
  const { upstream: retained } = JSON.parse(await readFile(
    resolve(packageRoot, '../../catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json'),
    'utf8',
  ));
  assert.deepEqual(reactCompatibility.upstream, compatibilityUpstream({ pin, retained }));
  assert.match(await readFile(resolve(packageRoot, 'README.md'), 'utf8'), new RegExp(`React Aria Components ${pin.replaceAll('.', '\\.')} is an internal`, 'u'));

  // The generator derives the version; it keeps no dependency version of its own to go stale.
  assert.doesNotMatch(await readFile(resolve(packageRoot, 'src/generate.mjs'), 'utf8'), /React Aria Components \d|react-aria-components['"][^\n]*\d+\.\d+\.\d+/u);

  // An in-memory upgrade declares the new version without the old version's commit.
  const upgraded = pin.replace(/^(\d+)\.(\d+)/u, (_, major, minor) => `${major}.${Number(minor) + 1}`);
  assert.notEqual(upgraded, pin);
  assert.deepEqual(compatibilityUpstream({ pin: upgraded, retained }), { package: 'react-aria-components', version: upgraded });
  assert.equal(compatibilityUpstream({ pin: retained.version, retained }).gitHead, retained.commit);
});

test('direct publication fails closed while the package is private', () => {
  const result = spawnSync(process.execPath, ['src/publish-guard.mjs'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MUXUI_REACT_R15_PUBLISH_FORBIDDEN/u);
});

test('generated public types do not expose substrate APIs', async () => {
  // Every shipped declaration: a module that ships beside the index is a consumer's to read as well.
  const declarations = generatedDeclarations();
  const { 'index.d.ts': types, 'button.d.ts': buttonTypes, 'fields.d.ts': fieldTypes, 'overlays.d.ts': overlayTypes } = declarations;
  for (const [file, text] of Object.entries(declarations)) {
    assert.doesNotMatch(text, /react-aria-components|react-stately|@internationalized\/date|isPending|isDisabled|isSelected|isExpanded|onPress/u, file);
  }
  assert.match(types, /^export type \{ ButtonActivationEvent, ButtonPointerType, ButtonProps \} from '\.\/button\.js';$/mu);
  assert.match(types, /^export \{ Button \} from '\.\/button\.js';$/mu);
  assert.match(buttonTypes, /export (?:interface|type) ButtonProps/u);
  assert.match(types, /^export type \{ DialogProps,[^}]* \} from '\.\/overlays\.js';$/mu);
  assert.match(overlayTypes, /export (?:interface|type) DialogProps/u);
  assert.match(types, /^export type \{ AutocompleteItem,[^}]* \} from '\.\/fields\.js';$/mu);
  assert.match(fieldTypes, /export (?:interface|type) TextFieldProps/u);
  assert.match(types, /^export type \{ MuxUIColorChannel, MuxUIColorSpace, MuxUIColorValue \} from '\.\/color-context\.js';$/mu);
});
