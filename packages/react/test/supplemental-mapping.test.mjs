import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { readSupplementalMapping, supplementalMappingPath } from '../src/supplemental-mapping.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

async function readFixture(components, schema = 'muxui-react-r1-6-supplemental-components-v2') {
  const root = await mkdtemp(join(tmpdir(), 'muxui-supplemental-mapping-'));
  try {
    await mkdir(dirname(join(root, supplementalMappingPath)), { recursive: true });
    await writeFile(join(root, supplementalMappingPath), JSON.stringify({ schema, tranche: 'R1.6', components }));
    return readSupplementalMapping(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const card = { family: 'Card', slug: 'card', examples: [], export: { module: '.', isolation: 'root' }, runtimeSource: 'a.mjs', styleSource: 'a.css' };

test('supplemental mapping derives catalog owners and the export name from slug and family', async () => {
  const [entry] = await readFixture([card]);
  assert.deepEqual(entry, {
    ...card,
    artifact: 'catalog/components/card/artifact.json',
    binding: 'muxui:component:card#web.react',
    apiOwner: 'catalog/components/card/artifact.json#/bindings/web.react/api',
    stateOwner: 'catalog/components/card/artifact.json#/states',
    anatomyOwner: 'catalog/components/card/artifact.json#/anatomy',
    export: { name: 'Card', module: '.', isolation: 'root' },
  });
});

test('the repository mapping names unique components that each have a catalog artifact', () => {
  const mapping = readSupplementalMapping(repositoryRoot);
  assert.ok(mapping.length > 0);
  assert.equal(new Set(mapping.map(({ slug }) => slug)).size, mapping.length);
  assert.equal(new Set(mapping.map(({ export: componentExport }) => componentExport.name)).size, mapping.length);
  for (const { artifact, slug } of mapping) {
    assert.equal(JSON.parse(readFileSync(resolve(repositoryRoot, artifact), 'utf8')).id, `muxui:component:${slug}`, slug);
  }
});

test('supplemental mapping rejects authored derived fields and stale schemas', async () => {
  await assert.rejects(readFixture([{ ...card, binding: 'muxui:component:card#web.react' }]), /MUXUI_REACT_R16_MAPPING_DERIVED_FIELD_AUTHORED: card/u);
  await assert.rejects(readFixture([{ ...card, export: { ...card.export, name: 'Card' } }]), /MUXUI_REACT_R16_MAPPING_DERIVED_FIELD_AUTHORED: card/u);
  await assert.rejects(readFixture([card], 'muxui-react-r1-6-supplemental-components-v1'), /MUXUI_REACT_R16_MAPPING_SCHEMA_DRIFT/u);
});
