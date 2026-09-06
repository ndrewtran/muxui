import {
  compileThemeAuthoringDocument,
  generateScaleTheme,
  randomScaleBaseColor,
  serializeThemeAuthoringDocument,
  validateThemeAuthoringDocument,
} from '@muxui/tokens/authoring';
import defaultThemeSource from '../../../catalog/tokens/default-theme.json' with { type: 'json' };

const HEX = /^#[0-9a-f]{6}$/iu;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SOURCE_KEYS = ['schema', 'id', 'source', 'tokenContractVersion', 'modes', 'overrides', 'scale'];
const SCALE_KEYS = ['mode', 'presetId', 'namedColor', 'neutralColor', 'whiteAnchor', 'contrastPivot', 'curvature'];

export const DEFAULT_SETTINGS = Object.freeze({ presetId: 'harbour', family: 'standard', namedColor: '#025768', neutralColor: '#79716b', contrastPivot: 'auto', whiteAnchor: false, curvature: 1, background: 'light', colorMode: 'light' });
export const STANDARD_PRESETS = Object.freeze([
  ['harbour', 'Harbour', '#025768', '#79716b'], ['lagoon', 'Lagoon', '#006a6b', '#677472'], ['blueprint', 'Blueprint', '#215d9a', '#68717a'], ['violet-dusk', 'Violet Dusk', '#6552a3', '#706d78'], ['wildflower', 'Wildflower', '#8f3d65', '#746b70'], ['terracotta', 'Terracotta', '#9b3f35', '#756b68'], ['amber-grove', 'Amber Grove', '#8a5a0a', '#756f64'], ['fern', 'Fern', '#3b6b43', '#6a7169'],
]);
export const MONO_PRESETS = Object.freeze([
  ['antique', 'Antique', '#936400'], ['forest', 'Forest', '#317d00'], ['mauve', 'Mauve', '#9b5267'], ['mountain-meadow', 'Mountain Meadow', '#007e64'], ['rosewater', 'Rosewater', '#c60648'], ['teal', 'Teal', '#25778d'], ['terracotta', 'Terracotta', '#a64300'],
]);
export const NAMED_STEPS = Object.freeze([5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
export const NEUTRAL_STEPS = Object.freeze([5, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100]);
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
  if (typeof scale.curvature !== 'number' || !Number.isFinite(scale.curvature) || scale.curvature < 0 || scale.curvature > 2) throw new TypeError('MUXUI_SCALE_INPUTS_INVALID: curvature');
}

function scaleInputsFromSettings(settings) {
  return {
    mode: settings.family === 'mono' ? 'mono' : 'standard',
    presetId: settings.presetId,
    namedColor: assertHex(settings.namedColor, 'namedColor'),
    neutralColor: assertHex(settings.neutralColor, 'neutralColor'),
    whiteAnchor: Boolean(settings.whiteAnchor),
    contrastPivot: settings.contrastPivot === 'auto' ? 'auto' : Number(settings.contrastPivot),
    curvature: Number(settings.curvature),
  };
}

export function validateScaleDocument(document) {
  if (!isRecord(document)) throw new TypeError('MUXUI_SCALE_DOCUMENT_INVALID');
  assertKeys(document, SOURCE_KEYS, 'document');
  if (document.schema !== 'muxui-theme-authoring-v1') throw new TypeError('MUXUI_SCALE_SCHEMA_INVALID');
  if (typeof document.id !== 'string' || !document.id.startsWith('muxui:theme:')) throw new TypeError('MUXUI_SCALE_SOURCE_ID_INVALID');
  assertSlug(document.id.slice('muxui:theme:'.length));
  if (document.source !== 'muxui:token:default-theme') throw new TypeError('MUXUI_SCALE_SOURCE_INVALID');
  if (document.tokenContractVersion !== '2.1.0') throw new TypeError('MUXUI_SCALE_TOKEN_CONTRACT_INVALID');
  if (!isRecord(document.modes)) throw new TypeError('MUXUI_SCALE_MODES_INVALID');
  for (const axis of ['colorScheme', 'contrast', 'motion', 'density', 'direction']) if (!Array.isArray(document.modes[axis]) || document.modes[axis].length < 1 || document.modes[axis].some((value) => typeof value !== 'string')) throw new TypeError(`MUXUI_SCALE_MODE_INVALID: ${axis}`);
  if (!isRecord(document.overrides)) throw new TypeError('MUXUI_SCALE_OVERRIDES_INVALID');
  if (!isRecord(document.scale)) throw new TypeError('MUXUI_SCALE_INPUTS_INVALID');
  assertScaleInputs(document.scale);
  validateThemeAuthoringDocument(document, { source: defaultThemeSource });
  return document;
}

export function createScaleDocument(settings, { slug = 'draft' } = {}) {
  assertSlug(slug);
  const inputs = scaleInputsFromSettings(settings);
  assertScaleInputs(inputs);
  const generated = generateScaleTheme({ source: defaultThemeSource, ...inputs });
  return { schema: 'muxui-theme-authoring-v1', id: `muxui:theme:${slug}`, source: 'muxui:token:default-theme', tokenContractVersion: '2.1.0', modes: { colorScheme: ['light', 'dark'], contrast: ['standard', 'more'], motion: ['full', 'reduced'], density: ['comfortable', 'compact'], direction: ['ltr', 'rtl'] }, overrides: generated.overrides ?? generated.assignments ?? generated.tokens ?? {}, scale: inputs };
}

export function documentFromSettings(settings, options = {}) { return validateScaleDocument(createScaleDocument(settings, options)); }
export function settingsFromDocument(document) { validateScaleDocument(document); return { ...DEFAULT_SETTINGS, family: document.scale.mode, presetId: document.scale.presetId, namedColor: document.scale.namedColor, neutralColor: document.scale.neutralColor, whiteAnchor: document.scale.whiteAnchor, contrastPivot: String(document.scale.contrastPivot), curvature: document.scale.curvature }; }
export function serializeScaleDocument(document) { return serializeThemeAuthoringDocument(validateScaleDocument(document), { source: defaultThemeSource }); }
export function digestScaleDocument(document) { return `source:${validateScaleDocument(document).id}`; }
export function presetSettings(family, presetId) { const list = family === 'mono' ? MONO_PRESETS : STANDARD_PRESETS; const preset = list.find(([id]) => id === presetId) ?? list[0]; return family === 'mono' ? { ...DEFAULT_SETTINGS, family, presetId: preset[0], namedColor: preset[2], neutralColor: preset[2] } : { ...DEFAULT_SETTINGS, family, presetId: preset[0], namedColor: preset[2], neutralColor: preset[3] }; }

// Scale swatches are projected from the shared typed palette result.
export function previewPalette(settings, kind, steps) {
  const generated = generateScaleTheme({ source: defaultThemeSource, ...scaleInputsFromSettings(settings) });
  const palettes = generated.palettes ?? {};
  const palette = palettes[kind] ?? generated[`${kind}Palette`] ?? generated[kind] ?? [];
  const entries = Array.isArray(palette) ? palette : Object.entries(palette).map(([step, value]) => ({ step, value }));
  if (!Array.isArray(entries)) throw new TypeError('MUXUI_SCALE_PALETTE_PROJECTION_INVALID');
  const byStep = new Map(entries.map((entry) => [Number(entry.step ?? entry.shade), entry.hex ?? entry.value]));
  return steps.map((step) => {
    const value = byStep.get(step);
    if (typeof value !== 'string') throw new TypeError(`MUXUI_SCALE_PALETTE_STEP_MISSING: ${kind}-${step}`);
    return { step, value };
  });
}
export function previewCss(settings) {
  const compiled = compileThemeAuthoringDocument(createScaleDocument(settings, { slug: 'preview' }), {
    source: defaultThemeSource,
    target: 'web.css',
    selector: '.muxui-scale-preview',
    modes: {
      colorScheme: settings.colorMode,
      contrast: 'standard',
      motion: 'full',
      density: 'comfortable',
      direction: 'ltr',
    },
  });
  if (!compiled || typeof compiled.css !== 'string') throw new TypeError('MUXUI_SCALE_CSS_PROJECTION_INVALID');
  return compiled.css;
}

export function randomScaleSettings(settings, { random = Math.random } = {}) {
  const namedMode = settings.family === 'mono' ? 'monochrome' : 'named';
  return {
    ...settings,
    presetId: 'custom',
    namedColor: randomScaleBaseColor(namedMode, { source: defaultThemeSource, whiteAnchor: Boolean(settings.whiteAnchor), random }),
    neutralColor: randomScaleBaseColor('neutral', { source: defaultThemeSource, whiteAnchor: Boolean(settings.whiteAnchor), random }),
  };
}
