import {
  compileThemeAuthoringDocument,
  generateScaleTheme,
  getScaleApcaContrast,
  getScaleContrastRatio,
  randomScaleBaseColor,
  scaleForegrounds,
  serializeThemeAuthoringDocument,
  validateThemeAuthoringDocument,
} from '@muxui/tokens/authoring';
import { compilePureTokenGraph } from '@muxui/tokens/core';
import defaultThemeSource from '../../../catalog/tokens/default-theme.json' with { type: 'json' };

const HEX = /^#[0-9a-f]{6}$/iu;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SCALE_KEYS = ['mode', 'presetId', 'namedColor', 'neutralColor', 'whiteAnchor', 'contrastPivot', 'contrastAlgorithm', 'curvature'];
const scaleMetadata = defaultThemeSource.theme.scale;
const sourceTokens = compilePureTokenGraph(defaultThemeSource).tokens;
export const STANDARD_PRESETS = Object.freeze(scaleMetadata.standardPresets.map(({ id, name, namedColor, neutralColor }) => Object.freeze([id, name, sourceTokens[namedColor].value, sourceTokens[neutralColor].value])));
export const MONO_PRESETS = Object.freeze(scaleMetadata.monochromePresets.map(({ id, name, color }) => Object.freeze([id, name, sourceTokens[color].value])));
export const NAMED_STEPS = Object.freeze([...scaleMetadata.namedShades]);
export const NEUTRAL_STEPS = Object.freeze([...scaleMetadata.neutralShades]);
export const RADIUS_TOKENS = Object.freeze(Object.entries(scaleMetadata.radius.multipliers));
export const RADIUS_SETTINGS = Object.freeze({ ...scaleMetadata.radius.curvature });
const CONTRAST_METHOD_NAMES = { 'wcag2-endpoint-v1': 'WCAG 2', 'apca-endpoint-v1': 'APCA' };
export const CONTRAST_METHODS = Object.freeze(scaleMetadata.contrast.algorithms.map((id) => Object.freeze([id, CONTRAST_METHOD_NAMES[id] ?? id])));
const typographyMetadata = defaultThemeSource.theme.typography.roles;
const typographyRoleEntries = Object.entries(typographyMetadata).map(([id, definition]) => {
  const variants = Object.entries(definition.variants).map(([name, variant]) => Object.freeze({
    name,
    fontSize: variant.fontSize,
    fontWeight: variant.fontWeight,
    lineHeight: variant.lineHeight,
    letterSpacing: variant.letterSpacing,
  }));
  const representative = variants.find(({ name }) => name === 'm') ?? variants[0];
  return Object.freeze({
    id,
    family: definition.fontFamily,
    color: definition.color,
    metricGroup: representative.fontWeight.replace(/^semantic\.typography\./u, '').replace(/-font-weight$/u, ''),
    representativeVariant: representative.name,
    metrics: Object.freeze({
      fontWeight: representative.fontWeight,
      lineHeight: representative.lineHeight,
      letterSpacing: representative.letterSpacing,
    }),
    variants: Object.freeze(variants),
  });
});
export const TYPOGRAPHY_ROLES = Object.freeze(typographyRoleEntries);
const typographyMetricGroups = [...new Map(
  typographyRoleEntries.map((role) => [role.metricGroup, Object.freeze({
    id: role.metricGroup,
    metrics: role.metrics,
  })]),
).values()];
export const TYPOGRAPHY_METRIC_GROUPS = Object.freeze(typographyMetricGroups);
const typographyTokenIds = [...new Set(typographyRoleEntries.flatMap(({ variants }) => variants.flatMap(({ fontSize, fontWeight, lineHeight, letterSpacing }) => [fontSize, fontWeight, lineHeight, letterSpacing])))];
export const TYPOGRAPHY_TOKEN_DEFAULTS = Object.freeze(Object.fromEntries(typographyTokenIds.map((id) => {
  const token = sourceTokens[id];
  return [id, Object.freeze({ type: token.type, unit: token.unit, value: token.value })];
})));
const defaultPreset = STANDARD_PRESETS.find(([id]) => id === scaleMetadata.defaults.standard);
export const DEFAULT_SETTINGS = Object.freeze({ presetId: defaultPreset[0], family: 'standard', namedColor: defaultPreset[2], neutralColor: defaultPreset[3], contrastPivot: scaleMetadata.contrast.defaultPivot, contrastAlgorithm: scaleMetadata.contrast.defaultAlgorithm, whiteAnchor: false, curvature: RADIUS_SETTINGS.default, background: 'light', colorMode: 'light', additionalOverrides: {}, themeModes: structuredClone(defaultThemeSource.theme.modeAxes) });
export const BACKGROUNDS = Object.freeze([['light', 'Light'], ['dark', 'Dark'], ['accent', 'Accent']]);

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function assertKeys(value, allowed, path) { if (!isRecord(value)) throw new TypeError(`MUXUI_SCALE_OBJECT_INVALID: ${path}`); for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new TypeError(`MUXUI_SCALE_UNKNOWN_FIELD: ${path}.${key}`); }
export function assertHex(value, path = 'color') { if (typeof value !== 'string' || !HEX.test(value)) throw new TypeError(`MUXUI_SCALE_COLOR_INVALID: ${path}`); return value.toLowerCase(); }
export function assertSlug(value) { if (typeof value !== 'string' || value.length < 1 || value.length > 48 || !SLUG.test(value)) throw new TypeError('MUXUI_SCALE_SLUG_INVALID'); return value; }

