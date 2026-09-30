/*
 * Figma export: a deterministic projection of the canonical token source into
 * Figma variables, text styles, and effect styles (Decision 0020). Figma
 * content is never canonical; every token is either exported or reported.
 */
import { canonicalDigest } from '@muxui/schema';
import { cssName } from './core.mjs';
import { applyFigmaBatch } from './figma-applier.mjs';
import { TokenContractError, compileTokenGraph } from './index.mjs';

export const FIGMA_EXPORT_FORMAT = 'muxui-figma-export-v1';
export const FIGMA_ROOT_FONT_SIZE_PX = 16;
export const FIGMA_MAX_MODES = 4;
/** Default per-script budget; keeps each `use_figma` call well under typical tool payload limits. */
export const FIGMA_BATCH_BUDGET_BYTES = 40_000;

// Axes exported as Figma modes, in mode-key order. Motion and direction are not
// exported: tokens that differ only on them use the default-mode value.
const EXPORTED_AXES = Object.freeze(['colorScheme', 'contrast', 'density']);
const DROPPED_AXES = Object.freeze(['motion', 'direction']);
const MODE_LABELS = Object.freeze({
  colorScheme: { light: 'Light', dark: 'Dark' },
  contrast: { standard: 'Standard contrast', more: 'More contrast' },
  density: { comfortable: 'Comfortable', compact: 'Compact' },
});
const VARIABLE_TYPES = Object.freeze({ color: 'COLOR', dimension: 'FLOAT', number: 'FLOAT', string: 'STRING' });
const UNSUPPORTED_REASONS = Object.freeze({
  duration: 'Figma variables have no duration type; durations stay CSS-only.',
  easing: 'Figma variables have no easing type; easing curves stay CSS-only.',
  transition: 'Figma variables have no transition type; transitions stay CSS-only.',
});
// Fixed collection table: keys and names never depend on which axes tokens
// vary on, so a token gaining a mode adds modes instead of moving collections.
const COLLECTIONS = Object.freeze([
  { key: 'reference', name: 'Reference' },
  { key: 'semantic-color', name: 'Semantic color' },
  { key: 'semantic-dimension', name: 'Semantic dimension' },
  { key: 'semantic-number-string', name: 'Semantic number and string' },
]);
const SEMANTIC_COLLECTION_BY_TYPE = Object.freeze({
  color: 'semantic-color', dimension: 'semantic-dimension', number: 'semantic-number-string', string: 'semantic-number-string',
});
const FONT_STYLES = Object.freeze({
  100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium',
  600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black',
});
// Conservative Figma name segment: lowercase letters, digits, and hyphens.
// Figma rejects `.` and some punctuation in variable names; `/` creates groups.
export const FIGMA_NAME_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, message, details) {
  throw new TokenContractError(code, message, details);
}

function round(value, places = 6) {
  return Number(value.toFixed(places));
}

