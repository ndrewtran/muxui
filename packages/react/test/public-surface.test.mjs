import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { compileReactSurface } from './support/compile-surface.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const button = await readJson(resolve(repositoryRoot, 'catalog/components/button/artifact.json'));
const tokenSource = await readJson(resolve(repositoryRoot, 'catalog/tokens/default-theme.json'));
const packageExports = Object.keys((await readJson(resolve(packageRoot, 'package.json'))).exports);

test('the Button surface derives from its web.react binding, the token policy, and the package exports', async () => {
  const surface = compileReactSurface({ artifact: button, packageExports, tokenSource });
  assert.equal(surface.bindingRef, 'muxui:component:button#web.react');
  assert.equal(surface.rootClass, '.muxui-button');
  // Button's two instance-policy tokens. Stage 1 drops them or makes them real (Decision 0031 item 15).
  assert.deepEqual(surface.publicCustomProperties, [
    '--muxui-component-button-background',
    '--muxui-component-button-foreground',
  ]);
  assert.equal(surface.styleExport, '@muxui/react/styles.css');
  // Layers, state attributes, slots, and events are not part of the React surface yet.
  assert.deepEqual(Object.keys(surface).sort(), [
    'artifactRef', 'bindingRef', 'lifecycle', 'publicCustomProperties', 'rootClass', 'styleExport',
  ]);

  // The root class is a selector in the stylesheet the style export resolves to.
  const stylesheet = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');
  const rootSelector = new RegExp(`(?:^|[\\s,>+~(])\\${surface.rootClass}(?![\\w-])`, 'mu');
  assert.match(stylesheet, rootSelector);
});

test('the surface refuses a missing style export, a missing binding, and a non-component identity', () => {
  assert.throws(
    () => compileReactSurface({ artifact: button, packageExports: [], tokenSource }),
    /MUXUI_REACT_SURFACE_EXPORT_MISSING/,
  );
  assert.throws(
    () => compileReactSurface({ artifact: { ...button, bindings: {} }, packageExports, tokenSource }),
    /MUXUI_REACT_SURFACE_BINDING_MISSING/,
  );
  assert.throws(
    () => compileReactSurface({ artifact: { ...button, id: 'muxui:guide:button' }, packageExports, tokenSource }),
    /MUXUI_REACT_SURFACE_ARTIFACT_INVALID/,
  );
});

function consumedHooks(source) {
  return {
    // A string literal contributes its classes; any expression is kept whole so it fails the topology check.
    classes: [...source.matchAll(/\b(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\{[^}]*\}))/gu)]
      .flatMap((match) => (match[3] ?? match[1] ?? match[2]).split(/\s+/u)).filter(Boolean),
    attributes: [...source.matchAll(/\b(data-muxui-[a-z0-9-]+)(?:\s*=|\b)/gu)].map((match) => match[1]),
    selectors: [...source.matchAll(/querySelector(?:All)?\s*\(\s*["']([^"']+)["']/gu)].map((match) => match[1]),
  };
}

test('the canonical Button React example consumes no undocumented topology', async () => {
  const surface = compileReactSurface({ artifact: button, packageExports, tokenSource });
  const descriptor = await readJson(resolve(repositoryRoot, 'catalog/components/button/examples/react/basic.example.json'));
  const source = await readFile(resolve(repositoryRoot, descriptor.source), 'utf8');
  const hooks = consumedHooks(source);
  assert.equal(descriptor.id, 'muxui:example:button-basic-react');
  assert.equal(descriptor.binding.ref, surface.bindingRef);
  assert.equal(descriptor.source, 'catalog/components/button/examples/react/basic.tsx');
  // The surface publishes the root class and no `data-muxui-*` attribute, so the example uses none.
  assert.ok(hooks.classes.every((name) => name === surface.rootClass.slice(1)), hooks.classes.join(' '));
  assert.deepEqual(hooks.attributes, []);
  assert.deepEqual(hooks.selectors, []);
  assert.ok(!/\b(wrapper|utility|keyframe|nth-child)\b/iu.test(source));
});