function assertScaleInputs(scale) {
  assertKeys(scale, SCALE_KEYS, 'scale');
  if (!['standard', 'mono'].includes(scale.mode)) throw new TypeError('MUXUI_SCALE_MODE_INVALID');
  if (typeof scale.presetId !== 'string' || scale.presetId.length < 1 || scale.presetId.length > 48 || !SLUG.test(scale.presetId)) throw new TypeError('MUXUI_SCALE_PRESET_INVALID');
  assertHex(scale.namedColor, 'scale.namedColor'); assertHex(scale.neutralColor, 'scale.neutralColor');
  if (typeof scale.whiteAnchor !== 'boolean') throw new TypeError('MUXUI_SCALE_INPUTS_INVALID: whiteAnchor');
  if (!(scale.contrastPivot === 'auto' || (Number.isInteger(scale.contrastPivot) && NAMED_STEPS.includes(scale.contrastPivot)))) throw new TypeError('MUXUI_SCALE_INPUTS_INVALID: contrastPivot');
  if (!scaleMetadata.contrast.algorithms.includes(scale.contrastAlgorithm)) throw new TypeError('MUXUI_SCALE_INPUTS_INVALID: contrastAlgorithm');
  if (typeof scale.curvature !== 'number' || !Number.isFinite(scale.curvature) || scale.curvature < RADIUS_SETTINGS.minimum || scale.curvature > RADIUS_SETTINGS.maximum) throw new TypeError('MUXUI_SCALE_INPUTS_INVALID: curvature');
}

function scaleInputsFromSettings(settings) {
  return {
    mode: settings.family,
    presetId: settings.presetId,
    namedColor: assertHex(settings.namedColor, 'namedColor'),
    neutralColor: assertHex(settings.neutralColor, 'neutralColor'),
    whiteAnchor: settings.whiteAnchor,
    contrastPivot: settings.contrastPivot,
    contrastAlgorithm: settings.contrastAlgorithm,
    curvature: settings.curvature,
  };
}

function assertScaleDocumentShape(document) {
  if (!isRecord(document)) throw new TypeError('MUXUI_SCALE_DOCUMENT_INVALID');
  if (typeof document.id !== 'string' || !document.id.startsWith('muxui:theme:')) throw new TypeError('MUXUI_SCALE_SOURCE_ID_INVALID');
  assertSlug(document.id.slice('muxui:theme:'.length));
  if (!isRecord(document.scale)) throw new TypeError('MUXUI_SCALE_INPUTS_INVALID');
}

export function validateScaleDocument(document) {
  assertScaleDocumentShape(document);
  validateThemeAuthoringDocument(document, { source: defaultThemeSource });
  return document;
}

export function createScaleDocument(settings, { slug = 'draft' } = {}) {
  assertSlug(slug);
  const inputs = scaleInputsFromSettings(settings);
  assertScaleInputs(inputs);
  const generated = generateScaleTheme({ source: defaultThemeSource, ...inputs });
  const additionalOverrides = settings.additionalOverrides ?? {};
  assertRecordOverrides(additionalOverrides, generated.assignments);
  return validateScaleDocument({ schema: 'muxui-theme-authoring-v1', id: `muxui:theme:${slug}`, source: defaultThemeSource.id, tokenContractVersion: defaultThemeSource.tokenContractVersion, modes: structuredClone(settings.themeModes ?? defaultThemeSource.theme.modeAxes), overrides: { ...additionalOverrides, ...generated.assignments }, scale: inputs });
}

function assertRecordOverrides(overrides, assignments) {
  if (!isRecord(overrides)) throw new TypeError('MUXUI_SCALE_OVERRIDES_INVALID');
  if (Object.keys(overrides).some((id) => Object.hasOwn(assignments, id))) throw new TypeError('MUXUI_SCALE_OVERRIDE_CONFLICT');
}

