import { compilePureTokenGraph, cssDeclaration } from './core.mjs';
import { NAMED_SHADES, NEUTRAL_SHADES, generatePalette, generateMonochromePalette, getContrastRatio as contrastRatio } from './scale-palette.mjs';
export { NAMED_SHADES, NEUTRAL_SHADES, randomScaleBaseColor } from './scale-palette.mjs';
export { getContrastRatio as getScaleContrastRatio } from './scale-palette.mjs';

/*
 * Browser-safe theme authoring. This module intentionally has no filesystem,
 * crypto, schema-loader, or package-runtime imports. Node tooling supplies the
 * canonical source when it needs provenance and digest evidence; browser
 * consumers can compile a validated document's typed overrides directly.
 */

const DOCUMENT_KEYS = ['schema', 'id', 'source', 'tokenContractVersion', 'modes', 'overrides', 'scale'];
const MODE_AXES = ['colorScheme', 'contrast', 'motion', 'density', 'direction'];
const SCALE_KEYS = ['mode', 'presetId', 'namedColor', 'neutralColor', 'whiteAnchor', 'contrastPivot', 'curvature'];
const HEX = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu;
const OPAQUE_HEX = /^#[0-9a-f]{6}$/iu;
const SCALE_OVERRIDE_ID = /^(?:reference\.color\.(?:brand|neutral)-\d+|reference\.dimension\.radius-(?:xs|s|m|l|xl|2xl)|semantic\.color\.(?:color|neutral)-\d+-fg)$/u;
const RADIUS_FACTORS = Object.freeze({ xs: 4, s: 6, m: 8, l: 12, xl: 16, '2xl': 24 });
const CONTRAST_PIVOTS = Object.freeze([5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function assertRecord(value, path) { if (!isRecord(value)) throw new TypeError(`MUXUI_THEME_OBJECT_INVALID: ${path}`); }
function assertKeys(value, allowed, path) {
  assertRecord(value, path);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new TypeError(`MUXUI_THEME_UNKNOWN_FIELD: ${path}.${key}`);
}
function assertHex(value, path) { if (typeof value !== 'string' || !HEX.test(value)) throw new TypeError(`MUXUI_THEME_COLOR_INVALID: ${path}`); }
function assertFinite(value, path) { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`MUXUI_THEME_NUMBER_INVALID: ${path}`); }

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function validateEffect(value, path) {
  assertRecord(value, path);
  if (Object.keys(value).some((key) => !['kind', 'layers'].includes(key)) || value.kind !== 'shadow' || !Array.isArray(value.layers) || value.layers.length < 1) throw new TypeError(`MUXUI_THEME_EFFECT_INVALID: ${path}`);
  value.layers.forEach((layer, index) => {
    const layerPath = `${path}.layers[${index}]`;
    assertRecord(layer, layerPath);
    if (Object.keys(layer).some((key) => !['offsetX', 'offsetY', 'blur', 'spread', 'color', 'inset'].includes(key))) throw new TypeError(`MUXUI_THEME_EFFECT_INVALID: ${layerPath}`);
    for (const key of ['offsetX', 'offsetY', 'blur', 'spread']) {
      assertRecord(layer[key], `${layerPath}.${key}`);
      if (Object.keys(layer[key]).some((field) => !['value', 'unit'].includes(field))) throw new TypeError(`MUXUI_THEME_LENGTH_INVALID: ${layerPath}.${key}`);
      assertFinite(layer[key].value, `${layerPath}.${key}.value`);
      if (!['px', 'rem'].includes(layer[key].unit) || (key === 'blur' && layer[key].value < 0)) throw new TypeError(`MUXUI_THEME_LENGTH_INVALID: ${layerPath}.${key}`);
    }
    if (layer.inset !== undefined && typeof layer.inset !== 'boolean') throw new TypeError(`MUXUI_THEME_EFFECT_INVALID: ${layerPath}.inset`);
    assertRecord(layer.color, `${layerPath}.color`);
    if (Object.keys(layer.color).some((key) => !['value', 'alpha'].includes(key))) throw new TypeError(`MUXUI_THEME_EFFECT_INVALID: ${layerPath}.color`);
    assertHex(layer.color.value, `${layerPath}.color.value`);
    if (layer.color.alpha !== undefined && (typeof layer.color.alpha !== 'number' || !Number.isFinite(layer.color.alpha) || layer.color.alpha < 0 || layer.color.alpha > 1)) throw new TypeError(`MUXUI_THEME_ALPHA_INVALID: ${layerPath}.color.alpha`);
    if (layer.color.value.length === 9 && layer.color.alpha !== undefined) throw new TypeError(`MUXUI_THEME_ALPHA_INVALID: ${layerPath}.color`);
  });
}

function validateTypedValue(value, token, path) {
  if (!isRecord(value)) throw new TypeError(`MUXUI_THEME_OVERRIDE_INVALID: ${path}`);
  if (value.type !== token.type || value.unit !== token.unit) throw new TypeError(`MUXUI_THEME_OVERRIDE_TYPE_INVALID: ${path}`);
  if (token.type === 'color') assertHex(value.value, `${path}.value`);
  else if (['dimension', 'duration', 'number'].includes(token.type)) assertFinite(value.value, `${path}.value`);
  else if (token.type === 'string' && (typeof value.value !== 'string' || !/^[a-zA-Z0-9 .,+#%()/_-]+$/u.test(value.value))) throw new TypeError(`MUXUI_THEME_STRING_INVALID: ${path}.value`);
  else if (token.type === 'effect') validateEffect(value.value, `${path}.value`);
}

function assertSource(source, document) {
  if (!isRecord(source) || !isRecord(source.tokens) || !isRecord(source.theme) || !isRecord(source.theme.modeAxes) || !isRecord(source.theme.defaultModes)) throw new TypeError('MUXUI_THEME_SOURCE_REQUIRED');
  if (source.id !== document.source) throw new TypeError('MUXUI_THEME_SOURCE_INVALID');
  if (source.tokenContractVersion !== document.tokenContractVersion) throw new TypeError('MUXUI_THEME_CONTRACT_INVALID');
  assertSourceMetadata(source);
}

// The browser receives the same source as Node. Missing source-owned metadata
// is an error, so an editor cannot silently construct a different default theme.
function assertSourceMetadata(source) {
  const invalid = (path) => { throw new TypeError(`MUXUI_THEME_SOURCE_METADATA_INVALID: ${path}`); };
  const { scale, fonts, typography } = source.theme;
  if (!isRecord(scale) || !isRecord(fonts) || !isRecord(typography?.roles)) invalid('theme');
  assertKeys(scale, ['algorithm', 'namedShades', 'neutralShades', 'defaults', 'standardPresets', 'monochromePresets', 'radius', 'contrast'], 'theme.scale');
  if (scale.algorithm !== 'muxui-oklch-v1'
    || !sameValue(scale.namedShades, NAMED_SHADES)
    || !sameValue(scale.neutralShades, NEUTRAL_SHADES)) invalid('theme.scale.shades');
  const radius = scale.radius;
  if (!isRecord(radius) || radius.unit !== 'rem' || radius.base !== 0.125
    || !sameValue(radius.multipliers, RADIUS_FACTORS)
    || !sameValue(radius.curvature, { default: 1, minimum: 0, maximum: 2, step: 0.01 })) invalid('theme.scale.radius');
  const contrast = scale.contrast;
  if (!isRecord(contrast) || contrast.algorithm !== 'wcag2-endpoint-v1'
    || contrast.defaultPivot !== 'auto' || contrast.foregrounds !== 'per-shade'
    || !sameValue(contrast.pivots, CONTRAST_PIVOTS)) invalid('theme.scale.contrast');
  assertKeys(contrast, ['algorithm', 'defaultPivot', 'pivots', 'foregrounds'], 'theme.scale.contrast');
  if (!isRecord(scale.defaults)) invalid('theme.scale.defaults');
  assertKeys(scale.defaults, ['standard', 'monochrome'], 'theme.scale.defaults');
  for (const [key, mode, references] of [
    ['standardPresets', 'standard', ['namedColor', 'neutralColor']],
    ['monochromePresets', 'monochrome', ['color']],
  ]) {
    const presets = scale[key];
    if (!Array.isArray(presets) || presets.length === 0) invalid(`theme.scale.${key}`);
    const ids = new Set();
    for (const preset of presets) {
      if (!isRecord(preset) || typeof preset.id !== 'string' || !/^[a-z][a-z0-9-]*$/u.test(preset.id) || ids.has(preset.id)
        || typeof preset.name !== 'string' || !preset.name
        || typeof preset.description !== 'string' || !preset.description
        || references.some((reference) => source.tokens[preset[reference]]?.type !== 'color')) invalid(`theme.scale.${key}`);
      assertKeys(preset, ['id', 'name', 'description', ...references], `theme.scale.${key}`);
      ids.add(preset.id);
    }
    if (!ids.has(scale.defaults[mode])) invalid(`theme.scale.defaults.${mode}`);
  }
  const fontRoles = ['display', 'body', 'expressive', 'mono'];
  assertKeys(fonts, fontRoles, 'theme.fonts');
  for (const role of fontRoles) {
    const font = fonts[role];
    if (!isRecord(font) || source.tokens[font.token]?.type !== 'string'
      || !isRecord(font.assets?.normal) || !isRecord(font.assets?.italic)
      || typeof font.license !== 'string' || !font.license || !isRecord(font.provenance)) invalid(`theme.fonts.${role}`);
    assertKeys(font, ['token', 'assets', 'license', 'provenance'], `theme.fonts.${role}`);
    assertKeys(font.assets, ['normal', 'italic'], `theme.fonts.${role}.assets`);
    for (const style of ['normal', 'italic']) {
      const asset = font.assets[style];
      assertKeys(asset, ['path', 'sha256'], `theme.fonts.${role}.assets.${style}`);
      if (typeof asset.path !== 'string' || !asset.path || typeof asset.sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(asset.sha256)) invalid(`theme.fonts.${role}.assets.${style}`);
    }
    assertKeys(font.provenance, ['repository', 'revision'], `theme.fonts.${role}.provenance`);
    if (typeof font.provenance.repository !== 'string' || !font.provenance.repository
      || typeof font.provenance.revision !== 'string' || !/^[a-f0-9]{40}$/u.test(font.provenance.revision)) invalid(`theme.fonts.${role}.provenance`);
  }
  const typographyRoles = ['display', 'heading', 'title', 'label', 'body', 'mono', 'expressive'];
  const variantTypes = { fontSize: ['dimension', 'px'], fontWeight: ['number', 'unitless'], lineHeight: ['number', 'unitless'], letterSpacing: ['string', 'string'] };
  assertKeys(typography, ['roles'], 'theme.typography');
  assertKeys(typography.roles, typographyRoles, 'theme.typography.roles');
  for (const role of typographyRoles) {
    const definition = typography.roles[role];
    if (!isRecord(definition) || source.tokens[definition.fontFamily]?.type !== 'string'
      || source.tokens[definition.color]?.type !== 'color' || !isRecord(definition.variants)
      || Object.keys(definition.variants).length === 0) invalid(`theme.typography.roles.${role}`);
    assertKeys(definition, ['fontFamily', 'color', 'variants'], `theme.typography.roles.${role}`);
    for (const [name, variant] of Object.entries(definition.variants)) {
      if (!/^[a-z][a-z0-9-]*$/u.test(name) || !isRecord(variant)) invalid(`theme.typography.roles.${role}.variants`);
      assertKeys(variant, Object.keys(variantTypes), `theme.typography.roles.${role}.variants.${name}`);
      for (const [key, [type, unit]] of Object.entries(variantTypes)) {
        const token = source.tokens[variant[key]];
        if (token?.type !== type || token.unit !== unit) invalid(`theme.typography.roles.${role}.variants.${name}.${key}`);
      }
    }
  }
}

function scaleAssignments(document, source) {
  if (document.scale === undefined) return null;
  return generateScaleTheme({ source, ...document.scale }).assignments;
}

function sameValue(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

export function validateThemeAuthoringDocument(document, { source } = {}) {
  assertKeys(document, DOCUMENT_KEYS, 'document');
  if (document.schema !== 'muxui-theme-authoring-v1') throw new TypeError('MUXUI_THEME_SCHEMA_INVALID');
  if (typeof document.id !== 'string' || !/^muxui:theme:[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(document.id)) throw new TypeError('MUXUI_THEME_ID_INVALID');
  if (document.source !== 'muxui:token:default-theme') throw new TypeError('MUXUI_THEME_SOURCE_INVALID');
  if (document.tokenContractVersion !== '2.1.0') throw new TypeError('MUXUI_THEME_CONTRACT_INVALID');
  assertSource(source, document);
  assertKeys(document.modes, MODE_AXES, 'document.modes');
  for (const axis of MODE_AXES) {
    if (!Array.isArray(document.modes[axis]) || document.modes[axis].length < 1 || new Set(document.modes[axis]).size !== document.modes[axis].length || document.modes[axis].some((value) => typeof value !== 'string')) throw new TypeError(`MUXUI_THEME_MODES_INVALID: ${axis}`);
    const declared = source.theme.modeAxes[axis];
    if (!Array.isArray(declared) || document.modes[axis].some((value) => !declared.includes(value))) throw new TypeError(`MUXUI_THEME_MODE_UNKNOWN: ${axis}`);
  }
  assertRecord(document.overrides, 'document.overrides');
  const tokens = source.tokens;
  for (const [id, value] of Object.entries(document.overrides)) {
    if (!/^(reference|semantic|component)\.[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/u.test(id)) throw new TypeError(`MUXUI_THEME_TOKEN_ID_INVALID: ${id}`);
    const token = tokens[id];
    if (!token) throw new TypeError(`MUXUI_THEME_OVERRIDE_UNKNOWN: ${id}`);
    assertKeys(value, ['type', 'unit', 'value', 'fluid', 'formula', 'effect', 'relative', 'mix'], `document.overrides.${id}`);
    validateTypedValue(value, token, `document.overrides.${id}`);
  }
  if (document.scale !== undefined) {
    assertKeys(document.scale, SCALE_KEYS, 'document.scale');
    if (!['standard', 'mono'].includes(document.scale.mode)) throw new TypeError('MUXUI_THEME_SCALE_MODE_INVALID');
    if (typeof document.scale.presetId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(document.scale.presetId)) throw new TypeError('MUXUI_THEME_SCALE_PRESET_INVALID');
    if (typeof document.scale.namedColor !== 'string' || !OPAQUE_HEX.test(document.scale.namedColor)) throw new TypeError('MUXUI_THEME_COLOR_INVALID: document.scale.namedColor');
    if (typeof document.scale.neutralColor !== 'string' || !OPAQUE_HEX.test(document.scale.neutralColor)) throw new TypeError('MUXUI_THEME_COLOR_INVALID: document.scale.neutralColor');
    if (typeof document.scale.whiteAnchor !== 'boolean') throw new TypeError('MUXUI_THEME_SCALE_WHITE_ANCHOR_INVALID');
    if (!(document.scale.contrastPivot === 'auto' || CONTRAST_PIVOTS.includes(document.scale.contrastPivot))) throw new TypeError('MUXUI_THEME_SCALE_PIVOT_INVALID');
    if (typeof document.scale.curvature !== 'number' || !Number.isFinite(document.scale.curvature) || document.scale.curvature < 0 || document.scale.curvature > 2) throw new TypeError('MUXUI_THEME_SCALE_CURVATURE_INVALID');
  }
  const generated = scaleAssignments(document, source);
  if (generated) {
    for (const [id, expected] of Object.entries(generated)) {
      if (!sameValue(document.overrides[id], expected)) throw new TypeError(`MUXUI_THEME_SCALE_ASSIGNMENT_INVALID: ${id}`);
    }
    for (const [id, value] of Object.entries(document.overrides)) {
      if (SCALE_OVERRIDE_ID.test(id) && !sameValue(value, generated[id])) throw new TypeError(`MUXUI_THEME_SCALE_ASSIGNMENT_INVALID: ${id}`);
    }
  }
  for (const [id, token] of Object.entries(tokens)) {
    if (token.overridePolicy === 'fixed' && Object.hasOwn(document.overrides, id) && !generated?.[id]) throw new TypeError(`MUXUI_THEME_FIXED_TOKEN: ${id}`);
  }
  compilePureTokenGraph(source, {
    overrides: document.overrides,
    allowReferenceOverrides: (id) => generated !== null && Object.hasOwn(generated, id),
    fail: (code, message) => { throw new TypeError(`${code}: ${message}`); },
  });
  return document;
}

export function serializeThemeAuthoringDocument(document, options) {
  return `${JSON.stringify(canonicalize(validateThemeAuthoringDocument(document, options)), null, 2)}\n`;
}

function typedColor(value) { return { type: 'color', unit: 'hex', value }; }
function typedRadius(rem) { return { type: 'dimension', unit: 'px', value: rem * 16, relative: { value: rem, unit: 'rem' } }; }
function foregroundChoice(palette, shade, pivot) {
  const shade5 = palette.find((entry) => entry.shade === 5)?.hex;
  const shade100 = palette.find((entry) => entry.shade === 100)?.hex;
  const background = palette.find((entry) => entry.shade === shade)?.hex;
  if (!shade5 || !shade100 || !background) return { light: '#ffffff', dark: '#000000', selected: '#ffffff', safe: false, ratio: 1, alternativeRatio: 1 };
  const lightRatio = contrastRatio(background, shade5);
  const darkRatio = contrastRatio(background, shade100);
  const selected = pivot === 'auto' ? (lightRatio >= darkRatio ? shade5 : shade100) : shade < pivot ? shade100 : shade5;
  const ratio = selected === shade5 ? lightRatio : darkRatio;
  const alternativeRatio = selected === shade5 ? darkRatio : lightRatio;
  return { light: shade5, dark: shade100, selected, safe: ratio >= 4.5, ratio, alternativeRatio };
}

// Dark neutral stops have an extra blackened canvas at 5, then map 10..100
// to the reversed 100..10 base stops. This is not a simple 27-stop reversal.
function modePalettes(named, neutral) {
  const blackened = `#${[1, 3, 5].map((offset) => Math.round(Number.parseInt(neutral.at(-1).hex.slice(offset, offset + 2), 16) * 0.85).toString(16).padStart(2, '0')).join('')}`;
  return {
    named: named.map(({ shade }, index) => ({ shade, hex: named[named.length - 1 - index].hex })),
    neutral: neutral.map(({ shade }, index) => ({ shade, hex: index === 0 ? blackened : neutral[neutral.length - index].hex })),
  };
}

export function generateScaleTheme(inputs) {
  assertRecord(inputs, 'scale');
  if (!['standard', 'named', 'mono', 'monochrome'].includes(inputs.mode)) throw new TypeError('MUXUI_THEME_SCALE_MODE_INVALID');
  if (inputs.whiteAnchor !== undefined && typeof inputs.whiteAnchor !== 'boolean') throw new TypeError('MUXUI_THEME_SCALE_WHITE_ANCHOR_INVALID');
  const source = inputs.source;
  assertSource(source, { source: 'muxui:token:default-theme', tokenContractVersion: '2.1.0' });
  const sourceScale = source.theme.scale;
  const namedShades = sourceScale.namedShades;
  const neutralShades = sourceScale.neutralShades;
  const radiusBase = sourceScale.radius.base;
  const radiusMultipliers = sourceScale.radius.multipliers;
  const mode = inputs.mode === 'mono' || inputs.mode === 'monochrome' ? 'monochrome' : 'named';
  assertHex(inputs.namedColor, 'scale.namedColor'); assertHex(inputs.neutralColor, 'scale.neutralColor');
  const pivot = inputs.contrastPivot ?? sourceScale.contrast.defaultPivot;
  if (!(pivot === 'auto' || sourceScale.contrast.pivots.includes(pivot))) throw new TypeError('MUXUI_THEME_SCALE_PIVOT_INVALID');
  const curvature = inputs.curvature ?? sourceScale.radius.curvature.default;
  if (typeof curvature !== 'number' || !Number.isFinite(curvature) || curvature < sourceScale.radius.curvature.minimum || curvature > sourceScale.radius.curvature.maximum) throw new TypeError('MUXUI_THEME_SCALE_CURVATURE_INVALID');
  const neutral = generatePalette(inputs.neutralColor, 'neutral', { whiteAnchor: Boolean(inputs.whiteAnchor), shades: neutralShades });
  const mono = mode === 'monochrome' ? generateMonochromePalette(inputs.namedColor, { whiteAnchor: Boolean(inputs.whiteAnchor) }).filter(({ shade }) => neutralShades.includes(shade)) : null;
  const named = mono ? mono.filter(({ shade }) => namedShades.includes(shade)) : generatePalette(inputs.namedColor, 'named', { shades: namedShades });
  const activeNeutral = mono ?? neutral;
  const assignments = {};
  for (const entry of named) assignments[`reference.color.brand-${entry.shade}`] = typedColor(entry.hex);
  for (const entry of activeNeutral) assignments[`reference.color.neutral-${entry.shade}`] = typedColor(entry.hex);

  const radiusAssignments = {};
  for (const [name, multiplier] of Object.entries(radiusMultipliers)) {
    radiusAssignments[`reference.dimension.radius-${name}`] = typedRadius(multiplier * radiusBase * curvature);
  }
  Object.assign(assignments, radiusAssignments);

  const foregrounds = { light: {}, dark: {} };
  const diagnostics = [];
  const darkPalettes = modePalettes(named, activeNeutral);
  const darkAssignments = { ...assignments };
  for (const entry of named) {
    const light = foregroundChoice(named, entry.shade, pivot);
    const dark = foregroundChoice(darkPalettes.named, entry.shade, pivot);
    foregrounds.light[entry.shade] = light.selected;
    foregrounds.dark[entry.shade] = dark.selected;
    assignments[`semantic.color.color-${entry.shade}-fg`] = typedColor(light.selected);
    darkAssignments[`semantic.color.color-${entry.shade}-fg`] = typedColor(dark.selected);
    if (!light.safe) diagnostics.push({ code: 'MUXUI_SCALE_CONTRAST_UNSAFE', token: `semantic.color.color-${entry.shade}-fg`, shade: entry.shade, ratio: Number(light.ratio.toFixed(3)), alternativeRatio: Number(light.alternativeRatio.toFixed(3)), pivot });
    if (!dark.safe) diagnostics.push({ code: 'MUXUI_SCALE_CONTRAST_UNSAFE', colorScheme: 'dark', token: `semantic.color.color-${entry.shade}-fg`, shade: entry.shade, ratio: Number(dark.ratio.toFixed(3)), alternativeRatio: Number(dark.alternativeRatio.toFixed(3)), pivot });
  }
  for (const entry of activeNeutral) {
    const light = foregroundChoice(activeNeutral, entry.shade, pivot === 'auto' ? 60 : pivot);
    const dark = foregroundChoice(darkPalettes.neutral, entry.shade, pivot === 'auto' ? 60 : pivot);
    foregrounds.light[`neutral-${entry.shade}`] = light.selected;
    foregrounds.dark[`neutral-${entry.shade}`] = dark.selected;
    assignments[`semantic.color.neutral-${entry.shade}-fg`] = typedColor(light.selected);
    darkAssignments[`semantic.color.neutral-${entry.shade}-fg`] = {
      ...typedColor(dark.selected),
      ...(dark.selected === darkPalettes.neutral[0].hex ? { mix: { space: 'srgb', token: 'semantic.color.neutral-10', color: '#000000', weight: 0.85 } } : {}),
    };
    if (!light.safe) diagnostics.push({ code: 'MUXUI_SCALE_CONTRAST_UNSAFE', token: `semantic.color.neutral-${entry.shade}-fg`, shade: entry.shade, ratio: Number(light.ratio.toFixed(3)), alternativeRatio: Number(light.alternativeRatio.toFixed(3)), pivot });
    if (!dark.safe) diagnostics.push({ code: 'MUXUI_SCALE_CONTRAST_UNSAFE', colorScheme: 'dark', token: `semantic.color.neutral-${entry.shade}-fg`, shade: entry.shade, ratio: Number(dark.ratio.toFixed(3)), alternativeRatio: Number(dark.alternativeRatio.toFixed(3)), pivot });
  }
  return {
    mode,
    presetId: inputs.presetId,
    palettes: { named, neutral: activeNeutral },
    assignments,
    overrides: assignments,
    assignmentsByMode: { light: assignments, dark: darkAssignments },
    radius: { curvature, unit: 'rem', base: radiusBase, multipliers: radiusMultipliers },
    contrast: { pivot, foregrounds },
    diagnostics,
  };
}

function selectModes(document, source, modes) {
  if (modes !== undefined && (!isRecord(modes) || Object.keys(modes).some((axis) => !Object.hasOwn(document.modes, axis)))) throw new TypeError('MUXUI_THEME_MODES_INVALID');
  const selected = {};
  for (const axis of ['colorScheme', 'contrast', 'motion', 'density', 'direction']) {
    const value = modes?.[axis] ?? (document.modes[axis].includes(source.theme.defaultModes[axis]) ? source.theme.defaultModes[axis] : document.modes[axis][0]);
    if (!document.modes[axis].includes(value) || !source.theme.modeAxes[axis].includes(value)) throw new TypeError(`MUXUI_THEME_MODE_UNKNOWN: ${axis}.${value}`);
    selected[axis] = value;
  }
  return selected;
}

function nativeTheme(tokens, target, rootFontSizePx) {
  if (rootFontSizePx !== undefined && (!Number.isFinite(rootFontSizePx) || rootFontSizePx <= 0)) throw new TypeError('MUXUI_THEME_ROOT_METRIC_INVALID');
  const diagnostics = [];
  const output = {};
  for (const [id, token] of Object.entries(tokens)) {
    const code = token.fluid ? 'MUXUI_THEME_FLUID_RECIPE_DEFERRED'
      : token.formula ? 'MUXUI_THEME_FORMULA_DEFERRED'
        : token.relative && rootFontSizePx === undefined ? 'MUXUI_THEME_RELATIVE_ROOT_METRIC_REQUIRED' : null;
    if (code) { diagnostics.push({ code, id, target }); continue; }
    output[id] = Object.freeze({ ...token, ...(token.relative ? { value: token.relative.value * rootFontSizePx } : {}) });
  }
  return { tokens: Object.freeze(output), diagnostics: Object.freeze(diagnostics) };
}

export function compileThemeAuthoringDocument(document, { source, target = 'web.css', selector = ':root', modes, responsive = false, rootFontSizePx } = {}) {
  validateThemeAuthoringDocument(document, { source });
  if (!['web.css', 'native.ios', 'native.android'].includes(target)) throw new TypeError(`MUXUI_THEME_TARGET_UNSUPPORTED: ${target}`);
  if (typeof selector !== 'string' || !/^:root$|^(?:\.[a-z][a-z0-9_-]*)+$/u.test(selector)) throw new TypeError('MUXUI_THEME_SELECTOR_INVALID');
  if (!isRecord(source) || !isRecord(source.tokens)) throw new TypeError('MUXUI_THEME_SOURCE_REQUIRED');
  const generated = document.scale === undefined ? null : generateScaleTheme({ source, ...document.scale });
  const selectedModes = selectModes(document, source, modes);
  const diagnostics = generated?.diagnostics.filter(({ colorScheme = 'light' }) => colorScheme === selectedModes.colorScheme) ?? [];
  const scaleOverrides = generated?.assignmentsByMode?.[selectedModes.colorScheme] ?? generated?.assignments ?? {};
  const overrides = generated === null ? document.overrides : {
    ...document.overrides,
    ...Object.fromEntries(Object.keys(generated.assignments).map((id) => [id, scaleOverrides[id] ?? document.overrides[id]])),
  };
  const graph = compilePureTokenGraph(source, {
    modes: selectedModes,
    responsive,
    overrides,
    allowReferenceOverrides: (id) => generated !== null && Object.hasOwn(generated.assignments, id),
    fail: (code, message) => { throw new TypeError(`${code}: ${message}`); },
  });
  const tokens = graph.tokens;
  if (target === 'web.css') return { css: `${selector} {\n${Object.values(tokens).sort((left, right) => left.id.localeCompare(right.id)).map((token) => cssDeclaration(token, graph.dependencies)).join('\n')}\n}`, tokens, modes: graph.modes, diagnostics };
  const native = nativeTheme(tokens, target, rootFontSizePx);
  return { tokens: native.tokens, modes: graph.modes, diagnostics: [...diagnostics, ...native.diagnostics] };
}
