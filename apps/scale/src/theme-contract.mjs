import {
  compileThemeAuthoringDocument,
  generateScaleTheme,
  getScaleContrastRatio,
  randomScaleBaseColor,
  serializeThemeAuthoringDocument,
  validateThemeAuthoringDocument,
} from '@muxui/tokens/authoring';
import { compilePureTokenGraph } from '@muxui/tokens/core';
import defaultThemeSource from '../../../catalog/tokens/default-theme.json' with { type: 'json' };

const HEX = /^#[0-9a-f]{6}$/iu;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SCALE_KEYS = ['mode', 'presetId', 'namedColor', 'neutralColor', 'whiteAnchor', 'contrastPivot', 'curvature'];
const scaleMetadata = defaultThemeSource.theme.scale;
const sourceTokens = compilePureTokenGraph(defaultThemeSource).tokens;
export const STANDARD_PRESETS = Object.freeze(scaleMetadata.standardPresets.map(({ id, name, namedColor, neutralColor }) => Object.freeze([id, name, sourceTokens[namedColor].value, sourceTokens[neutralColor].value])));
export const MONO_PRESETS = Object.freeze(scaleMetadata.monochromePresets.map(({ id, name, color }) => Object.freeze([id, name, sourceTokens[color].value])));
export const NAMED_STEPS = Object.freeze([...scaleMetadata.namedShades]);
export const NEUTRAL_STEPS = Object.freeze([...scaleMetadata.neutralShades]);
export const RADIUS_TOKENS = Object.freeze(Object.entries(scaleMetadata.radius.multipliers));
export const RADIUS_SETTINGS = Object.freeze({ ...scaleMetadata.radius.curvature });
const defaultPreset = STANDARD_PRESETS.find(([id]) => id === scaleMetadata.defaults.standard);
export const DEFAULT_SETTINGS = Object.freeze({ presetId: defaultPreset[0], family: 'standard', namedColor: defaultPreset[2], neutralColor: defaultPreset[3], contrastPivot: scaleMetadata.contrast.defaultPivot, whiteAnchor: false, curvature: RADIUS_SETTINGS.default, background: 'light', colorMode: 'light', additionalOverrides: {}, themeModes: structuredClone(defaultThemeSource.theme.modeAxes) });
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
    curvature: settings.curvature,
  };
}

export function validateScaleDocument(document) {
  if (!isRecord(document)) throw new TypeError('MUXUI_SCALE_DOCUMENT_INVALID');
  if (typeof document.id !== 'string' || !document.id.startsWith('muxui:theme:')) throw new TypeError('MUXUI_SCALE_SOURCE_ID_INVALID');
  assertSlug(document.id.slice('muxui:theme:'.length));
  if (!isRecord(document.scale)) throw new TypeError('MUXUI_SCALE_INPUTS_INVALID');
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
  return { ...DEFAULT_SETTINGS, family: document.scale.mode, presetId: document.scale.presetId, namedColor: document.scale.namedColor, neutralColor: document.scale.neutralColor, whiteAnchor: document.scale.whiteAnchor, contrastPivot: document.scale.contrastPivot, curvature: document.scale.curvature, colorMode, background: colorMode, themeModes: structuredClone(document.modes), additionalOverrides: Object.fromEntries(Object.entries(document.overrides).filter(([id]) => !Object.hasOwn(generated.assignments, id)).map(([id, value]) => [id, structuredClone(value)])) };
}
export function serializeScaleDocument(document) { return serializeThemeAuthoringDocument(validateScaleDocument(document), { source: defaultThemeSource }); }
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
export function previewTheme(settings, { selector = '.muxui-scale-preview' } = {}) {
  const compiled = compileThemeAuthoringDocument(createScaleDocument(settings, { slug: 'preview' }), {
    source: defaultThemeSource,
    target: 'web.css',
    selector,
    modes: { colorScheme: settings.colorMode },
  });
  if (!compiled || typeof compiled.css !== 'string') throw new TypeError('MUXUI_SCALE_CSS_PROJECTION_INVALID');
  return compiled;
}
export function previewCss(settings, options) { return previewTheme(settings, options).css; }

export function previewSwatches(compiled, kind, steps) {
  const prefix = kind === 'named' ? 'color' : 'neutral';
  return steps.map((step) => {
    const background = compiled.tokens[`semantic.color.${prefix}-${step}`].value;
    const foreground = compiled.tokens[`semantic.color.${prefix}-${step}-fg`].value;
    const ratio = getScaleContrastRatio(background, foreground);
    return { step, value: background, background, foreground, ratio, badge: ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA·LG' : 'Fail' };
  });
}

export function radiusValue(multiplier, factor) { return `${multiplier * scaleMetadata.radius.base * factor}rem`; }

export function validateScaleSettings(settings) {
  assertKeys(settings, Object.keys(DEFAULT_SETTINGS), 'settings');
  if (!['standard', 'mono'].includes(settings.family) || !BACKGROUNDS.some(([value]) => value === settings.background)
    || !settings.themeModes?.colorScheme?.includes(settings.colorMode)
    || (settings.background === 'light') !== (settings.colorMode === 'light')) throw new TypeError('MUXUI_SCALE_SETTINGS_INVALID');
  if (typeof settings.whiteAnchor !== 'boolean') throw new TypeError('MUXUI_SCALE_SETTINGS_INVALID');
  createScaleDocument(settings);
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