export function settingsFromDocument(document) {
  validateScaleDocument(document);
  const generated = generateScaleTheme({ source: defaultThemeSource, ...document.scale });
  const colorMode = document.modes.colorScheme.includes(defaultThemeSource.theme.defaultModes.colorScheme) ? defaultThemeSource.theme.defaultModes.colorScheme : document.modes.colorScheme[0];
  return { ...DEFAULT_SETTINGS, family: document.scale.mode, presetId: document.scale.presetId, namedColor: document.scale.namedColor, neutralColor: document.scale.neutralColor, whiteAnchor: document.scale.whiteAnchor, contrastPivot: document.scale.contrastPivot, contrastAlgorithm: document.scale.contrastAlgorithm ?? DEFAULT_SETTINGS.contrastAlgorithm, curvature: document.scale.curvature, colorMode, background: colorMode, themeModes: structuredClone(document.modes), additionalOverrides: Object.fromEntries(Object.entries(document.overrides).filter(([id]) => !Object.hasOwn(generated.assignments, id)).map(([id, value]) => [id, structuredClone(value)])) };
}
// The shared serializer runs the full authoring validation, so only Scale's own checks run here.
export function serializeScaleDocument(document) {
  assertScaleDocumentShape(document);
  return serializeThemeAuthoringDocument(document, { source: defaultThemeSource });
}

// Scale treats settings objects as immutable, so one validated document per
// settings object serves validation, the embedded draft, and the preview.
// Callers only receive copies with a replaced id and must not mutate them.
const settingsDocuments = new WeakMap();
function settingsDocument(settings) {
  let document = settingsDocuments.get(settings);
  if (!document) {
    document = createScaleDocument(settings);
    settingsDocuments.set(settings, document);
  }
  return document;
}
function withSlug(document, slug) { return { ...document, id: `muxui:theme:${assertSlug(slug)}` }; }
export function draftScaleDocument(settings, slug) { return withSlug(settingsDocument(settings), slug); }
export function presetSettings(family, presetId) {
  if (!['standard', 'mono'].includes(family)) throw new TypeError('MUXUI_SCALE_MODE_INVALID');
  const preset = (family === 'mono' ? MONO_PRESETS : STANDARD_PRESETS).find(([id]) => id === presetId);
  if (!preset) throw new TypeError('MUXUI_SCALE_PRESET_INVALID');
  return { family, presetId: preset[0], namedColor: preset[2], neutralColor: family === 'mono' ? preset[2] : preset[3] };
}

// Scale swatches are projected from the shared typed palette result.
export function previewPalette(settings, kind, steps) {
  const generated = generateScaleTheme({ source: defaultThemeSource, ...scaleInputsFromSettings(settings) });
  const palette = generated.palettes[kind];
  if (!palette) throw new TypeError('MUXUI_SCALE_PALETTE_PROJECTION_INVALID');
  const byStep = new Map(palette.map(({ shade, hex }) => [shade, hex]));
  return steps.map((step) => {
    const value = byStep.get(step);
    if (typeof value !== 'string') throw new TypeError(`MUXUI_SCALE_PALETTE_STEP_MISSING: ${kind}-${step}`);
    return { step, value };
  });
}
const PREVIEW_SELECTOR = '.muxui-scale-preview';
export function previewTheme(settings, { selector = PREVIEW_SELECTOR, modes = { colorScheme: settings.colorMode } } = {}) {
  const compiled = compileThemeAuthoringDocument(withSlug(settingsDocument(settings), 'preview'), {
    source: defaultThemeSource,
    target: 'web.css',
    selector,
    modes,
  });
  if (!compiled || typeof compiled.css !== 'string') throw new TypeError('MUXUI_SCALE_CSS_PROJECTION_INVALID');
  return compiled;
}
export function previewCss(settings, options) { return previewTheme(settings, options).css; }
// The compiler emits the selector only as the block prefix, so CSS compiled for
// the default preview selector becomes the copyable `:root` CSS for the same modes.
export function rootCssFromPreview(css) {
  if (!css.startsWith(`${PREVIEW_SELECTOR} {`)) throw new TypeError('MUXUI_SCALE_CSS_PROJECTION_INVALID');
  return `:root${css.slice(PREVIEW_SELECTOR.length)}`;
}

