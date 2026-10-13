import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { compileReactSurface, hookName } from './support/compile-surface.mjs';
import { consumedHooks, styleRuleClasses, topLevelConstructs } from './support/scan-surface.mjs';

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
// supplemental.css is not exported, but the styling tests read it, so it follows the same layer rules.
const generatedStyles = Object.fromEntries(await Promise.all(
  ['styles.css', 'themes.css', 'supplemental.css'].map(async (name) => [name, await readFile(resolve(packageRoot, 'generated', name), 'utf8')]),
));

test('the Button surface derives from its web.react binding, the token policy, and the package exports', async () => {
  const surface = compileReactSurface({ artifact: button, packageExports, tokenSource });
  assert.equal(surface.bindingRef, 'muxui:component:button#web.react');
  assert.equal(surface.rootClass, '.muxui-button');
  // Decision 0031 item 15 dropped Button's two instance hooks: no rule read them.
  assert.deepEqual(surface.publicCustomProperties, []);
  assert.deepEqual(surface.cascadeLayers, ['muxui.tokens', 'muxui.components', 'muxui.utilities']);
  assert.equal(surface.styleExport, '@muxui/react/styles.css');
  // State attributes, slots, and events are not part of the React surface yet.
  assert.deepEqual(Object.keys(surface).sort(), [
    'artifactRef', 'bindingRef', 'cascadeLayers', 'lifecycle', 'publicCustomProperties', 'rootClass', 'styleExport',
  ]);

  // The root class is a style-rule selector in the stylesheet the style export resolves to.
  const target = manifest.exports['./styles.css'];
  assert.equal(typeof target, 'string');
  const stylesheet = await readFile(resolve(packageRoot, target), 'utf8');
  assert.ok(styleRuleClasses(stylesheet).has(surface.rootClass.slice(1)), `${surface.rootClass} in ${target}`);
});

test('the construct scanner sees unlayered rules and ignores braces in comments and strings', () => {
  const css = `/* } */ @layer a, b;\n@layer a { .x::after { content: "}"; } @media (x) { .y { color: red } } }\n.z { color: red }`;
  assert.deepEqual(topLevelConstructs(css), [
    { kind: 'statement', prelude: '@layer a, b' },
    { kind: 'block', prelude: '@layer a' },
    { kind: 'block', prelude: '.z' },
  ]);
  assert.throws(() => topLevelConstructs('@layer a { .x { color: red }'), /unbalanced opening brace/u);
});

test('every shipped style entry declares the layer order first and holds every rule in a layer', () => {
  const { cascadeLayers } = compileReactSurface({ artifact: button, packageExports, tokenSource });
  const orderStatement = `@layer ${cascadeLayers.join(', ')}`;
  const entries = Object.entries(manifest.exports).filter(([name]) => name.endsWith('.css'));
  assert.deepEqual(entries.map(([name]) => name), ['./styles.css', './themes.css']);
  for (const [name, target] of entries) {
    assert.ok(generatedStyles[target.replace('./generated/', '')], `${name} resolves to a generated file`);
  }
  for (const [file, css] of Object.entries(generatedStyles)) {
    const constructs = topLevelConstructs(css);
    assert.deepEqual(constructs[0], { kind: 'statement', prelude: orderStatement }, `${file} starts with the layer order`);
    // The text after the generated header comment starts with the order statement itself.
    assert.ok(css.replace(/^\/\*[\s\S]*?\*\/\s*/u, '').startsWith(`${orderStatement};`), `${file} has no rule before the order statement`);
    const rest = constructs.slice(1);
    assert.ok(rest.length > 0, `${file} holds at least one layer`);
    for (const construct of rest) {
      assert.equal(construct.kind, 'block', `${file}: ${construct.prelude}`);
      const layer = /^@layer (muxui\.[a-z]+)$/u.exec(construct.prelude)?.[1];
      assert.ok(cascadeLayers.includes(layer), `${file} has a top-level rule outside the Mux UI layers: ${construct.prelude}`);
    }
  }
  const layersIn = (file) => [...new Set(topLevelConstructs(generatedStyles[file]).slice(1).map(({ prelude }) => prelude))];
  assert.deepEqual(layersIn('styles.css'), ['@layer muxui.tokens', '@layer muxui.components']);
  assert.deepEqual(layersIn('themes.css'), ['@layer muxui.tokens']);
  assert.deepEqual(layersIn('supplemental.css'), ['@layer muxui.components']);
});

// An instance-policy token is a promise that setting it on a rendered instance restyles it (Decision 0031
// item 15). No token has that policy today; this keeps one from returning as a hook no rule reads. The
// computed-style proof for a future instance hook belongs with the item 19 public-property test.
test('every instance-policy token is read through var() in the shipped stylesheet', () => {
  for (const [id, definition] of Object.entries(tokenSource.tokens)) {
    if (definition.overridePolicy !== 'instance') continue;
    const reader = new RegExp(`var\\(\\s*${hookName(id)}\\s*[,)]`, 'u');
    assert.match(generatedStyles['styles.css'], reader, `${id} has the instance policy but no rule reads ${hookName(id)}`);
  }
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
