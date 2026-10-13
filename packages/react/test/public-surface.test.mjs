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
  // A nested rule whose selector has a pseudo-class is a rule, not a declaration.
  assert.equal(found('.a { &:hover { color: red; } .muxui-button:hover { color: red; } }'), true);

  assert.equal(found('/* .muxui-button { color: red; } */ .other { color: red; }'), false);
  assert.equal(found('.other::before { content: " .muxui-button {"; }'), false);
  assert.equal(found(".other[title='.muxui-button'] { color: red; }"), false);
  assert.equal(found('.muxui-button-group > .muxui-button__label { color: red; }'), false);
  assert.equal(found('.other:not(.muxui-button) { color: red; }'), false);
  assert.equal(found('@scope (.muxui-button) { .other { color: red; } }'), false);
  assert.equal(found('.other { --muxui-button: 1; } /* .muxui-button */'), false);

  // The `{}` block of a custom property value is a value, so rules written inside it are not rules.
  assert.equal(found('.other { --payload: { .muxui-button { color: red; } }; }'), false);
  assert.equal(found('.other { --payload:{.muxui-button{color:red}} }'), false);
  assert.equal(found('.other { --a: x { .muxui-button { color: red; } } y; --b: 1; }'), false);
  assert.equal(found('.other { --p: { content: "}"; /* } */ .muxui-button { color: red; } }; }'), false);
  // The skip ends at the matching brace, so a rule after the value block still counts.
  assert.equal(found('.other { --payload: { .hidden { color: red; } }; .muxui-button { color: red; } }'), true);
  assert.equal(found('.other { --payload: { .hidden { color: red; } } } .muxui-button { color: red; }'), true);
});

test('the Button example scanner reports every form of consumed topology', () => {
  const classes = (source) => consumedHooks(source).classes;
  // Only a value that is exactly one plain string literal contributes its words.
  assert.deepEqual(classes('<Button className="muxui-button wide" />'), ['muxui-button', 'wide']);
  assert.deepEqual(classes("<Button className={'muxui-button'} />"), ['muxui-button']);
  assert.deepEqual(classes('<div class="a b" id="x" />'), ['a', 'b']);
  assert.deepEqual(classes('<Button className="a"/>'), ['a']);
  assert.deepEqual(classes("<Button {...{ className: 'muxui-button-content' }} />"), ['muxui-button-content']);
  assert.deepEqual(classes("<Button {...{ className: 'a', id: 'x' }} />"), ['a']);
  assert.deepEqual(classes('const props = { "className": `a b` };'), ['a', 'b']);
  assert.deepEqual(classes("const props = { 'class': 'a' };"), ['a']);
  assert.deepEqual(classes('node.className = "a";'), ['a']);
  assert.deepEqual(classes('if (className === "a") {}'), []);
  // Any other expression is reported whole, in braces, so it can never equal a class name.
  assert.deepEqual(classes("<Button {...{ className: 'muxui-button' + '-content' }} />"), ["{'muxui-button' + '-content'}"]);
  assert.deepEqual(classes("<Button className={'muxui-button' + suffix} />"), ["{'muxui-button' + suffix}"]);
  assert.deepEqual(classes("const props = { className: 'muxui-button' || fallback };"), ["{'muxui-button' || fallback}"]);
  assert.deepEqual(classes("const props = { className: ['muxui-button'].join(' '), id: 'x' };"), ["{['muxui-button'].join(' ')}"]);
  assert.deepEqual(classes("const props = { className: 'muxui-button'.trim() };"), ["{'muxui-button'.trim()}"]);
  assert.deepEqual(classes("const props = { className: on ? 'muxui-button' : 'other' };"), ["{on ? 'muxui-button' : 'other'}"]);
  assert.deepEqual(classes('const props = { className: `muxui-${name}` };'), ['{`muxui-${name}`}']);
  assert.deepEqual(classes('<Button className={`muxui-${name}`} />'), ['{`muxui-${name}`}']);
  assert.deepEqual(classes('<Button className={cx(a, { b })} />'), ['{cx(a, { b })}']);
  assert.deepEqual(classes('const props = { className: styles.root };'), ['{styles.root}']);
  assert.deepEqual(classes('const props = { className: muxui-button };'), ['{muxui-button}']);
  assert.deepEqual(classes('node.className = base + " wide";'), ['{base + " wide"}']);

  const selectors = (source) => consumedHooks(source).selectors;
  assert.deepEqual(selectors("root.querySelector('.a')"), ["'.a'"]);
  assert.deepEqual(selectors('root.querySelectorAll(`.muxui-${slot}`)'), ['`.muxui-${slot}`']);
  assert.deepEqual(selectors('root?.querySelector (selector)'), ['selector']);
  assert.deepEqual(selectors("document.querySelector('.a' + suffix)"), ["'.a' + suffix"]);
  // An optional call is a call.
  assert.deepEqual(selectors("document.querySelector?.('.muxui-button-content')"), ["'.muxui-button-content'"]);
  assert.deepEqual(selectors('root?.querySelectorAll?.(selector)'), ['selector']);
  assert.deepEqual(selectors('root.querySelector ?. (`.${slot}`)'), ['`.${slot}`']);
  // So is the name without a plain call.
  assert.deepEqual(selectors("document.querySelector.call(document, '.a')"), ['querySelector']);
  assert.deepEqual(selectors("const find = root['querySelectorAll'];"), ['querySelectorAll']);
  assert.deepEqual(selectors('const find = document.querySelector;'), ['querySelector']);
  assert.deepEqual(selectors('const x = myquerySelector + querySelectors;'), []);

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
