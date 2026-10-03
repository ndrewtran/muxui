/*
 * Test support: synthetic CSS levels for the resolver, and a synthetic
 * Button-shaped family (catalog record, React types, anatomy, measurement)
 * so spec and applier tests run without a browser.
 */
import { resolveProperty } from '../src/css.mjs';
import { partLonghands } from '../src/anatomy.mjs';
import { MODES } from '../src/measure.mjs';

/**
 * Parse flat CSS (`selector { name: value; }` blocks, in cascade order) into
 * one resolver level. As in measurement, every rule but a theme block
 * (`:root` or one `[data-muxui-…='…']` selector) is a component rule.
 */
export function cssLevel(css, { inside = true } = {}) {
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/gu)].map(([, selector, body]) => ({
    rule: selector.trim(),
    component: !/^(?::root|\[data-muxui-[a-z-]+='[a-z0-9-]+'\])$/u.test(selector.trim()),
    declarations: body.split(';').map((part) => part.trim()).filter(Boolean).map((declaration) => {
      const colon = declaration.indexOf(':');
      const value = declaration.slice(colon + 1).trim();
      return { name: declaration.slice(0, colon).trim(), value: value.replace(/\s*!important$/u, ''), important: /!important$/u.test(value) };
    }),
  }));
  return { rules, inside };
}

export const tokens = new Map([
  ['--muxui-semantic-surface-raised', 'semantic.surface.raised'],
  ['--muxui-semantic-surface-strong', 'semantic.surface.strong'],
  ['--muxui-semantic-selection-track', 'semantic.selection.track'],
  ['--muxui-semantic-content-strong', 'semantic.content.strong'],
  ['--muxui-semantic-focus-ring', 'semantic.focus.ring'],
  ['--muxui-semantic-focus-inner', 'semantic.focus.inner'],
  ['--muxui-semantic-control-size-md', 'semantic.control.size-md'],
]);

/** The theme block outside the instance: every synthetic token declared, as the generated theme does. */
export const themeLevel = () => cssLevel(`:root { ${[...tokens.keys()].map((name) => `${name}: #000;`).join(' ')} }`, { inside: false });

/** Resolve `longhand` for levels given as CSS text, element first, above the theme block. */
export function resolveCss(longhand, ...levels) {
  return resolveProperty({ levels: [...levels.map((level) => (typeof level === 'string' ? cssLevel(level) : level)), themeLevel()] }, longhand, tokens);
}

export const catalogRecord = {
  id: 'muxui:component:button',
  bindings: { 'web.react': { api: { props: ['disabled', 'variant'], defaults: { disabled: false, variant: 'primary' } } } },
};
export const reactTypes = [
  "export type Tone = 'primary' | 'ghost';",
  'export interface ButtonProps { children?: React.ReactNode; disabled?: boolean; variant?: Tone; }',
].join('\n');

/** A small Button-shaped anatomy over the synthetic catalog record. */
export function syntheticAnatomy() {
  return {
    family: 'button',
    component: 'Button',
    name: 'Button',
    axes: ['variant'],
    states: ['rest', 'hover', 'focus-visible', 'disabled'],
    stateTarget: '.muxui-button',
    fixture: { children: 'Button' },
    parts: [
      { id: 'root', node: 'FRAME', selector: '.muxui-button', bind: ['fill', 'overlay', 'stroke', 'radius', 'padding', 'size', 'shadow'], layout: { direction: 'HORIZONTAL', align: 'CENTER', justify: 'CENTER', centerInMinHeight: true } },
      { id: 'icon', parent: 'root', node: 'GLYPH', selector: '.muxui-button svg', bind: ['size', 'text'], glyph: () => 'lucide-check' },
      { id: 'label', parent: 'root', node: 'TEXT', selector: '.muxui-button-content', bind: ['text'] },
    ],
    preview: ['variant=primary,state=rest', 'variant=ghost,state=focus-visible'],
    notes: [],
  };
}

const literal = (value, computed = value) => ({ kind: 'literal', value, computed, rule: '.muxui-button' });
const token = (id) => ({ kind: 'token', token: id, rule: '.muxui-button' });

// Default-mode facts per variant; every mode repeats them unless `override` changes one.
function partFacts(variant) {
  const ghost = variant.axes.variant === 'ghost';
  const fill = ghost
    ? (variant.state === 'hover' ? { kind: 'mix', token: 'semantic.surface.strong', percent: 8, rule: '.muxui-button:hover' } : literal('transparent', 'rgba(0, 0, 0, 0)'))
    : token('semantic.selection.track');
  const shadow = variant.state === 'focus-visible'
    ? { kind: 'shadow', rule: '.muxui-button:focus-visible', layers: [
      { inset: false, lengths: ['0', '0', '0', '2px'], color: { kind: 'token', token: 'semantic.focus.inner' } },
      { inset: false, lengths: ['0', '0', '0', '4px'], color: { kind: 'token', token: 'semantic.focus.ring' } },
    ] }
    : ghost ? literal('none') : token('semantic.elevation.control');
  return {
    root: {
      'background-color': fill,
      ...Object.fromEntries(['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((corner) => [`border-${corner}-radius`, token('semantic.control.radius')])),
      'padding-top': { kind: 'expression', value: 'calc(var(--muxui-semantic-control-size-md) / 4)', tokens: ['semantic.control.size-md'], computed: '10px', rule: '.muxui-button' },
      'padding-right': token('component.button.padding-inline'),
      'padding-left': token('component.button.padding-inline'),
      'min-height': token('component.button.min-height'),
      'outline-style': literal('solid'),
      'outline-width': literal('1px'),
      'outline-offset': literal('-1px'),
      'outline-color': literal('transparent', 'rgba(0, 0, 0, 0)'),
      'box-shadow': shadow,
      opacity: variant.state === 'disabled' ? literal('0.45') : { kind: 'none' },
    },
    icon: { color: token('semantic.action.foreground'), width: literal('0.75rem', '12px'), height: literal('0.75rem', '12px') },
    label: {
      color: token(ghost ? 'semantic.content.default' : 'semantic.action.foreground'),
      'font-family': token('semantic.typography.label-font-family'),
      'font-size': token('semantic.typography.label-m-font-size'),
      'font-weight': token('semantic.typography.control-weight'),
      'line-height': literal('1', '16px'),
      'letter-spacing': literal('normal'),
      opacity: variant.state === 'disabled' ? literal('0.45') : { kind: 'none' },
    },
  };
}

/**
 * Measurement document for a resolved synthetic anatomy. `override(variant,
 * part, longhand, mode)` may return a different value for one mode.
 */
export function syntheticMeasurement(resolved, override = () => undefined) {
  const { anatomy, variants } = resolved;
  return {
    family: anatomy.family,
    modes: MODES.map(({ key }) => key),
    glyphs: { 'lucide-check': '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2"><path d="M20 6 9 17l-5-5"></path></svg>' },
    variants: variants.map((variant) => {
      const facts = partFacts(variant);
      const parts = {};
      for (const part of anatomy.parts) {
        const longhands = partLonghands(part);
        const properties = {};
        for (const longhand of longhands) {
          properties[longhand] = Object.fromEntries(MODES.map(({ key }) => [key, override(variant, part.id, longhand, key) ?? facts[part.id][longhand] ?? { kind: 'none' }]));
        }
        parts[part.id] = { properties, ...(part.node === 'TEXT' ? { text: 'Button' } : {}), ...(part.node === 'GLYPH' ? { glyph: 'lucide-check' } : {}) };
      }
      return { key: variant.key, name: variant.name, axes: variant.axes, state: variant.state, parts };
    }),
  };
}