/** Convert `#rrggbb[aa]` to Figma RGBA channels in 0..1. Source colors are already sRGB. */
export function hexToFigmaColor(hex) {
  const channel = (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255;
  return { r: round(channel(1)), g: round(channel(3)), b: round(channel(5)), a: hex.length === 9 ? round(channel(7)) : 1 };
}

function pxLength(length) {
  return length.unit === 'rem' ? round(length.value * FIGMA_ROOT_FONT_SIZE_PX) : length.value;
}

function dimensionPx(token) {
  return token.relative ? round(token.relative.value * FIGMA_ROOT_FONT_SIZE_PX) : round(token.value);
}

/** Deterministic Figma variable name: drop the layer, keep `component/`, and group by `/`. */
export function figmaVariableName(tokenId) {
  const [layer, ...rest] = tokenId.split('.');
  return (layer === 'component' ? ['component', ...rest] : rest).join('/');
}

function effectStyleName(tokenId) {
  const [layer, ...rest] = tokenId.split('.');
  return (layer === 'semantic' ? rest : [layer, ...rest]).join('/');
}

function assertFigmaName(name, tokenId) {
  if (!name.split('/').every((segment) => FIGMA_NAME_SEGMENT.test(segment))) {
    fail('MUXUI_FIGMA_NAME_INVALID', `${tokenId} maps to an invalid Figma name ${name}`, { tokenId, name });
  }
}

// Every mode selection over `axes`, each axis's default value first so the
// first combination (the Figma default mode) follows `theme.defaultModes`.
function modeCombinations(axes, source) {
  let combinations = [{}];
  for (const axis of axes) {
    const fallback = source.theme.defaultModes[axis];
    const values = [fallback, ...source.theme.modeAxes[axis].filter((value) => value !== fallback)];
    combinations = combinations.flatMap((combination) => values.map((value) => ({ ...combination, [axis]: value })));
  }
  return combinations;
}

// Axes (from `axes`) on which `valueAt(modes)` changes anywhere in the mode space.
function varyingAxes(axes, source, valueAt) {
  const defaults = source.theme.defaultModes;
  const found = new Set();
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  for (const combination of modeCombinations(axes, source)) {
    const value = valueAt({ ...defaults, ...combination });
    for (const axis of axes) {
      if (found.has(axis)) continue;
      for (const alternative of source.theme.modeAxes[axis]) {
        if (alternative !== combination[axis] && !same(value, valueAt({ ...defaults, ...combination, [axis]: alternative }))) {
          found.add(axis);
          break;
        }
      }
    }
  }
  return axes.filter((axis) => found.has(axis));
}

function modeKey(modes, axes) {
  return axes.length ? axes.map((axis) => `${axis}.${modes[axis]}`).join('+') : 'default';
}

function modeName(modes, axes, defaults) {
  if (!axes.length) return 'Default';
  const parts = axes
    .filter((axis) => axes.length === 1 || axis !== 'contrast' || modes[axis] !== defaults.contrast)
    .map((axis) => {
      const label = MODE_LABELS[axis][modes[axis]];
      if (!label) fail('MUXUI_FIGMA_MODE_UNKNOWN', `${axis}.${modes[axis]} has no Figma mode label`, { axis, value: modes[axis] });
      return label;
    });
  return parts.map((part, index) => (index ? part.toLowerCase() : part)).join(' ');
}

function variableScopes(token) {
  if (token.layer === 'reference') return [];
  if (token.type === 'color') return ['ALL_FILLS', 'STROKE_COLOR', 'EFFECT_COLOR'];
  if (token.type === 'dimension') {
    if (/radius/u.test(token.id)) return ['CORNER_RADIUS'];
    if (/font-size|\.typography\..*size$/u.test(token.id)) return ['FONT_SIZE'];
    return ['WIDTH_HEIGHT', 'GAP'];
  }
  if (token.type === 'number') {
    if (/weight/u.test(token.id)) return ['FONT_WEIGHT'];
    return [];
  }
  return [];
}

function unscopedReason(token) {
  if (token.layer === 'reference') return null;
  if (token.type === 'string') return 'CSS string values do not match a Figma property; the variable is unscoped.';
  if (token.type === 'number' && variableScopes(token).length === 0) {
    return 'Unitless CSS numbers (for example line-height multipliers) have no matching Figma scope; the variable is unscoped.';
  }
  return null;
}

function firstFontFamily(stack) {
  const [first] = stack.split(',');
  return first.trim().replace(/^["']|["']$/gu, '');
}

function letterSpacing(value) {
  if (value === 'normal') return { unit: 'PERCENT', value: 0 };
  const match = /^(-?\d+(?:\.\d+)?)(em|px)$/u.exec(value);
  if (!match) return null;
  return match[2] === 'em' ? { unit: 'PERCENT', value: round(Number(match[1]) * 100) } : { unit: 'PIXELS', value: Number(match[1]) };
}

function figmaEffects(effect) {
  return effect.layers.map((layer) => ({
    type: layer.inset ? 'INNER_SHADOW' : 'DROP_SHADOW',
    color: (() => {
      const color = hexToFigmaColor(layer.color.value);
      return layer.color.alpha === undefined ? color : { ...color, a: round(layer.color.alpha) };
    })(),
    offset: { x: pxLength(layer.offsetX), y: pxLength(layer.offsetY) },
    radius: pxLength(layer.blur),
    spread: pxLength(layer.spread),
    visible: true,
    blendMode: 'NORMAL',
    ...(layer.inset ? {} : { showShadowBehindNode: false }),
  }));
}

/**
 * Compile the canonical token source into a deterministic Figma export
 * document: provenance, collections/modes/variables, text and effect styles,
 * and a report covering every token that is not exported or is lossy.
 */
export function compileFigmaExport({ source }) {
  const defaults = source.theme.defaultModes;
  const baseGraph = compileTokenGraph(source);
  const tokenIds = Object.keys(baseGraph.tokens);
  const graphFor = new Map();
  const graph = (modes, responsive = false) => {
    const key = JSON.stringify([modes, responsive]);
    if (!graphFor.has(key)) graphFor.set(key, compileTokenGraph(source, { modes, responsive }));
    return graphFor.get(key);
  };

  const unsupported = [];
  const lossy = [];
  const lossyOnce = new Set();
  const note = (tokenId, code, detail) => {
    if (lossyOnce.has(`${tokenId}|${code}`)) return;
    lossyOnce.add(`${tokenId}|${code}`);
    lossy.push({ tokenId, code, detail });
  };
  // Report `subject` when `valueAt(modes)` differs on any of `axes`, which the export does not model.
  const noteAxes = (tokenId, code, axes, valueAt, subject) => {
    const differing = varyingAxes(axes, source, valueAt);
    if (differing.length) {
      note(tokenId, code, `${subject} differs on ${differing.join(', ')}, which the export does not model; the default-mode value is exported.`);
    }
  };

  const variableIds = new Set();
  const effectIds = [];
  for (const id of tokenIds) {
    const { type } = baseGraph.tokens[id];
    if (VARIABLE_TYPES[type]) variableIds.add(id);
    else if (type === 'effect') effectIds.push(id);
    else unsupported.push({ tokenId: id, code: 'unsupported-type', reason: UNSUPPORTED_REASONS[type] ?? `Token type ${type} has no Figma mapping.` });
  }

  // Export value for one token under one mode selection: an alias to another
  // exported variable, or a literal when Figma cannot express the recipe.
  const exportValue = (id, modes) => {
    const selected = graph(modes);
    const token = selected.tokens[id];
    if (token.source === 'alias') {
      const target = selected.dependencies[id][0];
      if (variableIds.has(target)) return { alias: target };
      note(id, 'alias-resolved', `Alias target ${target} is not a Figma variable; the resolved value is exported.`);
    }
    if (token.source === 'mix') note(id, 'mix-resolved', 'Figma cannot express color-mix; the mixed color is exported per mode.');
    if (token.source === 'formula') note(id, 'formula-resolved', 'Figma cannot express formulas; the computed value is exported per mode.');
    if (token.type === 'color') return { value: hexToFigmaColor(token.value) };
    if (token.type === 'dimension') {
      // Non-responsive graphs turn `fluid.default` into a static rem length and
      // keep a default-less recipe beside its static fallback value.
      if (token.fluid !== undefined) note(id, 'fluid-value-fallback', 'The responsive fluid recipe has no static default; its static fallback value is exported.');
      else if (graph(modes, true).tokens[id].fluid !== undefined) note(id, 'fluid-static-default', 'The responsive fluid recipe is exported as its static default size.');
      return { value: dimensionPx(token) };
    }
    return { value: token.value };
  };

  // Each variable's modes come from the exported axes it varies on; dropped
  // axes export the default-mode value and are reported.
  const varying = new Map();
  for (const id of variableIds) {
    varying.set(id, varyingAxes(EXPORTED_AXES, source, (modes) => exportValue(id, modes)));
    noteAxes(id, 'axis-not-exported', DROPPED_AXES, (modes) => exportValue(id, modes), 'The variable value');
  }

  // Collections come from a fixed layer/type table. Each collection's modes
  // are the union of axes its tokens vary on; tokens that do not vary on an
  // axis repeat their value in every mode of that axis.
  const collectionKeyOf = (id) => (baseGraph.tokens[id].layer === 'reference' ? 'reference' : SEMANTIC_COLLECTION_BY_TYPE[baseGraph.tokens[id].type]);
  const axesByCollection = new Map();
  for (const id of variableIds) {
    const axes = axesByCollection.get(collectionKeyOf(id)) ?? new Set();
    for (const axis of varying.get(id)) axes.add(axis);
    axesByCollection.set(collectionKeyOf(id), axes);
  }
  const collections = [];
  for (const { key, name } of COLLECTIONS.filter(({ key }) => axesByCollection.has(key))) {
    const axes = EXPORTED_AXES.filter((axis) => axesByCollection.get(key).has(axis));
    const modes = modeCombinations(axes, source).map((modes) => ({
      key: modeKey(modes, axes),
      name: modeName(modes, axes, defaults),
      modes,
    }));
    if (modes.length > FIGMA_MAX_MODES) {
      fail('MUXUI_FIGMA_MODE_LIMIT', `${name} needs ${modes.length} modes; Figma export allows at most ${FIGMA_MAX_MODES}`, {
        collection: key, axes, modes: modes.length,
      });
    }
    collections.push({ key, name, axes, modes });
  }
  const collectionByKey = new Map(collections.map((collection) => [collection.key, collection]));

  const variables = [];
  const names = new Map();
  for (const id of [...variableIds].sort(compareText)) {
    const token = baseGraph.tokens[id];
    const collection = collectionByKey.get(collectionKeyOf(id));
    const name = figmaVariableName(id);
    assertFigmaName(name, id);
    const nameKey = `${collection.key}|${name}`;
    if (names.has(nameKey)) fail('MUXUI_FIGMA_NAME_COLLISION', `${id} and ${names.get(nameKey)} share ${name}`, { tokenId: id, name });
    names.set(nameKey, id);
    const values = {};
    for (const mode of collection.modes) values[mode.key] = exportValue(id, { ...defaults, ...mode.modes });
    const reason = unscopedReason(token);
    if (reason) note(id, 'unscoped', reason);
    variables.push({
      tokenId: id,
      name,
      collection: collection.key,
      type: VARIABLE_TYPES[token.type],
      description: `${source.tokens[id].meaning}\n\nMux token: ${id}`,
      scopes: variableScopes(token),
      codeSyntax: { WEB: `var(${cssName(id)})` },
      values,
    });
  }

  // Styles use the default-mode graph only. Bound text fields follow their
  // variable's modes; every other input is reported when it differs by mode.
  const ALL_AXES = [...EXPORTED_AXES, ...DROPPED_AXES];
  const resolvedAt = (tokenId) => (modes) => {
    const token = graph(modes).tokens[tokenId];
    return token && [token.value, token.relative, token.effect];
  };

  // Text styles: one per typography role and size variant.
  const textStyles = [];
  const roles = new Map();
  for (const id of tokenIds) {
    const match = /^semantic\.typography\.([a-z]+)-([a-z0-9]+)-font-size$/u.exec(id);
    if (match && source.tokens[`semantic.typography.${match[1]}-font-family`]) {
      roles.set(match[1], [...(roles.get(match[1]) ?? []), match[2]]);
    }
  }
  const sizeOrder = ['xs', 's', 'm', 'l', 'xl'];
  for (const role of [...roles.keys()].sort(compareText)) {
    const prefix = `semantic.typography.${role}`;
    const ids = {
      fontFamily: `${prefix}-font-family`,
      fontWeight: `${prefix}-font-weight`,
      lineHeight: `${prefix}-line-height`,
      letterSpacing: `${prefix}-letter-spacing`,
    };
    for (const size of roles.get(role).sort((a, b) => sizeOrder.indexOf(b) - sizeOrder.indexOf(a))) {
      const sizeId = `${prefix}-${size}-font-size`;
      const family = firstFontFamily(baseGraph.tokens[ids.fontFamily].value);
      const weight = baseGraph.tokens[ids.fontWeight]?.value ?? 400;
      const lineHeight = baseGraph.tokens[ids.lineHeight]?.value;
      const spacing = letterSpacing(baseGraph.tokens[ids.letterSpacing]?.value ?? 'normal');
      const bindings = {};
      for (const [field, tokenId] of [['fontSize', sizeId], ['fontWeight', ids.fontWeight]]) {
        if (variableIds.has(tokenId)) bindings[field] = tokenId;
      }
      note(ids.fontFamily, 'text-style-font-family-unbound', `Text styles use the first family (${family}) as a literal; the CSS font stack is not a Figma family name.`);
      if (lineHeight !== undefined) note(ids.lineHeight, 'text-style-line-height-unbound', 'Text styles use a percent line height; Figma binds line height to pixel values only.');
      if (spacing) note(ids.letterSpacing, 'text-style-letter-spacing-unbound', 'Text styles use a literal letter spacing; Figma cannot bind a string variable to letter spacing.');
      else note(ids.letterSpacing, 'text-style-letter-spacing-unsupported', 'The letter-spacing value has no Figma equivalent; text styles use 0%.');
      for (const [field, tokenId] of [['fontSize', sizeId], ...Object.entries(ids)]) {
        if (!bindings[field] && baseGraph.tokens[tokenId]) {
          noteAxes(tokenId, 'style-axis-not-exported', ALL_AXES, resolvedAt(tokenId), `The ${field} used by text styles`);
        }
      }
      textStyles.push({
        id: `text-style:${role}-${size}`,
        name: `${role[0].toUpperCase()}${role.slice(1)}/${size.toUpperCase()}`,
        description: `Mux typography role ${role}, size ${size}.\n\nMux tokens: ${[sizeId, ...Object.values(ids)].join(', ')}`,
        fontName: { family, style: FONT_STYLES[weight] ?? 'Regular' },
        fontSize: dimensionPx(baseGraph.tokens[sizeId]),
        lineHeight: lineHeight === undefined ? { unit: 'AUTO' } : { unit: 'PERCENT', value: round(lineHeight * 100) },
        letterSpacing: spacing ?? { unit: 'PERCENT', value: 0 },
        bindings,
      });
    }
  }

  // Effect styles: styles cannot alias other styles, and source layers hold
  // literals, so effects are resolved and unbound.
  const effectStyles = effectIds.sort(compareText).map((id) => {
    const token = baseGraph.tokens[id];
    const name = effectStyleName(id);
    assertFigmaName(name, id);
    if (token.source === 'alias') note(id, 'effect-alias-resolved', `Figma styles cannot alias ${baseGraph.dependencies[id][0]}; the resolved layers are exported.`);
    note(id, 'effect-values-unbound', 'Source shadow layers hold literal values, so no effect fields are bound to variables.');
    noteAxes(id, 'style-axis-not-exported', ALL_AXES, resolvedAt(id), 'The effect style layers');
    return {
      tokenId: id,
      name,
      description: `${source.tokens[id].meaning}\n\nMux token: ${id}`,
      effects: figmaEffects(token.effect ?? token.value),
    };
  });

  const exported = variables.length + effectStyles.length;
  const alphaTokens = variables
    .filter(({ type, values }) => type === 'COLOR' && Object.values(values).some(({ value }) => value && value.a < 1))
    .map(({ tokenId }) => tokenId);
  lossy.sort((left, right) => compareText(left.tokenId, right.tokenId) || compareText(left.code, right.code));
  unsupported.sort((left, right) => compareText(left.tokenId, right.tokenId));
  const countBy = (entries) => Object.fromEntries(Object.entries(entries.reduce((counts, { code }) => ({ ...counts, [code]: (counts[code] ?? 0) + 1 }), {})).sort(([a], [b]) => compareText(a, b)));

  const body = {
    format: FIGMA_EXPORT_FORMAT,
    provenance: {
      source: source.id,
      tokenContractVersion: baseGraph.tokenContractVersion,
      sourceDigest: baseGraph.sourceRevision,
      rootFontSizePx: FIGMA_ROOT_FONT_SIZE_PX,
      exportedAxes: EXPORTED_AXES.filter((axis) => collections.some(({ axes }) => axes.includes(axis))),
      droppedAxes: DROPPED_AXES,
    },
    collections,
    variables,
    textStyles,
    effectStyles,
    report: {
      summary: {
        tokens: tokenIds.length,
        exported,
        variables: variables.length,
        effectStyles: effectStyles.length,
        textStyles: textStyles.length,
        unsupported: unsupported.length,
        unsupportedByCode: countBy(unsupported),
        lossyByCode: countBy(lossy),
      },
      colorConversion: {
        space: 'srgb',
        gamutClipped: [],
        note: 'Source colors are sRGB hex, so no gamut clipping occurs; alpha maps to the Figma a channel.',
        alphaTokens,
      },
      unsupported,
      lossy,
    },
  };
  return { ...body, provenance: { ...body.provenance, exportDigest: canonicalDigest(body) } };
}

// Variables ordered so every alias target precedes the variables that use it.
function orderedVariables(document) {
  const byId = new Map(document.variables.map((variable) => [variable.tokenId, variable]));
  const depth = new Map();
  const depthOf = (id) => {
    if (depth.has(id)) return depth.get(id);
    const targets = Object.values(byId.get(id).values).filter(({ alias }) => alias).map(({ alias }) => alias);
    const value = targets.length ? 1 + Math.max(...targets.map(depthOf)) : 0;
    depth.set(id, value);
    return value;
  };
  const collectionOrder = new Map(document.collections.map(({ key }, index) => [key, index]));
  return [...document.variables].sort((left, right) => depthOf(left.tokenId) - depthOf(right.tokenId)
    || collectionOrder.get(left.collection) - collectionOrder.get(right.collection)
    || compareText(left.tokenId, right.tokenId));
}

function expectedIds(document) {
  const grouped = {};
  const add = (id) => {
    const cut = id.lastIndexOf('.') > 0 ? id.lastIndexOf('.') : id.lastIndexOf(':');
    const prefix = id.slice(0, cut + 1);
    (grouped[prefix] ??= []).push(id.slice(cut + 1));
  };
  for (const { key } of document.collections) add(`collection:${key}`);
  for (const { tokenId } of document.variables) add(tokenId);
  for (const { id } of document.textStyles) add(id);
  for (const { tokenId } of document.effectStyles) add(tokenId);
  return grouped;
}

const encoder = new TextEncoder();
function byteLength(text) {
  return encoder.encode(text).length;
}

function batchScript(payload) {
  const header = `// Mux UI Figma export batch ${payload.batch}/${payload.total} (${payload.exportDigest.slice(0, 19)}). Generated from canonical tokens; do not edit.`;
  return `${header}\nconst payload = ${JSON.stringify(payload)};\nreturn await (${applyFigmaBatch.toString()})(figma, payload);\n`;
}

/**
 * Split an export into ordered, self-contained applier scripts. Each script
 * ensures every collection and mode, then upserts its slice; variables come
 * first (alias targets before aliases), then text and effect styles, and the
 * final script reports orphans. Every script stays within `budgetBytes`.
 */
export function planFigmaBatches(document, { budgetBytes = FIGMA_BATCH_BUDGET_BYTES } = {}) {
  const collections = document.collections.map(({ key, name, modes }) => ({
    id: `collection:${key}`, key, name, modes: modes.map(({ key: modeKey, name: modeName }) => ({ key: modeKey, name: modeName })),
  }));
  const items = [
    ...orderedVariables(document).map((variable) => ['variables', {
      id: variable.tokenId, name: variable.name, collection: variable.collection, type: variable.type,
      description: variable.description, scopes: variable.scopes, web: variable.codeSyntax.WEB, values: variable.values,
    }]),
    ...document.textStyles.map((style) => ['textStyles', style]),
    ...document.effectStyles.map((style) => ['effectStyles', {
      id: style.tokenId, name: style.name, description: style.description, effects: style.effects,
    }]),
  ];
  const exportDigest = document.provenance.exportDigest;
  const empty = () => ({ variables: [], textStyles: [], effectStyles: [] });
  const size = (slice, extra = {}) => byteLength(batchScript({
    exportDigest, batch: 999, total: 999, collections, ...slice, ...extra,
  }));
  const slices = [];
  let current = empty();
  let count = 0;
  for (const [kind, item] of items) {
    current[kind].push(item);
    count += 1;
    if (size(current) <= budgetBytes) continue;
    current[kind].pop();
    count -= 1;
    if (count === 0) fail('MUXUI_FIGMA_BATCH_ITEM_TOO_LARGE', `${item.id} exceeds the ${budgetBytes}-byte batch budget`, { id: item.id });
    slices.push(current);
    current = empty();
    current[kind].push(item);
    count = 1;
  }
  if (count) slices.push(current);
  const expected = expectedIds(document);
  if (size(empty(), { expected }) > budgetBytes) {
    fail('MUXUI_FIGMA_BATCH_ITEM_TOO_LARGE', `the orphan check exceeds the ${budgetBytes}-byte batch budget`, {});
  }
  slices.push({ ...empty(), expected });
  return slices.map((slice, index) => {
    const script = batchScript({ exportDigest, batch: index + 1, total: slices.length, collections, ...slice });
    return {
      batch: index + 1,
      bytes: byteLength(script),
      counts: { variables: slice.variables.length, textStyles: slice.textStyles.length, effectStyles: slice.effectStyles.length },
      orphanCheck: slice.expected !== undefined,
      script,
    };
  });
}
