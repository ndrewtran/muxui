import assert from 'node:assert/strict';
import test from 'node:test';
import { assertModeConsistency, modeInconsistencies } from '../src/audit.mjs';
import { resolveProperty } from '../src/css.mjs';
import { MODES } from '../src/measure.mjs';
import { cssLevel, resolveCss, tokens } from './support.mjs';

const root = ':root { --muxui-semantic-surface-raised: #fff; --muxui-control-size-md: var(--muxui-semantic-control-size-md); }';

test('var() chains resolve through local custom properties and fallbacks to the first token', () => {
  const element = `.muxui-x { --muxui-x-bg: var(--muxui-x-missing, var(--muxui-x-alias)); --muxui-x-alias: var(--muxui-semantic-surface-raised); }
    .muxui-x { background: var(--muxui-x-bg); }`;
  const resolved = resolveCss('background-color', element, root);
  assert.equal(resolved.kind, 'token');
  assert.equal(resolved.token, 'semantic.surface.raised');
  assert.equal(resolved.rule, '.muxui-x');
  assert.deepEqual(resolved.via.map(({ property }) => property), ['--muxui-x-bg', '--muxui-x-alias']);
  // The shorthand reset background-image; padding keeps the calc() around the resolved token.
  assert.deepEqual(resolveCss('background-image', element, root), { kind: 'literal', value: 'none', rule: '.muxui-x' });
  const padding = resolveCss('padding-top', '.muxui-x { padding-block: max(0px, calc((var(--muxui-x-size, var(--muxui-control-size-md)) - 1em) / 2)) 0; }', root);
  assert.deepEqual([padding.kind, padding.value, padding.tokens], ['expression', 'max(0px, calc((var(--muxui-semantic-control-size-md) - 1em) / 2))', ['semantic.control.size-md']]);
});

test('the cascade honours order, !important, shorthands, inheritance, and the instance boundary', () => {
  const element = `.muxui-x { border: 1.5px solid var(--muxui-semantic-focus-ring); color: var(--muxui-semantic-surface-raised) !important; }
    .muxui-x[data-hovered] { border-top-color: var(--muxui-semantic-focus-inner); color: var(--muxui-semantic-content-strong); }`;
  assert.equal(resolveCss('border-top-color', element).token, 'semantic.focus.inner');
  assert.equal(resolveCss('border-left-color', element).token, 'semantic.focus.ring');
  assert.equal(resolveCss('border-top-width', element).value, '1.5px');
  assert.equal(resolveCss('color', element).token, 'semantic.surface.raised');
  // Inherited properties read ancestors; others stop at the element; the page is outside.
  const parent = '.muxui-parent { color: var(--muxui-semantic-content-strong); background-color: var(--muxui-semantic-surface-raised); }';
  assert.equal(resolveCss('color', '.muxui-child { display: block; }', parent).token, 'semantic.content.strong');
  assert.deepEqual(resolveCss('background-color', '.muxui-child { display: block; }', parent), { kind: 'none' });
  assert.equal(resolveCss('color', '.muxui-child { color: currentcolor; }', parent).token, 'semantic.content.strong');
  const page = cssLevel('body { color: var(--muxui-semantic-content-strong); }', { inside: false });
  assert.equal(resolveCss('color', '.muxui-child { display: block; }', page).kind, 'outside');
  // Mux UI's own document defaults still resolve outside the instance.
  const library = cssLevel(':where(body) { font-size: var(--muxui-semantic-control-size-md); }', { inside: false });
  library.rules[0].library = true;
  assert.equal(resolveCss('font-size', '.muxui-child { display: block; }', library).token, 'semantic.control.size-md');
});

test('paints resolve to overlays, mixes, and shadow layers', () => {
  const element = `.muxui-x {
    background-image: linear-gradient(color-mix(in srgb, var(--muxui-semantic-surface-strong) 8%, transparent), color-mix(in srgb, var(--muxui-semantic-surface-strong) 8%, transparent));
    background-color: color-mix(in srgb, var(--muxui-semantic-surface-strong) 10%, transparent);
    box-shadow: 0 0 0 2px var(--muxui-semantic-focus-inner), 0 0 0 4px var(--muxui-semantic-focus-ring);
  }`;
  assert.deepEqual(resolveCss('background-image', element).paint, { kind: 'mix', token: 'semantic.surface.strong', percent: 8 });
  assert.deepEqual(resolveCss('background-color', element).percent, 10);
  const shadow = resolveCss('box-shadow', element);
  assert.deepEqual(shadow.layers.map(({ lengths, color }) => [lengths.at(-1), color.token]), [['2px', 'semantic.focus.inner'], ['4px', 'semantic.focus.ring']]);
});

