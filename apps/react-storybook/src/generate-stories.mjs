import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generatedText, loadPolicy } from '../../../tooling/audits/repository-policy/src/policy.mjs';
import { patternVariantExamples } from '../../../tooling/audits/repository-policy/src/pattern-variants.mjs';
import { storyNameFromExport, toId } from 'storybook/internal/csf';
import { transformWithOxc } from 'vite';
import { adapterNames } from './storybook-factory.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const descriptorPath = resolve(repositoryRoot, 'packages/react/generated/descriptor.json');
const snapshotPath = resolve(repositoryRoot, 'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json');
const generatedRoot = resolve(process.env.MUXUI_STORYBOOK_GENERATED_ROOT ?? resolve(import.meta.dirname, '../.storybook/generated'));
const checkOnly = process.argv.includes('--check');

const descriptorSource = JSON.parse(await readFile(descriptorPath, 'utf8'));
const descriptor = descriptorSource;
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const policy = await loadPolicy(repositoryRoot);
const generatedSource = 'apps/react-storybook/src/generate-stories.mjs';
const canonicalStoryDefinitions = [
  {
    family: 'IconButton',
    source: 'catalog/components/icon-button/examples/react/basic.tsx',
    importName: 'BasicIconButtonExample',
    exportName: 'SizesAndStates',
    storyName: 'Sizes and states',
    helperName: 'icon-button-basic.example.mjs',
  },
  {
    family: 'Link',
    source: 'catalog/components/link/examples/react/icon-composition.tsx',
    importName: 'LinkIconCompositionExample',
    exportName: 'IconComposition',
    storyName: 'Icon composition',
    helperName: 'link-icon-composition.example.mjs',
  },
  {
    family: 'NumberField',
    source: 'catalog/components/number-field/examples/react/sizing.tsx',
    importName: 'SizingNumberFieldExample',
    exportName: 'Sizing',
    storyName: 'Sizing',
    helperName: 'number-field-sizing.example.mjs',
  },
  {
    family: 'Tabs',
    source: 'catalog/components/tabs/examples/react/variants.tsx',
    importName: 'TabsVariantsExample',
    exportName: 'Variants',
    storyName: 'Tabs variants',
    helperName: 'tabs-variants.example.mjs',
  },
];
const canonicalStoryExamples = new Map(await Promise.all(
  canonicalStoryDefinitions.map(async (definition) => {
    const code = await readFile(resolve(repositoryRoot, definition.source), 'utf8');
    const transformed = await transformWithOxc(code, definition.source, {
      lang: 'tsx',
      jsx: { runtime: 'automatic' },
      sourcemap: false,
    });
    return [definition.family, {
      ...definition,
      code,
      transformedCode: transformed.code.endsWith('\n') ? transformed.code : `${transformed.code}\n`,
    }];
  }),
));

// Blocks (patterns): one page group per pattern, titled
// `Blocks/<Category>/<Pattern>` with one story per variant, so a variant reads
// as `Blocks/<Category>/<Pattern>/<Variant>`. Each variant's canonical source
// is transformed into a helper module and rendered unchanged. The group key is
// the pattern name, the last segment of its title like a family's name.
const patternVariants = await patternVariantExamples(repositoryRoot);
const blockHelperTransforms = await Promise.all(patternVariants.map(async (variant) => {
  const transformed = await transformWithOxc(variant.text, variant.source, {
    lang: 'tsx',
    jsx: { runtime: 'automatic' },
    sourcemap: false,
  });
  return transformed.code.endsWith('\n') ? transformed.code : `${transformed.code}\n`;
}));

const standardStoryDefinitions = [
  { exportName: 'Default', expression: "createStory(record, 'default')" },
  { exportName: 'States', expression: "createStory(record, 'states')" },
  { exportName: 'Controlled', expression: 'createControlledStory(record)' },
  { exportName: 'Uncontrolled', expression: 'createUncontrolledStory(record)' },
  { exportName: 'Events', expression: 'createEventsStory(record)' },
  { exportName: 'Anatomy', expression: 'createAnatomyStory(record)' },
  { exportName: 'BrowserProof', expression: 'createBrowserProofStory(record)' },
];

const familyStoryDefinitions = [
  {
    family: 'Button',
    exportName: 'Matrix',
    name: 'Variant × size',
    source: () => `const buttonMatrix = createButtonMatrixStory(record);
export const Matrix = {
  name: ${stringLiteral('Variant × size')},
  args: buttonMatrix.args,
  argTypes: buttonMatrix.argTypes,
  parameters: buttonMatrix.parameters,
  render: buttonMatrix.render,
};`,
  },
  {
    family: 'Autocomplete',
    exportName: 'DisabledItemsInteraction',
    name: 'Disabled items keyboard navigation',
    source: () => `export const DisabledItemsInteraction = {
  name: ${stringLiteral('Disabled items keyboard navigation')},
  args: {
    label: 'Choose a city',
    items: [
      { id: 'disabled', label: 'Disabled', value: 'disabled', disabled: true },
      { id: 'enabled', label: 'Enabled', value: 'enabled' },
      { id: 'also-disabled', label: 'Also disabled', value: 'also-disabled', disabled: true },
    ],
  },
  render: (args) => createStory(record, 'default').render(args),
};`,
  },
];

