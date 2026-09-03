import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generatedText, loadPolicy } from '../../../tooling/audits/repository-policy/src/policy.mjs';
import { transformWithOxc } from 'vite';
import { adapterNames } from './storybook-factory.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const descriptorPath = resolve(repositoryRoot, 'packages/react/generated/descriptor.json');
const snapshotPath = resolve(repositoryRoot, 'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json');
const generatedRoot = resolve(process.env.MUXUI_STORYBOOK_GENERATED_ROOT ?? resolve(import.meta.dirname, '../.storybook/generated'));
const checkOnly = process.argv.includes('--check');

const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const policy = await loadPolicy(repositoryRoot);
const generatedSource = 'apps/react-storybook/src/generate-stories.mjs';
const canonicalExampleSource = 'catalog/components/link/examples/react/icon-composition.tsx';
const canonicalExampleCode = await readFile(resolve(repositoryRoot, canonicalExampleSource), 'utf8');
const transformedExample = await transformWithOxc(canonicalExampleCode, canonicalExampleSource, {
  lang: 'tsx',
  jsx: { runtime: 'automatic' },
  sourcemap: false,
});

function fail(message) {
  throw new Error(`REACT_STORYBOOK_GENERATION_ERROR: ${message}`);
}

function familySlug(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function storyId(record) {
  return `muxui-react-${record.tranche.replaceAll('.', '-').toLowerCase()}-${familySlug(record.family)}`;
}

const bindings = descriptor.bindings;
if (bindings.length !== 53) fail(`expected 53 MuxUI bindings, found ${bindings.length}`);
if (new Set(bindings.map(({ export: name }) => name)).size !== bindings.length) fail('duplicate MuxUI binding export');
if (bindings.some((binding) => binding.runtimeProfile !== 'web.react')) fail('non-web.react binding in React showcase');

// R1.0's pinned snapshot retains its historical field name; current
// descriptors use the Mux UI projection of the same family inventory.
const snapshotFamilies = new Map(snapshot.families.map((family) => [
  family.muxuiPublicFamily ?? family.corePublicFamily,
  family,
]));
const records = bindings.map((binding) => {
  const family = snapshotFamilies.get(binding.export);
  if (!family) fail(`missing canonical tranche for ${binding.export}`);
  return { family: binding.export, tranche: family.tranche, binding };
});

const names = records.map(({ family }) => family);
const missingAdapters = names.filter((name) => !adapterNames.includes(name));
const unknownAdapters = adapterNames.filter((name) => !names.includes(name));
if (missingAdapters.length) fail(`missing explicit adapters: ${missingAdapters.join(', ')}`);
if (unknownAdapters.length) fail(`unknown explicit adapters: ${unknownAdapters.join(', ')}`);

function storySource(record) {
  return `import * as MuxUI from '@muxui/react';
import {
  argTypesForBinding,
  controlledDefaultPairsForBinding,
  createAnatomyStory,
  createBrowserProofStory,
  createControlledStory,
  createEventsStory,
  createStory,
  createUncontrolledStory,
} from '../../src/storybook-factory.mjs';${record.family === 'Link' ? "\nimport React from 'react';\nimport { LinkIconCompositionExample } from './link-icon-composition.example.mjs';" : ''}

const binding = ${JSON.stringify(record.binding, null, 2)};
const record = { family: '${record.family}', tranche: '${record.tranche}', binding };

export default {
  title: 'Mux UI React/${record.tranche}/${record.family}',
  id: '${storyId(record)}',
  component: MuxUI.${record.family},
  tags: ['autodocs'],
  parameters: {
    controls: {
      include: binding.api.props,
    },
    muxuiApi: {
      props: binding.api.props,
      events: binding.api.events,
      parts: binding.api.parts,
      states: binding.states,
      controlled: controlledDefaultPairsForBinding(binding),
    },
    docs: {
      description: {
        component: 'Private development showcase for the Mux UI-owned ${record.family} family.',
      },
    },
  },
  argTypes: argTypesForBinding(binding),
};
export const Default = createStory(record, 'default');
export const States = createStory(record, 'states');
export const Controlled = createControlledStory(record);
export const Uncontrolled = createUncontrolledStory(record);
export const Events = createEventsStory(record);
export const Anatomy = createAnatomyStory(record);
export const BrowserProof = createBrowserProofStory(record);${record.family === 'Link' ? `
export const IconComposition = {
  name: 'Icon composition',
  parameters: {
    docs: {
      source: {
        code: ${JSON.stringify(canonicalExampleCode)},
        language: 'tsx',
      },
    },
  },
  render: () => React.createElement(LinkIconCompositionExample),
};` : ''}${record.family === 'Autocomplete' ? `
export const DisabledItemsInteraction = {
  name: 'Disabled items keyboard navigation',
  args: {
    label: 'Choose a city',
    items: [
      { id: 'disabled', label: 'Disabled', value: 'disabled', disabled: true },
      { id: 'enabled', label: 'Enabled', value: 'enabled' },
      { id: 'also-disabled', label: 'Also disabled', value: 'also-disabled', disabled: true },
    ],
  },
  render: (args) => createStory(record, 'default').render(args),
};` : ''}${record.family === 'Autocomplete' ? '' : '\n'}`;
}

const outputs = new Map(records.map((record) => [
  `${record.tranche.replaceAll('.', '-').toLowerCase()}-${familySlug(record.family)}.stories.mjs`,
  generatedText({ source: generatedSource, body: storySource(record), policy }),
]));
outputs.set('link-icon-composition.example.mjs', generatedText({
  source: generatedSource,
  body: transformedExample.code.endsWith('\n') ? transformedExample.code : `${transformedExample.code}\n`,
  policy,
}));
const manifest = {
  schema: 'muxui-react-storybook-manifest-v1',
  generatedFrom: [
    'packages/react/generated/descriptor.json',
    'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json',
    canonicalExampleSource,
  ],
  count: records.length,
  families: records.map(({ family, tranche, binding }) => ({
    family,
    tranche,
    props: binding.api.props,
    defaults: binding.api.defaults ?? {},
    states: binding.states,
  })),
};
const manifestBody = [
  `export const manifest = Object.freeze(${JSON.stringify(manifest, null, 2)});`,
  'export default manifest;',
  '',
].join('\n');
outputs.set('manifest.mjs', generatedText({
  source: generatedSource,
  body: manifestBody,
  policy,
}));

async function assertGenerated() {
  let entries;
  try {
    entries = await readdir(generatedRoot);
  } catch {
    fail('generated story output is missing; run pnpm generate:stories');
  }
  const expectedNames = new Set(outputs.keys());
  for (const entry of entries) {
    if (!expectedNames.has(entry)) fail(`unexpected generated output ${entry}`);
  }
  for (const [name, expected] of outputs) {
    let actual;
    try {
      actual = await readFile(resolve(generatedRoot, name), 'utf8');
    } catch {
      fail(`missing generated output ${name}`);
    }
    if (actual !== expected) fail(`generated output drift in ${name}`);
  }
}

if (checkOnly) {
  await assertGenerated();
} else {
  await mkdir(generatedRoot, { recursive: true });
  for (const entry of await readdir(generatedRoot)) {
    if (!outputs.has(entry)) await unlink(resolve(generatedRoot, entry));
  }
  for (const [name, content] of outputs) await writeFile(resolve(generatedRoot, name), content, 'utf8');
}

console.log(`React Storybook projection: ${records.length}/53 families, ${records.length} stories`);
