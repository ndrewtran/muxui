/*
 * Pure CSS cascade and var() resolution over matched-rule levels, the shape
 * the browser measurement reads from the Chrome DevTools Protocol.
 *
 * A style context lists levels from the measured element outwards: the
 * pseudo-element's own rules (when measuring one), the element, then its
 * ancestors nearest first. Each level lists rules in ascending cascade order,
 * so the last matching declaration wins unless an earlier one is !important.
 * Physical longhands assume horizontal-tb, left-to-right layout.
 */
import { cssName } from '@muxui/tokens/core';

/**
 * @typedef {{ name: string, value: string, important?: boolean }} Declaration
 * @typedef {{ rule: string, component: boolean, library?: boolean, declarations: Declaration[] }} Rule
 *   `rule` is a stable description used in diagnostics; `component` marks
 *   any rule other than a generated theme block (including its at-rule
 *   context, such as an `@scope` prelude), so a token custom property
 *   declared there is a local override rather than the token itself.
 *   `library` marks a rule from Mux UI's own stylesheet, such as its
 *   `:where(body)` text defaults, which apply outside the instance too.
 * @typedef {{ rules: Rule[], inside: boolean }} Level
 *   `inside` is false for ancestors outside the measured component instance.
 * @typedef {{ levels: Level[] }} StyleContext
 * @typedef {{ property: string, rule: string }} Hop
 * @typedef {(
 *   { kind: 'token', token: string }
 *   | { kind: 'literal', value: string }
 *   | { kind: 'mix', token: string, percent: number }
 *   | { kind: 'overlay', paint: Resolution }
 *   | { kind: 'shadow', layers: ShadowLayer[] }
 *   | { kind: 'expression', value: string, tokens: string[] }
 *   | { kind: 'none' }
 *   | { kind: 'outside' }
 * )} Resolution
 * @typedef {{ inset: boolean, lengths: string[], color: Resolution }} ShadowLayer
 * @typedef {Resolution & { rule?: string, via?: Hop[] }} Measured
 */