// A dark-mode component rule that overrides a token custom property locally.
function measureModes(css) {
  const byMode = Object.fromEntries(MODES.map((mode) => {
    const scoped = mode.colorScheme === 'dark' ? css.dark : '';
    return [mode.key, resolveCss('background-color', `.muxui-x { background-color: var(--muxui-semantic-surface-raised); } ${scoped}`, root)];
  }));
  return [{ family: 'synthetic', modes: MODES.map(({ key }) => key), variants: [{ key: 'state=rest', parts: { root: { properties: { 'background-color': byMode } } } }] }];
}

test('the mode audit names the family, part, property, and winning rule when a dark override swaps tokens', () => {
  assert.deepEqual(modeInconsistencies(measureModes({ dark: '' })), []);
  const measurements = measureModes({ dark: '@scope dark .muxui-x { --muxui-semantic-surface-raised: var(--muxui-semantic-surface-strong); }' });
  const [finding] = modeInconsistencies(measurements);
  assert.deepEqual([finding.family, finding.part, finding.property], ['synthetic', 'root', 'background-color']);
  assert.match(finding.modes['light+comfortable'], /^semantic\.surface\.raised by \.muxui-x$/u);
  assert.match(finding.modes['dark+compact'], /^semantic\.surface\.strong by \.muxui-x via --muxui-semantic-surface-raised from @scope dark \.muxui-x$/u);
  assert.throws(() => assertModeConsistency(measurements), (error) => /MUXUI_FIGMA_MODE_INCONSISTENT/u.test(error.message)
    && error.message.includes('synthetic root background-color (state=rest)')
    && error.message.includes('@scope dark .muxui-x'));
});

test('an undeclared token paints its var() fallback, as the browser does', () => {
  const element = cssLevel('.muxui-x { background-color: var(--muxui-semantic-surface-raised, var(--muxui-semantic-surface-strong)); color: var(--muxui-semantic-surface-raised); }');
  const theme = cssLevel(':root { --muxui-semantic-surface-strong: #000; }', { inside: false });
  assert.equal(resolveProperty({ levels: [element, theme] }, 'background-color', tokens).token, 'semantic.surface.strong');
  assert.deepEqual(resolveProperty({ levels: [element, theme] }, 'color', tokens), { kind: 'literal', value: 'unset', rule: '.muxui-x' });
  // Declared by the theme, the token itself wins.
  const declared = cssLevel(':root { --muxui-semantic-surface-raised: #fff; --muxui-semantic-surface-strong: #000; }', { inside: false });
  assert.equal(resolveProperty({ levels: [element, declared] }, 'background-color', tokens).token, 'semantic.surface.raised');
});

test('border and outline colours default to the element colour token', () => {
  const element = '.muxui-x { color: var(--muxui-semantic-content-strong); border: 1px solid; outline: 2px solid currentcolor; }';
  const border = resolveCss('border-left-color', element);
  assert.deepEqual([border.kind, border.token, border.rule, border.via[0].property], ['token', 'semantic.content.strong', '.muxui-x', 'color']);
  assert.equal(resolveCss('outline-color', element).token, 'semantic.content.strong');
  assert.equal(resolveCss('border-top-color', '.muxui-x { border-width: 1px; }', '.muxui-parent { color: var(--muxui-semantic-focus-ring); }').token, 'semantic.focus.ring');
  // With no colour anywhere, nothing resolves.
  assert.deepEqual(resolveCss('border-top-color', '.muxui-x { border-width: 1px; }'), { kind: 'none' });
});

test('the mode audit treats an unresolved paint and a token as different', () => {
  const byMode = Object.fromEntries(MODES.map(({ key, colorScheme }) => [key, colorScheme === 'dark' ? { kind: 'none' } : { kind: 'token', token: 'semantic.content.strong', rule: '.muxui-x' }]));
  const [finding] = modeInconsistencies([{ family: 'synthetic', modes: MODES.map(({ key }) => key), variants: [{ key: 'state=rest', parts: { label: { properties: { color: byMode } } } }] }]);
  assert.deepEqual([finding.property, finding.modes['dark+compact']], ['color', '{"kind":"none"} by no declaration']);
});

test('border-radius expands to all four corners, logical corners included', () => {
  const element = '.muxui-x { border-radius: 8px 4px 0; } .muxui-x[data-pressed] { border-end-start-radius: 2px; }';
  assert.deepEqual(['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((corner) => resolveCss(`border-${corner}-radius`, element).value), ['8px', '4px', '0', '2px']);
});
