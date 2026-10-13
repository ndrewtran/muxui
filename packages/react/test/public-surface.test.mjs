import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { compileReactSurface } from './support/compile-surface.mjs';
import { consumedHooks, styleRuleClasses } from './support/scan-surface.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

// The catalog inputs read here are listed under `reactTestInputs` in
// tooling/audits/repository-policy/repository-policy.json, so a change to one reruns this file.
// A change to the manifest `exports` plans the full React check, which runs it too.
const button = await readJson(resolve(repositoryRoot, 'catalog/components/button/artifact.json'));
const tokenSource = await readJson(resolve(repositoryRoot, 'catalog/tokens/default-theme.json'));
const manifest = await readJson(resolve(packageRoot, 'package.json'));
const packageExports = Object.keys(manifest.exports);

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

  // The root class is a style-rule selector in the stylesheet the style export resolves to.
  const target = manifest.exports['./styles.css'];
  assert.equal(typeof target, 'string');
  const stylesheet = await readFile(resolve(packageRoot, target), 'utf8');
  assert.ok(styleRuleClasses(stylesheet).has(surface.rootClass.slice(1)), `${surface.rootClass} in ${target}`);
});

test('the Button surface refuses a missing style export, a missing binding, and a non-component identity', () => {
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

test('the Button surface root class is found only in style-rule selectors', () => {
  const found = (css) => styleRuleClasses(css).has('muxui-button');
  assert.equal(found('.muxui-button { color: red; }'), true);
  assert.equal(found('.a, .muxui-button:focus-visible { color: red; }'), true);
  assert.equal(found('@media (min-width: 1px) { .muxui-button[data-x] { color: red; } }'), true);
  assert.equal(found('@layer base { .parent { .muxui-button { color: red; } } }'), true);

  assert.equal(found('/* .muxui-button { color: red; } */ .other { color: red; }'), false);
  assert.equal(found('.other::before { content: " .muxui-button {"; }'), false);
  assert.equal(found(".other[title='.muxui-button'] { color: red; }"), false);
  assert.equal(found('.muxui-button-group > .muxui-button__label { color: red; }'), false);
  assert.equal(found('.other:not(.muxui-button) { color: red; }'), false);
  assert.equal(found('@scope (.muxui-button) { .other { color: red; } }'), false);
  assert.equal(found('.other { --muxui-button: 1; } /* .muxui-button */'), false);
});

test('the Button example scanner reports every form of consumed topology', () => {
  const classes = (source) => consumedHooks(source).classes;
  assert.deepEqual(classes('<Button className="muxui-button wide" />'), ['muxui-button', 'wide']);
  assert.deepEqual(classes("<Button className={'muxui-button'} />"), ['muxui-button']);
  assert.deepEqual(classes('<div class="a b" />'), ['a', 'b']);
  assert.deepEqual(classes("<Button {...{ className: 'muxui-button-content' }} />"), ['muxui-button-content']);
  assert.deepEqual(classes('const props = { "className": `a b` };'), ['a', 'b']);
  assert.deepEqual(classes("const props = { 'class': 'a' };"), ['a']);
  assert.deepEqual(classes('node.className = "a";'), ['a']);
  // An expression it cannot resolve is kept whole, so it never matches a known class.
  assert.deepEqual(classes('<Button className={cx(a, { b })} />'), ['{cx(a, { b })}']);
  assert.deepEqual(classes('<Button {...{ className: styles.root }} />'), ['styles.root']);
  assert.deepEqual(classes('<Button className={`muxui-${name}`} />'), ['{`muxui-${name}`}']);
  assert.deepEqual(classes('if (className === "a") {}'), []);

  const selectors = (source) => consumedHooks(source).selectors;
  assert.deepEqual(selectors("root.querySelector('.a')"), ["'.a'"]);
  assert.deepEqual(selectors('root.querySelectorAll(`.muxui-${slot}`)'), ['`.muxui-${slot}`']);
  assert.deepEqual(selectors('root?.querySelector (selector)'), ['selector']);
  assert.deepEqual(selectors("document.querySelector('.a' + suffix)"), ["'.a' + suffix"]);

  assert.deepEqual(consumedHooks('<Button data-muxui-slot="label" data-muxui-state-pending />').attributes, [
    'data-muxui-slot', 'data-muxui-state-pending',
  ]);
});

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