const INHERITED = new Set(['color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'visibility']);
const BORDER_STYLES = new Set(['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset', 'auto']);
const WIDTH_KEYWORDS = new Set(['thin', 'medium', 'thick']);
const SIDES = /** @type {const} */ (['top', 'right', 'bottom', 'left']);
const LOGICAL_SIDE = { top: 'block-start', right: 'inline-end', bottom: 'block-end', left: 'inline-start' };
const AXIS_INDEX = { top: ['block', 0], bottom: ['block', 1], left: ['inline', 0], right: ['inline', 1] };

/** Every longhand the measurement reads, mapped to the declarations that can set it. */
export const LONGHAND_SOURCES = (() => {
  const sources = {
    'background-color': ['background-color', 'background'],
    'background-image': ['background-image', 'background'],
    'outline-color': ['outline-color', 'outline'],
    'outline-width': ['outline-width', 'outline'],
    'outline-style': ['outline-style', 'outline'],
    'outline-offset': ['outline-offset'],
    'border-top-left-radius': ['border-top-left-radius', 'border-radius', 'border-start-start-radius'],
    'border-top-right-radius': ['border-top-right-radius', 'border-radius', 'border-start-end-radius'],
    'border-bottom-right-radius': ['border-bottom-right-radius', 'border-radius', 'border-end-end-radius'],
    'border-bottom-left-radius': ['border-bottom-left-radius', 'border-radius', 'border-end-start-radius'],
    'column-gap': ['column-gap', 'gap'],
    'row-gap': ['row-gap', 'gap'],
    width: ['width', 'inline-size'],
    height: ['height', 'block-size'],
    'min-width': ['min-width', 'min-inline-size'],
    'min-height': ['min-height', 'min-block-size'],
    'box-sizing': ['box-sizing'],
    'box-shadow': ['box-shadow'],
    opacity: ['opacity'],
    color: ['color'],
    'font-family': ['font-family', 'font'],
    'font-size': ['font-size', 'font'],
    'font-weight': ['font-weight', 'font'],
    'line-height': ['line-height', 'font'],
    'letter-spacing': ['letter-spacing'],
    left: ['left', 'inset-inline-start', 'inset-inline', 'inset'],
    top: ['top', 'inset-block-start', 'inset-block', 'inset'],
  };
  for (const side of SIDES) {
    const logical = LOGICAL_SIDE[side];
    const [axis] = AXIS_INDEX[side];
    for (const part of ['color', 'width', 'style']) {
      sources[`border-${side}-${part}`] = [
        `border-${side}-${part}`, `border-${part}`, `border-${side}`, 'border',
        `border-${logical}-${part}`, `border-${logical}`, `border-${axis}-${part}`, `border-${axis}`,
      ];
    }
    sources[`padding-${side}`] = [`padding-${side}`, 'padding', `padding-${axis}`, `padding-${logical}`];
  }
  return Object.freeze(sources);
})();

/** Split `text` on top-level commas or whitespace, ignoring separators inside parentheses. */
export function splitTop(text, separator) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const character of text) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    const splits = depth === 0 && (separator === ',' ? character === ',' : /\s/u.test(character));
    if (splits) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function isLength(part) {
  return /^-?(?:\d+\.?\d*|\.\d+)(?:[a-z%]+)?$/iu.test(part) || /^(?:calc|max|min|clamp)\(/iu.test(part);
}

// Classify `<width> || <style> || <color>` shorthand parts; a var() is the color.
function borderParts(value) {
  const result = { width: 'medium', style: 'none', color: 'currentcolor' };
  for (const part of splitTop(value, ' ')) {
    if (BORDER_STYLES.has(part.toLowerCase())) result.style = part;
    else if (WIDTH_KEYWORDS.has(part.toLowerCase()) || isLength(part)) result.width = part;
    else result.color = part;
  }
  return result;
}

function boxValue(values, side) {
  const [top, right = top, bottom = top, left = right] = values;
  return { top, right, bottom, left }[side];
}

function pairValue(values, index) {
  return values[index] ?? values[0];
}

const KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert']);
const CURRENT_COLOR_DEFAULT = new Set([...SIDES.map((side) => `border-${side}-color`), 'outline-color']);

/**
 * The part of a declaration's value that sets `longhand`, or undefined when
 * the declaration does not set it. Shorthands that omit a part reset it.
 */
export function longhandValue(longhand, declaration) {
  const { name, value } = declaration;
  if (name === longhand) return value;
  if (KEYWORDS.has(value.trim().toLowerCase())) return value.trim().toLowerCase();
  if (name === 'background') {
    const layers = splitTop(value, ',');
    const last = splitTop(layers.at(-1), ' ');
    const isImage = (part) => /^(?:linear|radial|conic|repeating-[a-z]+)-gradient\(|^url\(/iu.test(part) || part === 'none';
    if (longhand === 'background-image') {
      const images = layers.map((layer) => splitTop(layer, ' ').find(isImage)).filter(Boolean);
      return images.length ? images.join(', ') : 'none';
    }
    return last.find((part) => !isImage(part) && !isLength(part) && !/^(?:no-repeat|repeat|center|top|left|right|bottom|cover|contain|\/)$/iu.test(part)) ?? 'transparent';
  }
  if (name === 'font') return value;
  if (name === 'gap') {
    const values = splitTop(value, ' ');
    return longhand === 'row-gap' ? values[0] : pairValue(values, 1);
  }
  if (name === 'border-radius') {
    // Horizontal radii only; corners in border-radius order top-left, top-right, bottom-right, bottom-left.
    const [topLeft, topRight = topLeft, bottomRight = topLeft, bottomLeft = topRight] = splitTop(value.split('/')[0], ' ');
    return { 'border-top-left-radius': topLeft, 'border-top-right-radius': topRight, 'border-bottom-right-radius': bottomRight, 'border-bottom-left-radius': bottomLeft }[longhand];
  }
  if (/^border-(?:start|end)-(?:start|end)-radius$/u.test(name)) return value;
  if (['width', 'inline-size', 'height', 'block-size', 'min-width', 'min-inline-size', 'min-height', 'min-block-size'].includes(name)) return value;
  if (name === 'outline') return borderParts(value)[longhand.slice('outline-'.length)];
  if (longhand === 'left' || longhand === 'top') {
    const values = splitTop(value, ' ');
    if (name === 'inset') return boxValue(values, longhand);
    if (name === 'inset-inline' || name === 'inset-block') return values[0];
    return value;
  }

  const match = /^(border|padding)-(top|right|bottom|left)(?:-(color|width|style))?$/u.exec(longhand);
  if (!match) return undefined;
  const [, box, side, part] = match;
  const [axis, index] = AXIS_INDEX[side];
  if (box === 'padding') {
    if (name === 'padding') return boxValue(splitTop(value, ' '), side);
    if (name === `padding-${axis}`) return pairValue(splitTop(value, ' '), index);
    return name === `padding-${LOGICAL_SIDE[side]}` ? value : undefined;
  }
  if (name === `border-${part}`) return boxValue(splitTop(value, ' '), side);
  if (name === `border-${axis}-${part}`) return pairValue(splitTop(value, ' '), index);
  if (name === `border-${LOGICAL_SIDE[side]}-${part}`) return value;
  if ([`border-${side}`, 'border', `border-${LOGICAL_SIDE[side]}`, `border-${axis}`].includes(name)) return borderParts(value)[part];
  return undefined;
}

/** The winning declaration for `longhand` within one level, or undefined. */
export function winningDeclaration(level, longhand) {
  const names = longhand.startsWith('--') ? [longhand] : LONGHAND_SOURCES[longhand];
  if (!names) throw new Error(`MUXUI_FIGMA_COMPONENTS_PROPERTY_UNKNOWN: ${longhand} is not a measured longhand`);
  let normal;
  let important;
  for (const rule of level.rules) {
    for (const declaration of rule.declarations) {
      if (!names.includes(declaration.name)) continue;
      const value = longhandValue(longhand, declaration);
      if (value === undefined) continue;
      const found = { rule: rule.rule, component: rule.component, library: Boolean(rule.library), value: value.trim() };
      if (declaration.important) important = found;
      else normal = found;
    }
  }
  return important ?? normal;
}

// First winning declaration from `start` outwards. Inherited and custom
// properties continue to the next level; others stop at `start`, except that
// `inherit` reads the next level (a pseudo-element's element, or the parent).
function find(context, longhand, start) {
  const inherited = longhand.startsWith('--') || INHERITED.has(longhand);
  for (let index = start; index < context.levels.length; index += 1) {
    const found = winningDeclaration(context.levels[index], longhand);
    if (found) {
      const keyword = found.value.toLowerCase();
      // `color: currentcolor` computes to the inherited colour.
      const inherits = keyword === 'inherit' || (keyword === 'unset' && inherited) || (longhand === 'color' && keyword === 'currentcolor');
      if (inherits) return find(context, longhand, index + 1);
      return { ...found, index };
    }
    if (!inherited) return undefined;
  }
  return undefined;
}

function parseVar(text) {
  const match = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([\s\S]*))?\)$/iu.exec(text.trim());
  if (!match) return undefined;
  return { name: match[1], fallback: match[2]?.trim() };
}

// Index of the parenthesis closing the one opened at `open`.
function closing(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * Resolve var() chains in `text`, declared at level `index`, down to Mux UI
 * token custom properties. `tokens` maps a CSS custom property name to its
 * token ID. Stops at a token declared outside component rules (the theme);
 * a component rule's local override of that property is followed so a
 * mode-scoped override shows, and an undeclared token follows its fallback.
 */
function resolveText(text, context, index, tokens, via, terminal) {
  const trimmed = text.trim();
  const reference = parseVar(trimmed);
  if (reference) {
    const declared = find(context, reference.name, index);
    const token = tokens.get(reference.name);
    // A token counts only where the theme declares it; an undeclared one
    // paints its fallback, as the browser does.
    if (token && declared && !declared.component) return { kind: 'token', token };
    if (declared) {
      via.push({ property: reference.name, rule: declared.rule });
      return resolveText(declared.value, context, declared.index, tokens, via, terminal);
    }
    if (reference.fallback !== undefined) return resolveText(reference.fallback, context, index, tokens, via, terminal);
    return { kind: 'literal', value: 'unset' };
  }
  return terminal(trimmed, (inner) => resolveText(inner, context, index, tokens, via, plainValue), (inner) => substitute(inner, context, index, tokens, via));
}

// Replace every var() in `text` with its resolved text and collect token IDs.
function substitute(text, context, index, tokens, via) {
  const found = new Set();
  let output = '';
  let cursor = 0;
  for (let start = text.indexOf('var(', cursor); start >= 0; start = text.indexOf('var(', cursor)) {
    const end = closing(text, start + 3);
    output += text.slice(cursor, start);
    const resolved = resolveText(text.slice(start, end + 1), context, index, tokens, via, plainValue);
    if (resolved.kind === 'token') {
      found.add(resolved.token);
      output += `var(${cssName(resolved.token)})`;
    } else if (resolved.kind === 'expression') {
      resolved.tokens.forEach((token) => found.add(token));
      output += resolved.value;
    } else if (resolved.kind === 'mix') {
      found.add(resolved.token);
      output += `color-mix(in srgb, var(${cssName(resolved.token)}) ${resolved.percent}%, transparent)`;
    } else {
      output += resolved.value ?? '';
    }
    cursor = end + 1;
  }
  output += text.slice(cursor);
  return { value: output.replace(/\s+/gu, ' ').trim(), tokens: [...found].sort() };
}

// Terminal interpretation of a value that is not itself a whole var().
function plainValue(text, resolve, expand) {
  const mix = /^color-mix\(\s*in\s+srgb\s*,\s*([\s\S]+?)\s+(\d+(?:\.\d+)?)%\s*,\s*transparent\s*\)$/iu.exec(text);
  if (mix) {
    const inner = resolve(mix[1]);
    if (inner.kind === 'token') return { kind: 'mix', token: inner.token, percent: Number(mix[2]) };
  }
  const gradient = /^linear-gradient\(([\s\S]*)\)$/iu.exec(text);
  if (gradient) {
    const stops = splitTop(gradient[1], ',');
    if (stops.length === 2 && stops[0] === stops[1]) return { kind: 'overlay', paint: resolve(stops[0]) };
  }
  if (text.includes('var(')) return { kind: 'expression', ...expand(text) };
  return { kind: 'literal', value: text };
}

function shadowValue(text, resolve, expand) {
  if (text === 'none') return { kind: 'literal', value: 'none' };
  const layers = [];
  for (const layer of splitTop(text, ',')) {
    const parts = splitTop(layer, ' ');
    const inset = parts.includes('inset');
    const lengths = parts.filter((part) => part !== 'inset' && isLength(part));
    const colors = parts.filter((part) => part !== 'inset' && !isLength(part));
    if (colors.length > 1 || lengths.some((length) => length.includes('var('))) return { kind: 'expression', ...expand(text) };
    layers.push({ inset, lengths, color: colors.length ? resolve(colors[0]) : { kind: 'literal', value: 'currentcolor' } });
  }
  return { kind: 'shadow', layers };
}

/**
 * Resolve `longhand` for the element (or pseudo-element) described by
 * `context` to a token, a literal, or a structured paint, with the winning
 * rule and the custom-property hops followed to reach it.
 * @param {StyleContext} context
 * @param {string} longhand
 * @param {Map<string, string>} tokens CSS custom property name to token ID.
 * @returns {Measured}
 */
export function resolveProperty(context, longhand, tokens) {
  const found = find(context, longhand, 0);
  // Border and outline colours default to currentcolor: they paint the
  // element's own colour, so they resolve through `color`.
  if (CURRENT_COLOR_DEFAULT.has(longhand) && (!found || found.value.toLowerCase() === 'currentcolor')) {
    const { rule, via, ...color } = resolveProperty(context, 'color', tokens);
    if (color.kind === 'none') return color;
    return { ...color, rule: found?.rule ?? rule, via: [{ property: 'color', rule: rule ?? 'initial' }, ...(via ?? [])] };
  }
  if (!found) return { kind: 'none' };
  // Outside the instance only Mux UI's own document defaults count; a
  // consumer or harness ancestor's value is not the component's.
  if (!context.levels[found.index].inside && !found.library) return { kind: 'outside', rule: found.rule };
  const via = [];
  const terminal = longhand === 'box-shadow' ? shadowValue : plainValue;
  const resolved = resolveText(found.value, context, found.index, tokens, via, terminal);
  return { ...resolved, rule: found.rule, ...(via.length ? { via } : {}) };
}

/** A resolution without its diagnostics, for comparing modes. */
export function resolutionValue(measured) {
  const { rule, via, ...value } = measured;
  return value;
}
