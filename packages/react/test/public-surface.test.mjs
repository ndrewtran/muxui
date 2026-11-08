import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { styleRuleClasses, topLevelConstructs } from './support/scan-surface.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

// The catalog inputs read here are listed under `reactTestInputs` in
// tooling/audits/repository-policy/repository-policy.json, so a change to one reruns this file.
// A change to the manifest `exports` plans the full React check, which runs it too.
const tokenSource = await readJson(resolve(repositoryRoot, 'catalog/tokens/default-theme.json'));
const manifest = await readJson(resolve(packageRoot, 'package.json'));
const generatedStyles = Object.fromEntries(await Promise.all(
  ['styles.css', 'themes.css', 'themes-apca.css'].map(async (name) => [name, await readFile(resolve(packageRoot, 'generated', name), 'utf8')]),
));

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
  const cascadeLayers = ['muxui.tokens', 'muxui.components', 'muxui.utilities'];
  const orderStatement = `@layer ${cascadeLayers.join(', ')}`;
  const entries = Object.entries(manifest.exports).filter(([name]) => name.endsWith('.css'));
  assert.deepEqual(entries.map(([name]) => name), ['./styles.css', './themes.css', './themes-apca.css']);
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
  assert.deepEqual(layersIn('themes-apca.css'), ['@layer muxui.tokens']);
});

// An instance-policy token is a promise that setting it on a rendered instance restyles it (Decision 0031
// item 15). No token has that policy today; this keeps one from returning as a hook no rule reads. The
// computed-style proof for a future instance hook belongs with the item 19 public-property test.
test('every instance-policy token is read through var() in the shipped stylesheet', () => {
  for (const [id, definition] of Object.entries(tokenSource.tokens)) {
    if (definition.overridePolicy !== 'instance') continue;
    const hook = `--muxui-${id.replaceAll('.', '-')}`;
    const reader = new RegExp(`var\\(\\s*${hook}\\s*[,)]`, 'u');
    assert.match(generatedStyles['styles.css'], reader, `${id} has the instance policy but no rule reads ${hook}`);
  }
});

test('the class scanner finds classes only in style-rule selectors', () => {
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