function fail(message) {
  throw new Error(`REACT_STORYBOOK_GENERATION_ERROR: ${message}`);
}

function familySlug(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function storyId(record) {
  return `muxui-react-${record.tranche.replaceAll('.', '-').toLowerCase()}-${familySlug(record.family)}`;
}

function stringLiteral(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`;
}

function storyPagesFor(record) {
  const standard = standardStoryDefinitions.map(({ exportName, name, expression }) => ({
    exportName,
    name: name ?? storyNameFromExport(exportName),
    emit: `export const ${exportName} = ${expression};`,
  }));
  const familySpecific = familyStoryDefinitions
    .filter(({ family }) => family === record.family)
    .map(({ exportName, name, source }) => ({ exportName, name, emit: source() }));
  const canonical = canonicalStoryExamples.get(record.family);
  const authored = canonical ? [{
    exportName: canonical.exportName,
    name: canonical.storyName,
    source: canonical.source,
    emit: `export const ${canonical.exportName} = {
  name: ${stringLiteral(canonical.storyName)},
  parameters: {
    docs: {
      source: {
        code: ${JSON.stringify(canonical.code)},
        language: 'tsx',
      },
    },
  },
  render: () => React.createElement(${canonical.importName}),
};`,
  }] : [];
  return [...standard, ...authored, ...familySpecific];
}

const bindings = descriptor.bindings;
if (bindings.length === 0) fail('current MuxUI binding projection is empty');
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
  return { family: binding.export, tranche: family?.tranche ?? binding.tranche ?? 'current', binding };
});

const names = records.map(({ family }) => family);
const missingAdapters = names.filter((name) => !adapterNames.includes(name));
const unknownAdapters = adapterNames.filter((name) => !names.includes(name));
if (missingAdapters.length) fail(`missing explicit adapters: ${missingAdapters.join(', ')}`);
if (unknownAdapters.length) fail(`unknown explicit adapters: ${unknownAdapters.join(', ')}`);

function storyFilename(record) {
  return `${record.tranche.replaceAll('.', '-').toLowerCase()}-${familySlug(record.family)}.stories.mjs`;
}

function storySource(record) {
  const canonicalExample = canonicalStoryExamples.get(record.family);
  const dedicatedImport = record.binding.module === './text-editor'
    ? "\nimport { TextEditor as TextEditorSubpath } from '@muxui/react/text-editor';"
    : record.binding.module === './markdown'
      ? "\nimport { Markdown as MarkdownSubpath } from '@muxui/react/markdown';"
      : '';
  const componentExpression = record.binding.module === './text-editor'
    ? 'TextEditorSubpath'
    : record.binding.module === './markdown'
      ? 'MarkdownSubpath'
      : `MuxUI.${record.family}`;
  return `import * as MuxUI from '@muxui/react';
import {
  argTypesForBinding,
  controlledDefaultPairsForBinding,
  createAnatomyStory,
${record.family === 'Button' ? '  createButtonMatrixStory,\n' : ''}  createBrowserProofStory,
  createControlledStory,
  createEventsStory,
  createStory,
  createUncontrolledStory,
} from '../../src/storybook-factory.mjs';${canonicalExample ? `
import React from 'react';
import { ${canonicalExample.importName} } from './${canonicalExample.helperName}';` : ''}${dedicatedImport}

const binding = ${JSON.stringify(record.binding, null, 2)};
const record = { family: '${record.family}', tranche: '${record.tranche}', binding };

export default {
  title: 'Mux UI React/${record.family}',
  id: '${storyId(record)}',
  component: ${componentExpression},
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
${storyPagesFor(record).map(({ emit }) => emit).join('\n')}${record.family === 'Autocomplete' ? '' : '\n'}`;
}

function categoryLabel(category) {
  if (category === 'faq') return 'FAQ';
  const words = category.replaceAll('-', ' ');
  return `${words[0].toUpperCase()}${words.slice(1)}`;
}

function pascalCase(slug) {
  return slug.split('-').map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join('');
}

// Groups the variants by pattern and fails when a variant cannot become a page.
const blockPages = [];
for (const [index, variant] of patternVariants.entries()) {
  let page = blockPages.find(({ pattern }) => pattern === variant.patternId);
  if (!page) {
    page = {
      pattern: variant.patternId,
      slug: variant.patternSlug,
      family: variant.patternName,
      category: variant.category,
      title: `Blocks/${categoryLabel(variant.category)}/${variant.patternName}`,
      variants: [],
    };
    blockPages.push(page);
  }
  const exportsFound = [...variant.text.matchAll(/^export (?:function|const) ([A-Z]\w*)/gmu)].map(([, name]) => name);
  if (exportsFound.length !== 1) {
    fail(`${variant.source} must export exactly one component to become a Storybook page, found ${exportsFound.length}`);
  }
  const exportName = pascalCase(variant.variantSlug);
  if (page.variants.some((other) => other.exportName === exportName)) {
    fail(`${variant.patternId} has two variants that both emit the story export ${exportName}`);
  }
  page.variants.push({
    ...variant,
    importName: exportsFound[0],
    exportName,
    helperName: `block-${variant.patternSlug}-${variant.variantSlug}.example.mjs`,
    transformedCode: blockHelperTransforms[index],
  });
}
for (const page of blockPages) {
  if (names.includes(page.family)) fail(`pattern ${page.pattern} is named ${page.family}, which is a component family`);
  if (blockPages.some((other) => other !== page && other.family === page.family)) fail(`two patterns are named ${page.family}`);
}

const blockStoryId = (page) => `muxui-block-${page.slug}`;
const blockStoryFilename = (page) => `block-${page.slug}.stories.mjs`;

function blockStorySource(page) {
  return `import React from 'react';
${page.variants.map((variant) => `import { ${variant.importName} } from './${variant.helperName}';`).join('\n')}

export default {
  title: ${stringLiteral(page.title)},
  id: '${blockStoryId(page)}',
  parameters: {
    docs: {
      description: {
        component: ${stringLiteral(`Private development showcase for the ${page.family} block (pattern ${page.pattern}).`)},
      },
    },
  },
};
${page.variants.map((variant) => `export const ${variant.exportName} = {
  name: ${stringLiteral(variant.variantName)},
  parameters: {
    docs: {
      source: {
        code: ${JSON.stringify(variant.text)},
        language: 'tsx',
      },
    },
  },
  render: () => React.createElement(${variant.importName}),
};`).join('\n')}
`;
}

const outputs = new Map(records.map((record) => [
  storyFilename(record),
  generatedText({ source: generatedSource, body: storySource(record), policy }),
]));
for (const canonicalExample of canonicalStoryExamples.values()) {
  outputs.set(canonicalExample.helperName, generatedText({
    source: generatedSource,
    body: canonicalExample.transformedCode,
    policy,
  }));
}
for (const page of blockPages) {
  outputs.set(blockStoryFilename(page), generatedText({ source: generatedSource, body: blockStorySource(page), policy }));
  for (const variant of page.variants) {
    outputs.set(variant.helperName, generatedText({ source: generatedSource, body: variant.transformedCode, policy }));
  }
}
const manifest = {
  schema: 'muxui-react-storybook-manifest-v1',
  generatedFrom: [
    'packages/react/generated/descriptor.json',
    'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json',
    ...canonicalStoryDefinitions.map(({ source }) => source),
    ...(patternVariants.length > 0 ? ['packages/catalog/catalog-sources.json', ...patternVariants.map(({ source }) => source)] : []),
  ],
  count: records.length,
  families: records.map(({ family, tranche, binding }) => ({
    family,
    tranche,
    props: binding.api.props,
    defaults: binding.api.defaults ?? {},
    states: binding.states,
  })),
  // Pattern pages are not component families, so they are listed apart. Their
  // `family` is the pattern name, the key the scoped audits select by.
  patterns: blockPages.map(({ pattern, slug, family, category }) => ({ family, slug, pattern, category })),
  pageIndex: [
    ...records.map((record) => ({
      family: record.family,
      storyFile: `apps/react-storybook/.storybook/generated/${storyFilename(record)}`,
      stories: storyPagesFor(record).map(({ exportName, name, source }) => ({
        exportName,
        id: toId(storyId(record), storyNameFromExport(exportName)),
        name,
        ...(source ? { source } : {}),
      })),
    })),
    ...blockPages.map((page) => ({
      family: page.family,
      storyFile: `apps/react-storybook/.storybook/generated/${blockStoryFilename(page)}`,
      stories: page.variants.map(({ exportName, variantName, source }) => ({
        exportName,
        id: toId(blockStoryId(page), storyNameFromExport(exportName)),
        name: variantName,
        source,
      })),
    })),
  ],
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
    fail('generated story output is missing; run pnpm --filter @muxui/react-storybook generate');
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

const blockHelperCount = blockPages.reduce((count, { variants }) => count + variants.length, 0);
console.log(`React Storybook projection: ${records.length} families, ${outputs.size - canonicalStoryDefinitions.length - blockHelperCount - blockPages.length - 1} stories, ${blockHelperCount} block variants in ${blockPages.length} block pages`);
