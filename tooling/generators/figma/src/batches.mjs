/*
 * Split a component spec into ordered, self-contained applier scripts. Glyph
 * components come first so variants can instance them, then each family's
 * variants in spec order; the next-to-last script reports orphans and lays
 * out every set, and the last builds the Light/Dark/Compact previews. Every
 * script stays within the byte budget.
 */
import { applyComponentBatch } from './applier.mjs';

/** Default per-script budget, matching the token export's `use_figma` budget. */
export const COMPONENT_BATCH_BUDGET_BYTES = 40_000;
export const COMPONENTS_PAGE = 'Components';

/**
 * Preview rows: explicit modes per token-export collection tag, by mode name.
 * Each row paints the canvas token so Dark reads as the app does.
 */
export const PREVIEW = Object.freeze({
  canvas: 'semantic.surface.canvas',
  rows: [
    { name: 'Light', modes: { 'collection:semantic-color': 'Light', 'collection:semantic-dimension': 'Comfortable' } },
    { name: 'Dark', modes: { 'collection:semantic-color': 'Dark', 'collection:semantic-dimension': 'Comfortable' } },
    { name: 'Compact', modes: { 'collection:semantic-color': 'Light', 'collection:semantic-dimension': 'Compact' } },
  ],
});

const encoder = new TextEncoder();
const byteLength = (text) => encoder.encode(text).length;

// The applier source without comment lines or indentation; it has no
// multi-line strings or comment markers inside strings, so lines are safe to trim.
const applierSource = applyComponentBatch.toString()
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('//'))
  .join('\n');

/**
 * Replace every object or array subtree that occurs more than once with a
 * `{ $: index }` reference into `defs`, assigned in first-seen order.
 */
export function internSubtrees(value) {
  const counts = new Map();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const key = JSON.stringify(node);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    Object.values(node).forEach(visit);
  };
  visit(value);
  const defs = [];
  const indexes = new Map();
  const rewrite = (node, top) => {
    if (!node || typeof node !== 'object') return node;
    const key = JSON.stringify(node);
    const rewritten = Array.isArray(node) ? node.map((item) => rewrite(item, false)) : Object.fromEntries(Object.entries(node).map(([field, item]) => [field, rewrite(item, false)]));
    if (top || counts.get(key) < 2 || key.length < 24) return rewritten;
    if (!indexes.has(key)) {
      indexes.set(key, defs.length);
      defs.push(rewritten);
    }
    return { $: indexes.get(key) };
  };
  return { defs, value: rewrite(value, true) };
}

function batchScript(payload) {
  const { defs, value: sets } = internSubtrees(payload.sets);
  const header = `// Mux UI Figma components batch ${payload.batch}/${payload.total} (${payload.specDigest.slice(0, 19)}). Generated from measured components; do not edit.`;
  return `${header}\nconst payload = ${JSON.stringify({ ...payload, defs, sets })};\nreturn await (${applierSource})(figma, payload);\n`;
}

// Expected tagged IDs, kept small for the orphan-check payload: glyph and set
// IDs by prefix, and each family's variant keys as dot-joined indexes into
// that family's list of `axis=value` segments, which the applier expands.
function expectedIds(spec) {
  return {
    'glyph:': spec.glyphs.map(({ id }) => id.slice('glyph:'.length)),
    'component-set:': spec.families.map(({ id }) => id.slice('component-set:'.length)),
    variants: Object.fromEntries(spec.families.map(({ family, variants }) => {
      const segments = [...new Set(variants.flatMap(({ key }) => key.split(',')))];
      return [family, [segments, variants.map(({ key }) => key.split(',').map((segment) => segments.indexOf(segment)).join('.'))]];
    })),
  };
}

/**
 * @param {ReturnType<typeof import('./spec.mjs').compileComponentSpec>} spec
 */
export function planComponentBatches(spec, { budgetBytes = COMPONENT_BATCH_BUDGET_BYTES } = {}) {
  const specDigest = spec.provenance.specDigest;
  const base = { specDigest, batch: 999, total: 999, page: COMPONENTS_PAGE };
  const size = (slice) => byteLength(batchScript({ ...base, ...slice }));
  const items = [
    ...spec.glyphs.map((glyph) => ['glyph', glyph]),
    ...spec.families.flatMap((family) => family.variants.map((variant) => ['variant', variant, family])),
  ];
  const empty = () => ({ glyphs: [], sets: [] });
  const add = (slice, [kind, item, family]) => {
    if (kind === 'glyph') {
      slice.glyphs.push(item);
      return;
    }
    let set = slice.sets.at(-1);
    if (set?.id !== family.id) {
      set = { id: family.id, family: family.family, name: family.name, variants: [] };
      slice.sets.push(set);
    }
    set.variants.push(item);
  };
  const slices = [];
  let current = empty();
  let count = 0;
  for (const item of items) {
    const candidate = structuredClone(current);
    add(candidate, item);
    // Glyphs stay in their own leading batch so every later batch can instance them.
    const startsVariants = item[0] === 'variant' && current.glyphs.length > 0 && current.sets.length === 0;
    if (!startsVariants && size(candidate) <= budgetBytes) {
      current = candidate;
      count += 1;
      continue;
    }
    if (count === 0) throw new Error(`MUXUI_FIGMA_COMPONENTS_BATCH_ITEM_TOO_LARGE: ${item[1].id} exceeds the ${budgetBytes}-byte batch budget`);
    slices.push(current);
    current = empty();
    add(current, item);
    count = 1;
    if (size(current) > budgetBytes) throw new Error(`MUXUI_FIGMA_COMPONENTS_BATCH_ITEM_TOO_LARGE: ${item[1].id} exceeds the ${budgetBytes}-byte batch budget`);
  }
  if (count) slices.push(current);
  const preview = {
    ...PREVIEW,
    families: spec.families.filter(({ preview: ids }) => ids?.length).map(({ family, name, preview: ids }) => ({ family, name, variants: ids.map((id) => id.slice(`component:${family}/`.length)) })),
  };
  const orphanSlice = { ...empty(), expected: expectedIds(spec) };
  const previewSlice = { ...empty(), preview };
  if (size(orphanSlice) > budgetBytes) throw new Error(`MUXUI_FIGMA_COMPONENTS_BATCH_ITEM_TOO_LARGE: the orphan check exceeds the ${budgetBytes}-byte batch budget`);
  if (size(previewSlice) > budgetBytes) throw new Error(`MUXUI_FIGMA_COMPONENTS_BATCH_ITEM_TOO_LARGE: the preview exceeds the ${budgetBytes}-byte batch budget`);
  slices.push(orphanSlice, previewSlice);
  return slices.map((slice, index) => {
    const script = batchScript({ ...base, batch: index + 1, total: slices.length, ...slice });
    return {
      batch: index + 1,
      bytes: byteLength(script),
      glyphs: slice.glyphs.length,
      variants: Object.fromEntries(slice.sets.map(({ family, variants }) => [family, variants.length])),
      orphanCheck: slice.expected !== undefined,
      preview: slice.preview !== undefined,
      script,
    };
  });
}
