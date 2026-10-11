import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { catalogJson } from '@muxui/catalog/bundle';
import { canonicalJson } from '@muxui/schema';
import { compileTokenGraph, compileWebTheme } from '@muxui/tokens';
import { compileWebSurface } from './compile-surface.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
const bundle = JSON.parse(catalogJson);
const button = bundle.artifacts.find(({ id }) => id === 'muxui:component:button');
const tokenSource = bundle.artifacts.find(({ id }) => id === 'muxui:token:default-theme')?.record;
if (!button || !tokenSource) throw new Error('MUXUI_WEB_GENERATION_INPUT_MISSING');
const packageExports = Object.keys(manifest.exports);
const surfaces = Object.fromEntries(['web.html', 'web.react'].map((bindingId) => [
  bindingId,
  compileWebSurface({ artifact: button, bindingId, packageExports, tokenSource }),
]));
const graph = compileTokenGraph(tokenSource);
const theme = compileWebTheme(tokenSource);
const cssValue = (tokenId) => {
  const token = graph.tokens[tokenId];
  return `${token.value}${token.unit === 'px' ? 'px' : token.unit === 'ms' ? 'ms' : ''}`;
};
const source = 'packages/catalog/catalog-sources.json';
const cssBody = [
  theme.css.trimEnd(),
  '',
  '@layer muxui.tokens, muxui.components, muxui.utilities;',
  '',
  '@layer muxui.components {',
  '  .muxui-button {',
  `    --muxui-component-button-background: ${cssValue('component.button.background')};`,
  `    --muxui-component-button-foreground: ${cssValue('component.button.foreground')};`,
  '    align-items: center;',
  '    background: var(--muxui-component-button-background);',
  `    border: 2px solid ${cssValue('component.button.background')};`,
  `    border-radius: ${cssValue('component.button.radius')};`,
  '    color: var(--muxui-component-button-foreground);',
  '    display: inline-flex;',
  '    font: inherit;',
  '    gap: 0.5em;',
  `    min-block-size: ${cssValue('component.button.min-height')};`,
  `    padding-inline: ${cssValue('component.button.padding-inline')};`,
  '    text-align: start;',
  '  }',
  '  .muxui-button [data-muxui-fixture-direction-marker] { margin-inline: 2px 10px; }',
  '  .muxui-button[data-muxui-state-disabled] { cursor: not-allowed; opacity: 0.55; }',
  '  .muxui-button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }',
  '}',
  '',
  '@media (prefers-contrast: more) {',
  '  @layer muxui.components {',
  '    .muxui-button { border-width: 3px; }',
  '    .muxui-button:focus-visible { outline-width: 3px; outline-offset: 3px; }',
  '  }',
  '}',
  '',
  '@media (forced-colors: active) {',
  '  @layer muxui.components {',
  '    .muxui-button {',
  '      background: ButtonFace;',
  '      border-color: ButtonText;',
  '      color: ButtonText;',
  '      forced-color-adjust: auto;',
  '    }',
  '    .muxui-button[data-muxui-state-disabled] { border-style: dashed; color: GrayText; opacity: 1; }',
  '    .muxui-button:focus-visible { outline-color: Highlight; }',
  '  }',
  '}',
  '',
].join('\n');
const compatibility = {
  schema: 'muxui-renderer-compatibility-v1',
  package: manifest.name,
  version: manifest.version,
  bindingSchemaRange: '^3.0.0',
  tokenContractRange: `^${graph.tokenContractVersion}`,
  sourceRevision: bundle.sourceRevision,
  bindings: Object.fromEntries(Object.entries(surfaces).map(([id, surface]) => [id, {
    ref: surface.bindingRef,
    specRevision: surface.bindingSpecRevision,
    lifecycle: surface.lifecycle,
    surface,
    tokenRequirementSetDigest: button.tokenRequirementSets[`${id}:${id}`].digest,
    platformSafetyRequirementSetDigest: button.platformSafetyRequirementSets[`${id}:${id}`].digest,
  }])),
};
const compatibilityBody = `function deepFreeze(value) {\n  if (value && typeof value === 'object' && !Object.isFrozen(value)) {\n    Object.freeze(value);\n    for (const item of Object.values(value)) deepFreeze(item);\n  }\n  return value;\n}\nexport const webCompatibility = deepFreeze(${canonicalJson(compatibility)});\nexport const webSurfaces = webCompatibility.bindings;\n`;
function bindingTypeName(bindingId) {
  return `Button${bindingId.split('.').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}Binding`;
}
function valueType(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  return 'unknown';
}
const bindingTypeBody = ['web.html', 'web.react'].map((bindingId) => {
  const binding = button.record.bindings[bindingId];
  const props = binding.api.props.map((prop) => (
    `    readonly ${JSON.stringify(prop)}?: ${valueType(binding.api.defaults[prop])};`
  )).join('\n');
  const events = binding.api.events.map((event) => (
    `    readonly ${JSON.stringify(event)}: CustomEvent<void>;`
  )).join('\n');
  return [
    `export interface ${bindingTypeName(bindingId)} {`,
    `  readonly bindingRef: ${JSON.stringify(`${button.id}#${bindingId}`)};`,
    '  readonly props: {', props, '  };',
    '  readonly events: {', events, '  };',
    `  readonly slots: ${binding.api.parts.map((part) => JSON.stringify(part)).join(' | ')};`,
    '}',
  ].join('\n');
}).join('\n\n') + '\n';
function generated(sourcePath, body, comment = '//') {
  if (comment === '/*') {
    const cssDigestBody = ` */\n${body}`;
    const digest = createHash('sha256').update(cssDigestBody).digest('hex');
    return `/* @generated-from: ${sourcePath}\n * @generated-content-sha256: sha256:${digest}\n${cssDigestBody}`;
  }
  const digest = createHash('sha256').update(body).digest('hex');
  return `// @generated-from: ${sourcePath}\n// @generated-content-sha256: sha256:${digest}\n${body}`;
}
const outputs = [
  { path: resolve(packageRoot, 'generated/button.css'), expected: generated(source, cssBody, '/*') },
  { path: resolve(packageRoot, 'generated/bindings.d.ts'), expected: generated(source, bindingTypeBody) },
  { path: resolve(packageRoot, 'generated/compatibility.mjs'), expected: generated(source, compatibilityBody) },
];
for (const output of outputs) {
  if (process.argv.includes('--check')) {
    const actual = await readFile(output.path, 'utf8').catch(() => null);
    if (actual !== output.expected) {
      console.error(`MUXUI_WEB_GENERATED_DRIFT: ${output.path} must be regenerated`);
      process.exitCode = 1;
    }
  } else {
    await mkdir(dirname(output.path), { recursive: true });
    await writeFile(output.path, output.expected);
  }
}
if (!process.exitCode) console.log('[web] generated surface and CSS identity match canonical bindings');