const WCAG_ALGORITHM = 'wcag2-endpoint-v1';
const OPAQUE_HEX = /^#[0-9a-f]{6}$/iu;
// A translucent colour has no single contrast score, so it reads as n/a without a badge.
const NO_SCORE = Object.freeze({ score: null, label: 'n/a', badge: null });
// Badge tiers: WCAG compares the ratio, APCA the absolute Lc.
function contrastReadout(algorithm, background, text) {
  if (!OPAQUE_HEX.test(background) || !OPAQUE_HEX.test(text ?? '')) return NO_SCORE;
  if (algorithm === WCAG_ALGORITHM) {
    const score = getScaleContrastRatio(background, text);
    return { score, label: `${score.toFixed(2)}:1`, badge: score >= 7 ? 'AAA' : score >= 4.5 ? 'AA' : score >= 3 ? 'AA·LG' : 'Fail' };
  }
  const score = Math.abs(getScaleApcaContrast(text, background));
  return { score, label: `Lc ${Math.round(score)}`, badge: score >= 75 ? '75+' : score >= 60 ? '60+' : score >= 45 ? '45+' : 'Fail' };
}

/**
 * Swatches for one compiled palette. `ratio`, `label` and `badge` score the
 * compiled foreground against the compiled background under the active
 * `algorithm` (`ratio` is the WCAG ratio or the absolute APCA Lc). `methods`
 * lists both methods for the readout: the active entry describes that same
 * compiled foreground, and the other entry is the text it would choose over the
 * compiled palette. Imported overrides can recolour a shade (even to a
 * translucent value), so scores that cannot be computed are `n/a`.
 */
export function previewSwatches(compiled, kind, steps, { pivot, algorithm }) {
  if (!scaleMetadata.contrast.algorithms.includes(algorithm)) throw new TypeError('MUXUI_SCALE_INPUTS_INVALID: contrastAlgorithm');
  const prefix = kind === 'named' ? 'color' : 'neutral';
  const palette = (kind === 'named' ? NAMED_STEPS : NEUTRAL_STEPS).map((shade) => ({ shade, hex: compiled.tokens[`semantic.color.${prefix}-${shade}`].value }));
  // Only opaque shades can be scored, and both endpoints must be among them.
  const opaque = palette.filter(({ hex }) => OPAQUE_HEX.test(hex));
  const scorable = [5, 100].every((shade) => opaque.some((entry) => entry.shade === shade));
  const choices = CONTRAST_METHODS.map(([id, name]) => [id, name, new Map(scorable ? scaleForegrounds(opaque, { pivot, algorithm: id }).map((choice) => [choice.shade, choice.text]) : [])]);
  return steps.map((step) => {
    const background = compiled.tokens[`semantic.color.${prefix}-${step}`].value;
    const foreground = compiled.tokens[`semantic.color.${prefix}-${step}-fg`].value;
    const active = contrastReadout(algorithm, background, foreground);
    return {
      step, value: background, background, foreground, ratio: active.score, label: active.label, badge: active.badge,
      methods: choices.map(([id, name, texts]) => id === algorithm
        ? { algorithm: id, name, text: foreground, ...active }
        : { algorithm: id, name, text: texts.get(step) ?? null, ...contrastReadout(id, background, texts.get(step)) }),
    };
  });
}

export function radiusValue(multiplier, factor) { return `${multiplier * scaleMetadata.radius.base * factor}rem`; }

export function validateScaleSettings(settings) {
  assertKeys(settings, Object.keys(DEFAULT_SETTINGS), 'settings');
  if (!['standard', 'mono'].includes(settings.family) || !BACKGROUNDS.some(([value]) => value === settings.background)
    || !settings.themeModes?.colorScheme?.includes(settings.colorMode)
    || (settings.background === 'light') !== (settings.colorMode === 'light')) throw new TypeError('MUXUI_SCALE_SETTINGS_INVALID');
  if (typeof settings.whiteAnchor !== 'boolean') throw new TypeError('MUXUI_SCALE_SETTINGS_INVALID');
  settingsDocument(settings);
  return settings;
}

export function randomScaleSettings(settings, { random = Math.random, kind = 'both' } = {}) {
  if (!['named', 'neutral', 'both'].includes(kind)) throw new TypeError('MUXUI_SCALE_PALETTE_PROJECTION_INVALID');
  const options = { whiteAnchor: settings.whiteAnchor, random };
  if (settings.family === 'mono') {
    const color = randomScaleBaseColor('monochrome', options);
    return { ...settings, presetId: 'custom', namedColor: color, neutralColor: color };
  }
  return { ...settings, presetId: 'custom',
    namedColor: kind === 'neutral' ? settings.namedColor : randomScaleBaseColor('named', options),
    neutralColor: kind === 'named' ? settings.neutralColor : randomScaleBaseColor('neutral', options),
  };
}
