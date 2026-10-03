/*
 * Anatomy contract: one record per family maps rendered DOM parts to Figma
 * nodes. Variant axes come from the catalog record (prop names and defaults)
 * and the React package's generated prop types (finite values), so the
 * anatomy never repeats the catalog's variant list. Validation fails with a
 * diagnostic naming the family and field.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseJsonStrict } from '@muxui/schema';

export const repositoryRoot = resolve(import.meta.dirname, '../../../..');

/** @typedef {'FRAME' | 'TEXT' | 'GLYPH'} NodeKind */
/** @typedef {'fill' | 'overlay' | 'stroke' | 'radius' | 'padding' | 'gap' | 'size' | 'shadow' | 'text' | 'inset'} BindGroup */
/** @typedef {'rest' | 'hover' | 'pressed' | 'focus-visible' | 'disabled' | 'invalid'} StateName */
/**
 * @typedef {{ axes: Record<string, string>, selection?: string, state: StateName }} Variant
 *   `axes` holds catalog prop values; `selection` the anatomy-owned value axis.
 */
/**
 * @typedef {{
 *   direction?: 'HORIZONTAL' | 'VERTICAL',
 *   align?: 'MIN' | 'CENTER' | 'MAX',
 *   justify?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' | ((variant: Variant) => 'MIN' | 'CENTER' | 'MAX'),
 *   centerInMinHeight?: boolean,
 *   placement?: 'bottom-bar' | 'fill',
 *   previewWidth?: number,
 *   expressionTokens?: { itemSpacing: string, from?: string },
 *   paddingFrom?: { part: string, longhand: 'left' | 'top' },
 *   ignore?: Record<string, string>,
 * }} Layout
 *   `centerInMinHeight`: vertical padding is a calc() of the bound min height;
 *   Figma centres content instead. `placement: 'bottom-bar'` positions an
 *   absolute indicator along the parent's bottom edge; `'fill'` stretches an
 *   absolute layer over its parent. `previewWidth` is the fixed Figma width
 *   of a root that fills its container in CSS. `expressionTokens`
 *   binds a Figma field to a token that a measured calc() names.
 *   `paddingFrom` takes horizontal padding from a child's measured inset.
 *   `ignore` maps a Figma field to the reason it is intentionally not set.
 */
/**
 * @typedef {{
 *   id: string,
 *   parent?: string,
 *   node: NodeKind,
 *   selector: string | ((variant: Variant) => string),
 *   pseudo?: 'before' | 'after',
 *   bind: BindGroup[],
 *   layout?: Layout,
 *   glyph?: (variant: Variant) => string,
 *   when?: (variant: Variant) => boolean,
 *   measureFrom?: (variant: Variant) => Record<string, string>,
 * }} Part
 *   `measureFrom` measures named longhands on another element, for example
 *   a label whose visible colour comes from an animated foreground copy.
 */
/**
 * @typedef {{
 *   family: string,
 *   component: string,
 *   name: string,
 *   axes: string[],
 *   selection?: { name: string, values: Record<string, Record<string, unknown>> },
 *   states: StateName[],
 *   stateTarget: string | ((variant: Variant) => string),
 *   fixture: Record<string, unknown>,
 *   parts: Part[],
 *   exclude?: (variant: Variant) => boolean,
 *   preview?: string[],
 *   notes: string[],
 * }} Anatomy
 *   `preview` lists the variant keys the generated Light/Dark/Compact preview
 *   shows, in order.
 */

export const NODE_KINDS = Object.freeze(['FRAME', 'TEXT', 'GLYPH']);
export const BIND_GROUPS = Object.freeze(['fill', 'overlay', 'stroke', 'radius', 'padding', 'gap', 'size', 'shadow', 'text', 'inset']);

/** How each state is produced on the state target: forced pseudo-classes, React Aria data attributes, or props. */
export const STATE_EFFECTS = Object.freeze({
  rest: {},
  hover: { pseudo: ['hover'], attributes: ['data-hovered'] },
  pressed: { pseudo: ['hover', 'active'], attributes: ['data-hovered', 'data-pressed'] },
  'focus-visible': { pseudo: ['focus', 'focus-visible'], attributes: ['data-focused', 'data-focus-visible'] },
  disabled: { props: { disabled: true } },
  invalid: { props: { invalid: true } },
});

/** CSS longhands measured for each bind group. */
export const BIND_LONGHANDS = Object.freeze({
  fill: ['background-color'],
  overlay: ['background-image'],
  stroke: [
    ...['top', 'right', 'bottom', 'left'].flatMap((side) => [`border-${side}-color`, `border-${side}-width`, `border-${side}-style`]),
    'outline-color', 'outline-width', 'outline-style', 'outline-offset',
  ],
  radius: ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  gap: ['column-gap', 'row-gap'],
  size: ['width', 'height', 'min-width', 'min-height', 'box-sizing'],
  shadow: ['box-shadow'],
  text: ['color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'],
  inset: ['left', 'top'],
});

/**
 * Longhands measured for a part: its bind groups plus opacity, which CSS can
 * apply to any part (a disabled field dims its label, for example).
 * @param {Part} part
 */
export function partLonghands(part) {
  return [...new Set([...part.bind.flatMap((group) => BIND_LONGHANDS[group]), 'opacity'])];
}

export class AnatomyError extends Error {
  constructor(family, field, message) {
    super(`MUXUI_FIGMA_ANATOMY_INVALID: ${family}.${field}: ${message}`);
    this.family = family;
    this.field = field;
  }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * Structural validation that needs no catalog: every field has the right
 * type, part IDs are unique slugs, parents precede children, and the root
 * part is a frame.
 * @param {Anatomy} anatomy
 */
export function validateAnatomyShape(anatomy) {
  const family = typeof anatomy?.family === 'string' ? anatomy.family : '?';
  const fail = (field, message) => { throw new AnatomyError(family, field, message); };
  if (!SLUG.test(family)) fail('family', 'must be a catalog slug');
  for (const field of ['component', 'name']) {
    if (typeof anatomy[field] !== 'string' || !anatomy[field]) fail(field, 'must be a non-empty string');
  }
  if (!Array.isArray(anatomy.axes) || anatomy.axes.some((axis) => typeof axis !== 'string')) fail('axes', 'must list catalog prop names');
  if (!Array.isArray(anatomy.states) || anatomy.states.length === 0) fail('states', 'must list at least one state');
  for (const state of anatomy.states) {
    if (!Object.hasOwn(STATE_EFFECTS, state)) fail('states', `${state} is not one of ${Object.keys(STATE_EFFECTS).join(', ')}`);
  }
  if (anatomy.states[0] !== 'rest') fail('states', 'must start with rest');
  if (!['string', 'function'].includes(typeof anatomy.stateTarget)) fail('stateTarget', 'must be a selector or a function of the variant');
  if (!anatomy.fixture || typeof anatomy.fixture !== 'object') fail('fixture', 'must be an object of fixture props');
  if (anatomy.selection !== undefined) {
    const { name, values } = anatomy.selection;
    if (typeof name !== 'string' || !values || Object.keys(values).length < 2) fail('selection', 'must name an axis with at least two values');
  }
  if (anatomy.exclude !== undefined && typeof anatomy.exclude !== 'function') fail('exclude', 'must be a function of the variant');
  if (anatomy.preview !== undefined && (!Array.isArray(anatomy.preview) || anatomy.preview.some((key) => typeof key !== 'string'))) fail('preview', 'must list variant keys');
  if (!Array.isArray(anatomy.notes)) fail('notes', 'must list the anatomy judgement notes');
  if (!Array.isArray(anatomy.parts) || anatomy.parts.length === 0) fail('parts', 'must list at least the root part');
  const seen = new Set();
  anatomy.parts.forEach((part, index) => {
    const at = `parts[${index}]`;
    if (typeof part.id !== 'string' || !SLUG.test(part.id)) fail(at, 'id must be a slug');
    if (seen.has(part.id)) fail(`${at}.id`, `duplicate part ${part.id}`);
    if (!NODE_KINDS.includes(part.node)) fail(`${part.id}.node`, `must be one of ${NODE_KINDS.join(', ')}`);
    if (!['string', 'function'].includes(typeof part.selector)) fail(`${part.id}.selector`, 'must be a selector or a function of the variant');
    if (part.pseudo !== undefined && !['before', 'after'].includes(part.pseudo)) fail(`${part.id}.pseudo`, 'must be before or after');
    if (!Array.isArray(part.bind) || part.bind.some((group) => !BIND_GROUPS.includes(group))) {
      fail(`${part.id}.bind`, `must list bind groups from ${BIND_GROUPS.join(', ')}`);
    }
    if (part.node === 'TEXT' && !part.bind.includes('text')) fail(`${part.id}.bind`, 'a TEXT part must bind text');
    if (part.node === 'GLYPH' && typeof part.glyph !== 'function') fail(`${part.id}.glyph`, 'a GLYPH part must name its glyph per variant');
    if (part.when !== undefined && typeof part.when !== 'function') fail(`${part.id}.when`, 'must be a function of the variant');
    if (part.measureFrom !== undefined && typeof part.measureFrom !== 'function') fail(`${part.id}.measureFrom`, 'must be a function of the variant');
    const previewWidth = part.layout?.previewWidth;
    if (previewWidth !== undefined && !(Number.isFinite(previewWidth) && previewWidth > 0)) fail(`${part.id}.layout.previewWidth`, 'must be a positive number of pixels');
    const from = part.layout?.paddingFrom;
    if (from && !anatomy.parts.some((candidate) => candidate.parent === part.id && candidate.id === from.part && candidate.bind.includes('inset'))) {
      fail(`${part.id}.layout.paddingFrom`, `${from.part} must be a child that binds inset`);
    }
    if (index === 0) {
      if (part.parent !== undefined || part.node !== 'FRAME') fail(`${part.id}`, 'the first part must be the root FRAME without a parent');
    } else {
      if (!seen.has(part.parent)) fail(`${part.id}.parent`, `${part.parent} must be declared before its children`);
      const parent = anatomy.parts.find(({ id }) => id === part.parent);
      if (parent.node !== 'FRAME') fail(`${part.id}.parent`, `${part.parent} is not a FRAME`);
    }
    seen.add(part.id);
  });
}

// Text of the generated declaration for `name`: from its `export` line to the next.
function declaration(source, name) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^export (?:interface|type) ${name}\\b`, 'u').test(line));
  if (start < 0) return undefined;
  const end = lines.findIndex((line, index) => index > start && line.startsWith('export '));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

// Finite string-literal values of `prop` in the generated `typeName`, following
// intersections and type aliases declared in the same file.
function propValues(source, typeName, prop, seen = new Set()) {
  if (seen.has(typeName)) return undefined;
  seen.add(typeName);
  const text = declaration(source, typeName);
  if (!text) return undefined;
  const match = new RegExp(`(?:^|[\\s{;])'?${prop}'?\\?:\\s*([^;]+);`, 'u').exec(text);
  if (match) return unionValues(source, match[1].trim(), seen);
  for (const [, reference] of text.slice(text.indexOf(typeName) + typeName.length).matchAll(/\b([A-Z][A-Za-z0-9]+)\b/gu)) {
    const values = propValues(source, reference, prop, seen);
    if (values) return values;
  }
  return undefined;
}

function unionValues(source, type, seen) {
  const values = [];
  for (const member of type.split('|').map((part) => part.trim()).filter(Boolean)) {
    const literal = /^'([^']+)'$/u.exec(member);
    if (literal) {
      values.push(literal[1]);
      continue;
    }
    const alias = declaration(source, member);
    const body = alias && /=\s*([^;]+);/u.exec(alias)?.[1];
    if (!body || seen.has(member)) return undefined;
    seen.add(member);
    const nested = unionValues(source, body.trim(), seen);
    if (!nested) return undefined;
    values.push(...nested);
  }
  return values;
}

/**
 * Read a family's catalog record and React prop types and return its axes:
 * each axis is a catalog prop with its default first, then the remaining
 * finite values in declaration order.
 * @param {Anatomy} anatomy
 * @param {{ catalogRecord: any, reactTypes: string }} sources
 */
export function catalogAxes(anatomy, { catalogRecord, reactTypes }) {
  const fail = (field, message) => { throw new AnatomyError(anatomy.family, field, message); };
  if (catalogRecord?.id !== `muxui:component:${anatomy.family}`) fail('family', `catalog record id must be muxui:component:${anatomy.family}`);
  const api = catalogRecord.bindings?.['web.react']?.api;
  if (!api) fail('family', 'catalog record has no web.react binding');
  return anatomy.axes.map((axis) => {
    if (!api.props.includes(axis)) fail(`axes.${axis}`, `is not a web.react prop in the catalog record (${api.props.join(', ')})`);
    const fallback = api.defaults?.[axis];
    if (typeof fallback !== 'string') fail(`axes.${axis}`, 'has no string default in the catalog record');
    const values = propValues(reactTypes, `${anatomy.component}Props`, axis);
    if (!values?.length) fail(`axes.${axis}`, `${anatomy.component}Props.${axis} has no finite string values in the React types`);
    if (!values.includes(fallback)) fail(`axes.${axis}`, `catalog default ${fallback} is not a React value (${values.join(', ')})`);
    return { prop: axis, name: axis[0].toUpperCase() + axis.slice(1), values: [fallback, ...values.filter((value) => value !== fallback)] };
  });
}

// The installed @muxui/react dependency, resolved as a consumer's type checker would.
const reactPackage = resolve(import.meta.dirname, '../node_modules/@muxui/react');

/** Load a family's catalog record and the published prop types of the React package entry. */
export async function loadAnatomySources(anatomy) {
  const catalogRecord = parseJsonStrict(await readFile(resolve(repositoryRoot, `catalog/components/${anatomy.family}/artifact.json`), 'utf8'));
  const manifest = parseJsonStrict(await readFile(resolve(reactPackage, 'package.json'), 'utf8'));
  const reactTypes = await readFile(resolve(reactPackage, manifest.exports['.'].types), 'utf8').catch(() => {
    throw new Error('MUXUI_FIGMA_COMPONENTS_REACT_UNGENERATED: run `pnpm generate --package @muxui/react` first');
  });
  return { catalogRecord, reactTypes };
}

/** Stable variant key, for example `variant=primary,size=md,state=hover`. */
export function variantKey(anatomy, variant) {
  const parts = anatomy.axes.map((axis) => `${axis}=${variant.axes[axis]}`);
  if (anatomy.selection) parts.push(`${anatomy.selection.name.toLowerCase()}=${variant.selection}`);
  parts.push(`state=${variant.state}`);
  return parts.join(',');
}

/** Figma variant name, for example `Variant=primary, Size=md, State=hover`. */
export function variantName(anatomy, axes, variant) {
  const parts = axes.map(({ prop, name }) => `${name}=${variant.axes[prop]}`);
  if (anatomy.selection) parts.push(`${anatomy.selection.name}=${variant.selection}`);
  parts.push(`State=${variant.state}`);
  return parts.join(', ');
}

/**
 * Validate an anatomy against its catalog record and React types, then
 * expand its variants in axis order: catalog axes, selection, then state.
 * @param {Anatomy} anatomy
 * @param {{ catalogRecord: any, reactTypes: string }} sources
 */
export function resolveAnatomy(anatomy, sources) {
  validateAnatomyShape(anatomy);
  const axes = catalogAxes(anatomy, sources);
  let combinations = [{}];
  for (const axis of axes) {
    combinations = combinations.flatMap((combination) => axis.values.map((value) => ({ ...combination, [axis.prop]: value })));
  }
  const selections = anatomy.selection ? Object.keys(anatomy.selection.values) : [undefined];
  const variants = [];
  for (const combination of combinations) {
    for (const selection of selections) {
      for (const state of anatomy.states) {
        const variant = { axes: combination, ...(selection === undefined ? {} : { selection }), state };
        if (anatomy.exclude?.(variant)) continue;
        variants.push({ ...variant, key: variantKey(anatomy, variant), name: variantName(anatomy, axes, variant) });
      }
    }
  }
  for (const key of anatomy.preview ?? []) {
    if (!variants.some((variant) => variant.key === key)) throw new AnatomyError(anatomy.family, 'preview', `${key} is not a variant key`);
  }
  for (const part of anatomy.parts) {
    for (const variant of variants) {
      const present = part.when ? part.when(variant) : true;
      if (typeof present !== 'boolean') throw new AnatomyError(anatomy.family, `${part.id}.when`, 'must return a boolean');
      if (!present) continue;
      const selector = typeof part.selector === 'function' ? part.selector(variant) : part.selector;
      if (typeof selector !== 'string' || !selector) throw new AnatomyError(anatomy.family, `${part.id}.selector`, `returned no selector for ${variant.key}`);
      if (part.glyph && typeof part.glyph(variant) !== 'string') throw new AnatomyError(anatomy.family, `${part.id}.glyph`, `returned no glyph for ${variant.key}`);
      const sources = part.measureFrom?.(variant) ?? {};
      for (const [longhand, from] of Object.entries(sources)) {
        if (!partLonghands(part).includes(longhand)) throw new AnatomyError(anatomy.family, `${part.id}.measureFrom`, `${longhand} is not a bound longhand`);
        if (typeof from !== 'string' || !from) throw new AnatomyError(anatomy.family, `${part.id}.measureFrom`, `returned no selector for ${longhand} in ${variant.key}`);
      }
    }
  }
  return { anatomy, axes, variants };
}

/** Props for one variant's fixture: base fixture, axis values, selection, then state props. */
export function fixtureProps(anatomy, variant) {
  return {
    ...anatomy.fixture,
    ...variant.axes,
    ...(variant.selection === undefined ? {} : anatomy.selection.values[variant.selection]),
    ...(STATE_EFFECTS[variant.state].props ?? {}),
  };
}

/** Selector for a part or the state target in one variant. */
export function selectorFor(selector, variant) {
  return typeof selector === 'function' ? selector(variant) : selector;
}
