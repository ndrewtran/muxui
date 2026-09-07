import React from 'react';
import { compilePureTokenGraph, cssValue } from '@muxui/tokens/core';
import defaultTheme from '../../../catalog/tokens/default-theme.json' with { type: 'json' };

const h = React.createElement;

export const FOUNDATIONS_CATEGORY_INVENTORY = Object.freeze([
  Object.freeze({ id: 'colors', label: 'Colors and semantic roles' }),
  Object.freeze({ id: 'typography', label: 'Typography' }),
  Object.freeze({ id: 'spacing', label: 'Spacing and dimensions' }),
  Object.freeze({ id: 'radii-shadows', label: 'Radii and shadows' }),
  Object.freeze({ id: 'motion', label: 'Motion' }),
  Object.freeze({ id: 'component', label: 'Component tokens' }),
]);

const CATEGORY_BY_ID = new Map(FOUNDATIONS_CATEGORY_INVENTORY.map((category) => [category.id, category]));
const SUPPORTED_LAYERS = new Set(['reference', 'semantic', 'component']);
const SUPPORTED_TYPES = new Set(['color', 'dimension', 'duration', 'number', 'string', 'effect']);
const MODE_AXES = Object.freeze(['colorScheme', 'contrast', 'density', 'motion']);
const MODE_LABELS = Object.freeze({
  colorScheme: Object.freeze({ light: 'Light', dark: 'Dark' }),
  contrast: Object.freeze({ standard: 'Standard contrast', more: 'More contrast' }),
  density: Object.freeze({ comfortable: 'Comfortable density', compact: 'Compact density' }),
  motion: Object.freeze({ full: 'Full motion', reduced: 'Reduced motion' }),
});
const VISUAL_KIND_BY_CATEGORY = Object.freeze({
  colors: 'color-swatch',
  typography: 'typography-sample',
  spacing: 'measurement-ruler',
  'radii-shadows': 'shape-box',
  motion: 'motion-timeline',
  component: 'component-schematic',
});
const RESPONSIVE_PREVIEW_TOKEN_IDS = Object.freeze([
  'reference.dimension.space-xs',
  'reference.dimension.space-xl',
  'reference.dimension.section-space-xl',
  'reference.dimension.text-m',
  'reference.dimension.text-5xl',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cssVariableName(tokenId) {
  return '--muxui-' + tokenId.replaceAll('.', '-');
}

function tokenCategories(tokenId, token) {
  if (!isRecord(token) || !SUPPORTED_LAYERS.has(token.layer) || !SUPPORTED_TYPES.has(token.type)) return [];
  const categories = [];
  if (token.type === 'color') categories.push('colors');
  if (token.type === 'duration') categories.push('motion');
  if (tokenId.includes('.typography.') || /font-family|font-size|font-weight|line-height|letter-spacing/u.test(tokenId)) categories.push('typography');
  if (token.type === 'effect' || tokenId.includes('.effect.') || tokenId.includes('.shape.') || tokenId.includes('.elevation.') || /(?:^|[.-])(radius|shadow)(?:$|[.-])/u.test(tokenId)) categories.push('radii-shadows');
  if (token.type === 'dimension') categories.push('spacing');
  if (token.type === 'number' && /weight|line-height/u.test(tokenId)) categories.push('typography');
  if (token.type === 'duration' || tokenId.includes('.motion.') || /easing/u.test(tokenId)) categories.push('motion');
  if (token.layer === 'component') categories.push('component');
  return [...new Set(categories)];
}

function tokenCategory(tokenId, token) {
  return tokenCategories(tokenId, token)[0] ?? null;
}

function defaultModesFor(theme) {
  const configured = isRecord(theme?.theme?.defaultModes) ? theme.theme.defaultModes : {};
  return Object.fromEntries(MODE_AXES.map((axis) => [
    axis,
    typeof configured[axis] === 'string' ? configured[axis]
      : axis === 'colorScheme' ? 'light'
        : axis === 'contrast' ? 'standard'
          : axis === 'density' ? 'comfortable' : 'full',
  ]));
}

const graphCache = new WeakMap();

function graphFor(theme, modes, responsive = false) {
  if (!validTheme(theme)) return { graph: null, error: null };
  const key = JSON.stringify({ modes, responsive });
  let entries = graphCache.get(theme);
  if (!entries) {
    entries = new Map();
    graphCache.set(theme, entries);
  }
  if (entries.has(key)) return entries.get(key);
  try {
    const result = { graph: compilePureTokenGraph(theme, { modes, responsive }), error: null };
    entries.set(key, result);
    return result;
  } catch (error) {
    const result = { graph: null, error };
    entries.set(key, result);
    return result;
  }
}

function graphChain(graph, tokenId) {
  const chain = [tokenId];
  const seen = new Set(chain);
  let current = tokenId;
  while (graph.dependencies[current]?.length) {
    const next = graph.dependencies[current][0];
    if (seen.has(next)) break;
    chain.push(next);
    seen.add(next);
    current = next;
  }
  return chain;
}

function compilerErrorReason(error) {
  const code = typeof error?.message === 'string' ? error.message.split(':', 1)[0] : '';
  if (code === 'MUXUI_TOKEN_ALIAS_MISSING') return 'missing-alias-target';
  if (code === 'MUXUI_TOKEN_ALIAS_CYCLE') return 'alias-cycle';
  return 'invalid-token-source';
}

/** Resolve through the shared pure token compiler so Storybook and package transforms agree. */
export function resolveTokenValue(theme, tokenId, modes = {}) {
  const token = theme?.tokens?.[tokenId];
  const chain = [tokenId];
  if (!isRecord(token) || !SUPPORTED_LAYERS.has(token.layer) || !SUPPORTED_TYPES.has(token.type)) {
    return { status: 'unresolved', tokenId, chain, reason: 'unsupported-token' };
  }
  const { graph, error } = graphFor(theme, { ...defaultModesFor(theme), ...modes });
  if (!graph) return { status: 'unresolved', tokenId, chain, reason: compilerErrorReason(error) };
  const resolved = graph.tokens[tokenId];
  if (!resolved) return { status: 'unresolved', tokenId, chain, reason: 'unsupported-token' };
  return {
    status: 'resolved',
    tokenId,
    value: resolved.value,
    chain: graphChain(graph, tokenId),
    sourceTokenId: graphChain(graph, tokenId).at(-1),
    type: resolved.type,
    unit: resolved.unit,
    ...(typeof token.alias === 'string' ? { alias: token.alias } : {}),
    ...(resolved.fluid === undefined ? {} : { fluid: resolved.fluid }),
    ...(resolved.formula === undefined ? {} : { formula: resolved.formula }),
    ...(resolved.relative === undefined ? {} : { relative: resolved.relative }),
    ...(resolved.mix === undefined ? {} : { mix: resolved.mix }),
    ...(resolved.effect === undefined ? {} : { effect: resolved.effect }),
  };
}

function formatValue(result) {
  if (result.status !== 'resolved') return 'Unavailable';
  if (result.type === 'effect') return cssValue(result);
  if (result.unit === 'px') return result.value + 'px';
  if (result.unit === 'ms') return result.value + 'ms';
  return String(result.value);
}

function validTheme(theme) {
  return isRecord(theme) && isRecord(theme.tokens);
}

function visualSpecimenKind(category, token) {
  return category && isRecord(token) ? VISUAL_KIND_BY_CATEGORY[category] : null;
}

export function foundationVisualSpecimenKind(tokenId, token) {
  return visualSpecimenKind(tokenCategory(tokenId, token), token);
}

/** Show the static default beside the explicit responsive recipe from the same graph compiler. */
export function responsiveFoundationRows(theme = defaultTheme, modes = defaultModesFor(theme)) {
  const staticResult = graphFor(theme, modes, false);
  const responsiveResult = graphFor(theme, modes, true);
  if (!staticResult.graph || !responsiveResult.graph) return [];
  return RESPONSIVE_PREVIEW_TOKEN_IDS
    .map((id) => {
      const staticToken = staticResult.graph.tokens[id];
      const responsiveToken = responsiveResult.graph.tokens[id];
      if (!staticToken || !responsiveToken) return null;
      return Object.freeze({
        id,
        cssVariable: cssVariableName(id),
        staticValue: cssValue(staticToken),
        responsiveValue: cssValue(responsiveToken),
      });
    })
    .filter(Boolean);
}

function colorGroup(id, layer) {
  const parts = id.split('.');
  if (layer === 'reference') {
    const name = parts.at(-1) ?? id;
    return 'reference-' + name.replace(/-\d+$/u, '').replace(/-default$/u, '');
  }
  return layer + '-' + (parts[1] ?? 'roles');
}

function colorGroupLabel(group) {
  return group.split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
}

function typographyGroup(id) {
  if (/font-size|(?:^|-)size$/u.test(id)) return 'Font size scale';
  if (/font-weight|weight/u.test(id)) return 'Font weights';
  if (/line-height/u.test(id)) return 'Line heights';
  return 'Typography roles';
}

function numericValue(theme, row, modes) {
  const result = resolveTokenValue(theme, row.id, modes);
  return result.status === 'resolved' && typeof result.value === 'number' && Number.isFinite(result.value) ? result.value : undefined;
}

/** Build the gallery's display model directly from the canonical theme JSON. */
export function foundationTokenRows(theme = defaultTheme) {
  if (!validTheme(theme)) return [];
  const modes = defaultModesFor(theme);
  return Object.entries(theme.tokens).map(([id, token]) => {
    const facets = tokenCategories(id, token);
    const category = facets[0];
    if (!category) return null;
    const defaultValue = resolveTokenValue(theme, id, modes);
    return Object.freeze({
      id,
      cssVariable: cssVariableName(id),
      category,
      facets: Object.freeze(facets),
      categoryLabel: CATEGORY_BY_ID.get(category).label,
      visualKind: visualSpecimenKind(category, token),
      colorGroup: facets.includes('colors') ? colorGroup(id, token.layer) : undefined,
      colorGroupLabel: facets.includes('colors') ? colorGroupLabel(colorGroup(id, token.layer)) : undefined,
      typographyGroup: category === 'typography' ? typographyGroup(id) : undefined,
      layer: token.layer,
      type: token.type,
      unit: token.unit,
      meaning: typeof token.meaning === 'string' ? token.meaning : '',
      alias: typeof token.alias === 'string' ? token.alias : undefined,
      defaultValue,
      defaultDisplay: formatValue(defaultValue),
    });
  }).filter(Boolean);
}

export function foundationCategoryCounts(theme = defaultTheme) {
  const counts = Object.fromEntries(FOUNDATIONS_CATEGORY_INVENTORY.map(({ id }) => [id, 0]));
  for (const row of foundationTokenRows(theme)) {
    for (const category of row.facets) counts[category] += 1;
  }
  return counts;
}

function searchRow(row, query) {
  if (!query) return true;
  const haystack = [row.id, row.cssVariable, row.meaning, row.alias, row.layer, row.type].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function modeOptions(theme, axis) {
  const configured = theme?.theme?.modeAxes?.[axis];
  return Array.isArray(configured) && configured.length > 0
    ? configured
    : axis === 'colorScheme' ? ['light', 'dark']
      : axis === 'contrast' ? ['standard', 'more']
        : axis === 'density' ? ['comfortable', 'compact'] : ['full', 'reduced'];
}

function representativeRow(rows, axis) {
  if (axis === 'colorScheme') return rows.find((row) => row.id === 'semantic.surface.canvas') ?? rows.find((row) => row.facets.includes('colors'));
  if (axis === 'contrast') return rows.find((row) => row.id === 'semantic.content.default') ?? rows.find((row) => row.facets.includes('colors'));
  if (axis === 'density') return rows.find((row) => row.id === 'semantic.control.padding-inline') ?? rows.find((row) => row.facets.includes('spacing'));
  return rows.find((row) => row.facets.includes('motion'));
}

function aliasChainHasModeOverride(theme, tokenId, axis, seen = new Set()) {
  if (seen.has(tokenId)) return false;
  seen.add(tokenId);
  const token = theme?.tokens?.[tokenId];
  if (!isRecord(token)) return false;
  const modes = isRecord(token.modes) ? token.modes : {};
  if (Object.keys(modes).some((key) => key.startsWith(axis + '.'))) return true;
  return typeof token.alias === 'string' && aliasChainHasModeOverride(theme, token.alias, axis, seen);
}

function resolutionsMatch(first, second) {
  return first.status === 'resolved' && second.status === 'resolved' && Object.is(first.value, second.value);
}

export function foundationComparisonPanels(theme = defaultTheme, selectedModes = defaultModesFor(theme)) {
  const rows = foundationTokenRows(theme);
  const defaults = { ...defaultModesFor(theme), ...selectedModes };
  return MODE_AXES.flatMap((axis) => modeOptions(theme, axis).slice(0, 2).map((value) => {
    const row = representativeRow(rows, axis);
    const modes = { ...defaults, [axis]: value };
    const resolved = row ? resolveTokenValue(theme, row.id, modes) : { status: 'unresolved', reason: 'missing-representative' };
    const comparisonValues = axis === 'contrast' ? modeOptions(theme, axis).slice(0, 2) : [];
    const contrastResolutions = comparisonValues.map((comparisonValue) => row
      ? resolveTokenValue(theme, row.id, { ...defaults, [axis]: comparisonValue })
      : { status: 'unresolved' });
    const contrastHasOverride = axis === 'contrast' && row
      ? aliasChainHasModeOverride(theme, row.id, axis)
      : false;
    return Object.freeze({
      id: axis + '-' + value,
      axis,
      value,
      label: MODE_LABELS[axis]?.[value] ?? value,
      row,
      modes,
      visualKind: axis === 'colorScheme' || axis === 'contrast' ? 'color-swatch' : axis === 'density' ? 'measurement-ruler' : 'motion-timeline',
      resolved,
      comparison: axis === 'contrast' ? Object.freeze({
        sameResolvedAppearance: resolutionsMatch(contrastResolutions[0], contrastResolutions[1]),
        hasCanonicalOverride: contrastHasOverride,
      }) : undefined,
    });
  }));
}

function AliasChain({ theme, row, modes }) {
  const resolution = resolveTokenValue(theme, row.id, modes);
  const chain = resolution.chain?.length ? resolution.chain : [row.id];
  return h('div', { className: 'muxui-foundations-alias-chain', 'data-muxui-foundations-alias-chain': row.id, 'aria-label': 'Alias chain for ' + row.id },
    chain.map((tokenId, index) => h(React.Fragment, { key: tokenId + '-' + index },
      h('code', { className: 'muxui-foundations-alias-node', 'data-muxui-foundations-alias-node': tokenId }, tokenId),
      index < chain.length - 1 ? h('span', { className: 'muxui-foundations-alias-link', 'data-muxui-foundations-alias-link': tokenId + '->' + chain[index + 1], 'aria-hidden': true }, '→') : null,
    )));
}

function CopyMetadata({ row, onCopy }) {
  return h('div', { className: 'muxui-foundations-metadata' },
    h('button', { type: 'button', className: 'muxui-foundations-copy', onClick: () => onCopy(row.cssVariable), 'data-muxui-foundations-copy': row.cssVariable, 'aria-label': 'Copy CSS variable ' + row.cssVariable }, 'Copy variable'),
    h('code', { className: 'muxui-foundations-css-var' }, row.cssVariable),
  );
}

function TokenCaption({ theme, row, modes, onCopy }) {
  const selectedValue = formatValue(resolveTokenValue(theme, row.id, modes));
  return h('div', { className: 'muxui-foundations-token-caption' },
    h('code', { className: 'muxui-foundations-token-id' }, row.id),
    h('code', { className: 'muxui-foundations-token-value', 'data-muxui-foundations-selected-value': row.id }, selectedValue),
    h('p', { className: 'muxui-foundations-meaning' }, row.meaning || 'No meaning documented.'),
    h(AliasChain, { theme, row, modes }),
    h(CopyMetadata, { row, onCopy }),
  );
}

function colorValue(theme, row, modes) {
  const result = resolveTokenValue(theme, row.id, modes);
  return result.status === 'resolved' && typeof result.value === 'string' ? result.value : undefined;
}

function ColorTokenCard({ theme, row, modes, onCopy }) {
  const value = colorValue(theme, row, modes);
  return h('article', { className: 'muxui-foundations-color-card', 'data-muxui-foundations-token': row.id, 'data-muxui-foundations-color-card': row.id },
    h('div', { className: 'muxui-foundations-color-tile', role: 'img', 'data-muxui-foundations-color-swatch': row.id, 'aria-label': row.id + ' resolved color ' + (value ?? 'unavailable') },
      h('div', { className: 'muxui-foundations-color-tile-backing', 'aria-hidden': true },
        h('div', { className: 'muxui-foundations-color-tile-fill', 'data-muxui-foundations-color-fill': row.id, style: value ? { backgroundColor: value } : undefined }),
      ),
    ),
    h(TokenCaption, { theme, row, modes, onCopy }),
  );
}

function renderColorGallery({ theme, rows, modes, onCopy }) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.colorGroup)) groups.set(row.colorGroup, []);
    groups.get(row.colorGroup).push(row);
  }
  return h('div', { className: 'muxui-foundations-color-groups', 'data-muxui-foundations-visual-kind': 'color-swatch' },
    [...groups.entries()].map(([group, groupRows]) => h('section', { key: group, className: 'muxui-foundations-color-group', 'data-muxui-foundations-color-group': group },
      h('h3', null, groupRows[0].colorGroupLabel),
      h('div', { className: 'muxui-foundations-color-grid' }, groupRows.map((row) => h(ColorTokenCard, { key: row.id, theme, row, modes, onCopy }))),
    )),
  );
}

function typographyProperty(row) {
  if (row.typographyGroup === 'Font size scale') return 'size';
  if (row.typographyGroup === 'Font weights') return 'weight';
  if (row.typographyGroup === 'Line heights') return 'line-height';
  return 'role';
}

function typographyRoleForToken(theme, tokenId, modes) {
  const roles = theme?.theme?.typography?.roles;
  if (!isRecord(roles)) return undefined;
  const resolution = resolveTokenValue(theme, tokenId, modes);
  const tokenIds = new Set([tokenId, ...(resolution.chain ?? [])]);
  for (const [name, role] of Object.entries(roles)) {
    if (!isRecord(role)) continue;
    if (tokenIds.has(role.fontFamily) || tokenIds.has(role.color)) return { name, role };
    for (const [variant, properties] of Object.entries(role.variants ?? {})) {
      if (isRecord(properties) && Object.values(properties).some((propertyTokenId) => tokenIds.has(propertyTokenId))) {
        return { name, role, variant, properties };
      }
    }
  }
  return undefined;
}

function resolvedString(theme, tokenId, modes) {
  if (typeof tokenId !== 'string') return undefined;
  const result = resolveTokenValue(theme, tokenId, modes);
  return result.status === 'resolved' && typeof result.value === 'string' ? result.value : undefined;
}

function typographyStyle(theme, row, modes) {
  const value = numericValue(theme, row, modes);
  const property = typographyProperty(row);
  const roleBinding = typographyRoleForToken(theme, row.id, modes);
  const role = roleBinding?.role;
  const style = {};
  const color = resolvedString(theme, role?.color, modes);
  if (color !== undefined) style.color = color;
  const letterSpacing = resolvedString(theme, roleBinding?.properties?.letterSpacing, modes);
  if (letterSpacing !== undefined) style.letterSpacing = letterSpacing;
  if (row.id.includes('font-family')) {
    const resolved = resolveTokenValue(theme, row.id, modes);
    if (resolved.status === 'resolved' && typeof resolved.value === 'string') style.fontFamily = resolved.value;
  }
  if (value !== undefined) {
    if (property === 'size') style.fontSize = value + 'px';
    if (property === 'weight') style.fontWeight = value;
    if (property === 'line-height') style.lineHeight = value;
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function typographySample(row) {
  return row.typographyGroup === 'Line heights'
    ? h(React.Fragment, null,
      h('span', null, 'The quick brown fox jumps over the lazy dog.'),
      h('br'),
      h('span', null, 'A second line makes the selected leading visible.'),
    )
    : 'Aa Bb Cc 0123';
}

function renderTypographyGallery({ theme, rows, modes, onCopy }) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.typographyGroup)) groups.set(row.typographyGroup, []);
    groups.get(row.typographyGroup).push(row);
  }
  return h('div', { className: 'muxui-foundations-typography-groups', 'data-muxui-foundations-visual-kind': 'typography-sample' },
    [...groups.entries()].map(([group, groupRows]) => h('section', { key: group, className: 'muxui-foundations-typography-group', 'data-muxui-foundations-typography-group': group },
      h('h3', null, group),
      h('div', { className: 'muxui-foundations-typography-list' }, groupRows.map((row) => h('article', { key: row.id, className: 'muxui-foundations-typography-card', 'data-muxui-foundations-token': row.id },
        h('p', { className: 'muxui-foundations-typography-sample', style: typographyStyle(theme, row, modes), 'data-muxui-foundations-typography-sample': row.id }, typographySample(row)),
        h(TokenCaption, { theme, row, modes, onCopy }),
      ))),
    )),
  );
}

function renderSpacingGallery({ theme, rows, modes, onCopy }) {
  const values = rows.map((row) => numericValue(theme, row, modes)).filter((value) => value !== undefined);
  const max = Math.max(...values, 1);
  return h('div', { className: 'muxui-foundations-spacing-list', 'data-muxui-foundations-visual-kind': 'measurement-ruler' },
    rows.map((row) => {
      const value = numericValue(theme, row, modes);
      const ratio = value === undefined ? 0.04 : Math.max(0.04, Math.min(1, value / max));
      const boxStyle = value === undefined ? undefined : row.id.includes('min-height')
        ? { blockSize: Math.max(8, Math.min(96, value)) + 'px' }
        : { inlineSize: Math.max(8, Math.min(160, value)) + 'px' };
      return h('article', { key: row.id, className: 'muxui-foundations-spacing-card', 'data-muxui-foundations-token': row.id },
        h('div', { className: 'muxui-foundations-spacing-visual', 'data-muxui-foundations-spacing-specimen': row.id },
          h('div', { className: 'muxui-foundations-spacing-ruler', style: { inlineSize: ratio * 100 + '%' } }),
          h('div', { className: 'muxui-foundations-spacing-box', style: boxStyle }),
        ),
        h(TokenCaption, { theme, row, modes, onCopy }),
      );
    }),
  );
}

function isShadowRow(row) {
  return row.type === 'effect' || /shadow|elevation/u.test(row.id);
}

function renderShapeGallery({ theme, rows, modes, onCopy }) {
  return h('div', { className: 'muxui-foundations-shape-list', 'data-muxui-foundations-visual-kind': 'shape-box' },
    rows.map((row) => {
      const result = resolveTokenValue(theme, row.id, modes);
      const value = result.status === 'resolved' ? result.value : undefined;
      const shadow = isShadowRow(row);
      const boxStyle = shadow ? (typeof value === 'string' || row.type === 'effect' ? { boxShadow: formatValue(result) } : undefined)
        : row.id.includes('.effect.') && typeof value === 'string' ? { backgroundColor: value }
        : typeof value === 'number' ? { borderRadius: value + 'px' } : undefined;
      return h('article', { key: row.id, className: 'muxui-foundations-shape-card', 'data-muxui-foundations-token': row.id },
        h('div', { className: 'muxui-foundations-shape-visual', 'data-muxui-foundations-radii-specimen': row.id },
          h('div', { className: 'muxui-foundations-shape-box', style: boxStyle }),
          h('div', { className: 'muxui-foundations-shape-box-inner', style: boxStyle }),
        ),
        h(TokenCaption, { theme, row, modes, onCopy }),
      );
    }),
  );
}

function renderMotionGallery({ theme, rows, modes, onCopy, activeDemo, run, onTrigger }) {
  const maximum = Math.max(1, ...rows.map((row) => numericValue(theme, row, modes) ?? 0));
  return h('div', { className: 'muxui-foundations-motion-list', 'data-muxui-foundations-visual-kind': 'motion-timeline' },
    rows.map((row) => {
      const duration = numericValue(theme, row, modes) ?? 0;
      const effectiveDuration = modes.motion === 'reduced' ? 0 : duration;
      const width = Math.max(4, Math.min(100, duration / maximum * 100));
      return h('article', { key: row.id, className: 'muxui-foundations-motion-card', 'data-muxui-foundations-token': row.id },
        h('div', { className: 'muxui-foundations-motion-head' },
          h('div', { className: 'muxui-foundations-motion-timeline', 'data-muxui-foundations-motion-timeline': row.id, 'data-muxui-foundations-motion-duration': effectiveDuration + 'ms' },
            h('div', { className: 'muxui-foundations-motion-track' },
              h('div', { className: 'muxui-foundations-motion-fill' + (activeDemo === row.id ? ' is-running' : ''), 'data-muxui-foundations-motion-fill': row.id, key: row.id + '-' + run, style: { inlineSize: width + '%', '--muxui-foundations-motion-duration': effectiveDuration + 'ms' } }),
            ),
          ),
          h('button', { type: 'button', className: 'muxui-foundations-motion-trigger', 'data-muxui-foundations-motion-trigger': row.id, onClick: () => onTrigger(row.id) }, 'Play once'),
        ),
        h('p', { className: 'muxui-foundations-motion-easing', 'data-muxui-foundations-motion-easing': row.id }, row.type === 'string'
          ? 'Easing: ' + formatValue(resolveTokenValue(theme, row.id, modes))
          : 'Ease-out renderer timeline'),
        h(TokenCaption, { theme, row, modes, onCopy }),
      );
    }),
  );
}

function componentStyles(theme, rows, modes) {
  const bySuffix = (suffix) => rows.find((row) => row.id === 'component.button.' + suffix);
  const resolve = (suffix) => {
    const row = bySuffix(suffix);
    return row ? resolveTokenValue(theme, row.id, modes) : { status: 'unresolved' };
  };
  const background = resolve('background');
  const foreground = resolve('foreground');
  const minHeight = resolve('min-height');
  const padding = resolve('padding-inline');
  const radius = resolve('radius');
  return {
    backgroundColor: background.status === 'resolved' ? background.value : undefined,
    color: foreground.status === 'resolved' ? foreground.value : undefined,
    minHeight: minHeight.status === 'resolved' ? minHeight.value + 'px' : undefined,
    paddingInline: padding.status === 'resolved' ? padding.value + 'px' : undefined,
    borderRadius: radius.status === 'resolved' ? radius.value + 'px' : undefined,
  };
}

function renderComponentGallery({ theme, rows, allRows, modes, onCopy }) {
  const componentRows = rows.filter((row) => row.facets.includes('component'));
  const styles = componentStyles(theme, allRows, modes);
  const styleFor = (row) => ({
    ...styles,
    outline: '2px solid currentColor',
    outlineOffset: '2px',
    ...(row.id.endsWith('.background') ? { boxShadow: '0 0 0 4px currentColor' }
      : row.id.endsWith('.foreground') ? { textDecoration: 'underline', textDecorationThickness: '2px' }
        : row.id.endsWith('.min-height') ? { transform: 'scaleY(1.08)' }
          : row.id.endsWith('.padding-inline') ? { transform: 'scaleX(1.08)' } : { outlineStyle: 'dashed' }),
  });
  return h('div', { className: 'muxui-foundations-component-gallery', 'data-muxui-foundations-visual-kind': 'component-schematic' },
    h('div', { className: 'muxui-foundations-component-hero', 'data-muxui-foundations-component-specimen': true },
      h('button', { type: 'button', className: 'muxui-foundations-component-button', style: styles }, 'Button specimen'),
      h('p', null, 'Resolved component tokens applied together'),
    ),
    h('div', { className: 'muxui-foundations-component-list' }, componentRows.map((row) => h('article', { key: row.id, className: 'muxui-foundations-component-card', 'data-muxui-foundations-token': row.id },
      h('div', { className: 'muxui-foundations-component-token-visual', 'data-muxui-foundations-component-token-visual': row.id },
        h('button', { type: 'button', className: 'muxui-foundations-component-mini-button', style: styleFor(row) }, 'Button'),
      ),
      h(TokenCaption, { theme, row, modes, onCopy }),
    ))),
  );
}

function renderActiveCategory({ theme, rows, allRows, category, modes, onCopy, activeDemo, run, onTrigger }) {
  if (category === 'colors') return renderColorGallery({ theme, rows, modes, onCopy });
  if (category === 'typography') return renderTypographyGallery({ theme, rows, modes, onCopy });
  if (category === 'spacing') return renderSpacingGallery({ theme, rows, modes, onCopy });
  if (category === 'radii-shadows') return renderShapeGallery({ theme, rows, modes, onCopy });
  if (category === 'motion') return renderMotionGallery({ theme, rows, modes, onCopy, activeDemo, run, onTrigger });
  if (category === 'component') return renderComponentGallery({ theme, rows, allRows, modes, onCopy });
  return null;
}

function renderComparisonSpecimen(panel) {
  if (panel.visualKind === 'color-swatch') {
    const color = panel.resolved.status === 'resolved' ? panel.resolved.value : undefined;
    return h('div', { className: 'muxui-foundations-comparison-color', role: 'img', 'data-muxui-foundations-comparison-color': panel.id, 'aria-label': panel.label + ' resolved color ' + (color ?? 'unavailable') },
      h('div', { className: 'muxui-foundations-comparison-color-backing', 'aria-hidden': true },
        h('div', { className: 'muxui-foundations-comparison-color-fill', 'data-muxui-foundations-comparison-color-fill': panel.id, style: color ? { backgroundColor: color } : undefined }),
      ),
    );
  }
  if (panel.visualKind === 'measurement-ruler') {
    const value = panel.resolved.status === 'resolved' && typeof panel.resolved.value === 'number' ? panel.resolved.value : 0;
    return h('div', { className: 'muxui-foundations-comparison-measure', style: { inlineSize: Math.max(8, Math.min(100, value)) + '%' } }, formatValue(panel.resolved));
  }
  const value = panel.resolved.status === 'resolved' && typeof panel.resolved.value === 'number' ? panel.resolved.value : 0;
  const duration = panel.modes.motion === 'reduced' ? 0 : value;
  const trajectory = Math.max(8, Math.min(100, value));
  return h('div', { className: 'muxui-foundations-comparison-motion', 'data-muxui-foundations-comparison-motion': panel.id, style: { '--muxui-foundations-motion-duration': duration + 'ms' } },
    h('span', { className: 'muxui-foundations-comparison-motion-mark', 'data-muxui-foundations-comparison-motion-mark': panel.id, 'aria-hidden': true, style: { inlineSize: trajectory + '%' } }),
  );
}

function renderMotionComparison(panels) {
  const full = panels.find((panel) => panel.value === 'full');
  const reduced = panels.find((panel) => panel.value === 'reduced');
  if (!full || !reduced) return null;
  const fullDuration = full.resolved.status === 'resolved' && typeof full.resolved.value === 'number' ? full.resolved.value : 0;
  const reducedDuration = reduced.resolved.status === 'resolved' && typeof reduced.resolved.value === 'number' ? reduced.resolved.value : 0;
  const runKey = full.id + '-' + reduced.id;
  const [active, setActive] = React.useState(false);
  const [run, setRun] = React.useState(0);
  const trigger = () => {
    setActive(false);
    setRun((current) => current + 1);
    const start = () => setActive(true);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(start);
    else setTimeout(start, 0);
  };
  return h('div', { className: 'muxui-foundations-motion-comparison', 'data-muxui-foundations-motion-comparison': true },
    h('div', { className: 'muxui-foundations-motion-comparison-static', role: 'img', 'aria-label': 'Static full and reduced motion trajectories' },
      h('div', { className: 'muxui-foundations-motion-comparison-row' },
        h('span', null, 'Full'),
        h('span', { className: 'muxui-foundations-motion-comparison-trajectory', style: { inlineSize: Math.max(25, Math.min(100, fullDuration / Math.max(fullDuration, 1) * 100)) + '%' } }),
      ),
      h('div', { className: 'muxui-foundations-motion-comparison-row' },
        h('span', null, 'Reduced'),
        h('span', { className: 'muxui-foundations-motion-comparison-trajectory', style: { inlineSize: Math.max(8, Math.min(100, reducedDuration / Math.max(fullDuration, 1) * 100)) + '%' } }),
      ),
    ),
    h('div', { className: 'muxui-foundations-motion-comparison-pair', 'data-muxui-foundations-motion-comparison-pair': true },
      h('div', { className: 'muxui-foundations-motion-comparison-track', 'data-muxui-foundations-motion-comparison-track': 'full' },
        h('span', { className: 'muxui-foundations-motion-comparison-fill' + (active ? ' is-running' : ''), key: runKey + '-full-' + run, 'data-muxui-foundations-motion-comparison-fill': 'full', style: { '--muxui-foundations-motion-duration': fullDuration + 'ms' } }),
      ),
      h('div', { className: 'muxui-foundations-motion-comparison-track', 'data-muxui-foundations-motion-comparison-track': 'reduced' },
        h('span', { className: 'muxui-foundations-motion-comparison-fill' + (active ? ' is-running' : ''), key: runKey + '-reduced-' + run, 'data-muxui-foundations-motion-comparison-fill': 'reduced', style: { '--muxui-foundations-motion-duration': reducedDuration + 'ms' } }),
      ),
    ),
    h('button', { type: 'button', className: 'muxui-foundations-motion-comparison-trigger', 'data-muxui-foundations-motion-comparison-trigger': true, onClick: trigger }, 'Play full and reduced once'),
  );
}

function renderContrastNote(panel) {
  if (!panel.comparison) return null;
  const same = panel.comparison.sameResolvedAppearance && !panel.comparison.hasCanonicalOverride;
  return h('p', {
    className: 'muxui-foundations-comparison-note',
    'data-muxui-foundations-contrast-relationship': same ? 'same-resolved-appearance' : 'different-resolved-appearance',
  }, same ? 'Same resolved appearance · no canonical override' : 'Resolved appearance differs');
}

function ModeComparisons({ theme, modes }) {
  const panels = foundationComparisonPanels(theme, modes);
  return h('section', { className: 'muxui-foundations-comparisons', 'data-muxui-foundations-comparisons': true, 'aria-labelledby': 'muxui-foundations-comparisons-title' },
    h('div', { className: 'muxui-foundations-comparisons-heading' },
      h('div', null, h('p', { className: 'muxui-foundations-eyebrow' }, 'Visual mode comparisons'), h('h2', { id: 'muxui-foundations-comparisons-title' }, 'See what changes')),
      h('p', null, 'Each panel resolves a canonical token into a real surface, measure, or timeline.'),
    ),
    h('div', { className: 'muxui-foundations-comparison-grid' }, panels.map((panel) => h('article', { key: panel.id, className: 'muxui-foundations-comparison-panel muxui-foundations-comparison-' + panel.axis, 'data-muxui-foundations-comparison-panel': panel.id, 'data-muxui-foundations-comparison-axis': panel.axis, 'data-muxui-foundations-comparison-value': panel.value },
      h('div', { className: 'muxui-foundations-comparison-label' }, h('strong', null, panel.label), h('code', null, panel.row?.id ?? 'Unavailable')),
      renderComparisonSpecimen(panel),
      panel.axis === 'motion' && panel.value === 'full' ? renderMotionComparison(panels.filter(({ axis }) => axis === 'motion')) : null,
      panel.axis === 'contrast' ? renderContrastNote(panel) : null,
      h('code', { className: 'muxui-foundations-comparison-value' }, displayValue(panel.resolved)),
    ))),
  );
}

function displayValue(result) {
  return formatValue(result);
}

function ResponsiveDimensionPreview({ theme, modes }) {
  const rows = responsiveFoundationRows(theme, modes);
  return h('section', { className: 'muxui-foundations-responsive', 'data-muxui-foundations-responsive': true, 'aria-labelledby': 'muxui-foundations-responsive-title' },
    h('div', { className: 'muxui-foundations-responsive-heading' },
      h('div', null, h('p', { className: 'muxui-foundations-eyebrow' }, 'Opt-in viewport recipes'), h('h2', { id: 'muxui-foundations-responsive-title' }, 'Static by default, responsive by choice')),
      h('p', null, 'The default Mux UI theme keeps donor dimensions static. Add ', h('code', null, 'data-muxui-responsive'), ' to a theme scope to activate the canonical clamp recipes.'),
    ),
    h('div', { className: 'muxui-foundations-responsive-grid' }, rows.map((row) => h('article', { key: row.id, className: 'muxui-foundations-responsive-row', 'data-muxui-foundations-responsive-token': row.id },
      h('code', { className: 'muxui-foundations-responsive-id' }, row.cssVariable),
      h('div', { className: 'muxui-foundations-responsive-value', 'data-muxui-foundations-responsive-mode': 'static' }, h('span', null, 'Default'), h('code', null, row.staticValue)),
      h('div', { className: 'muxui-foundations-responsive-value', 'data-muxui-foundations-responsive-mode': 'responsive' }, h('span', null, 'Responsive'), h('code', null, row.responsiveValue)),
    ))),
  );
}

function CategoryNav({ selected, counts, onSelect }) {
  return h('nav', { className: 'muxui-foundations-categories', 'aria-label': 'Foundation categories' },
    FOUNDATIONS_CATEGORY_INVENTORY.map(({ id, label }) => h('button', { key: id, type: 'button', className: selected === id ? 'is-selected' : undefined, 'aria-current': selected === id ? 'page' : undefined, onClick: () => onSelect(id), 'data-muxui-foundations-category': id },
      h('span', null, label), h('span', { className: 'muxui-foundations-count', 'aria-label': counts[id] + ' tokens' }, counts[id]))),
  );
}

/** Copy a CSS variable name with Clipboard API first and an old-browser fallback. */
export async function copyTextToClipboard(value, clipboard = globalThis.navigator?.clipboard) {
  if (typeof value !== 'string' || value.length === 0) return { ok: false, method: 'invalid' };
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(value);
      return { ok: true, method: 'clipboard' };
    } catch {
      // Continue with the DOM fallback when permissions or browser policy reject the API.
    }
  }
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function' || !document.body) return { ok: false, method: 'unavailable' };
  const input = document.createElement('textarea');
  const previouslyFocused = document.activeElement;
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    input.remove();
    if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected && previouslyFocused.tabIndex >= 0 && !previouslyFocused.hasAttribute('disabled')) {
      previouslyFocused.focus({ preventScroll: true });
    }
  }
  return { ok, method: ok ? 'execCommand' : 'unavailable' };
}

function themeModeSelect({ axis, value, options, onChange }) {
  const id = 'muxui-foundations-' + axis;
  return h('label', { className: 'muxui-foundations-control', htmlFor: id },
    h('span', null, MODE_LABELS[axis]?.[value] ?? axis),
    h('select', { id, value, onChange: (event) => onChange(event.target.value), 'data-muxui-foundations-mode': axis },
      options.map((option) => h('option', { key: option, value: option }, MODE_LABELS[axis]?.[option] ?? option))),
  );
}

export function FoundationsGallery({ theme = defaultTheme } = {}) {
  const initialModes = defaultModesFor(theme);
  const [category, setCategory] = React.useState('colors');
  const [query, setQuery] = React.useState('');
  const [modes, setModes] = React.useState(initialModes);
  const [copyStatus, setCopyStatus] = React.useState('');
  const [activeMotionDemo, setActiveMotionDemo] = React.useState(null);
  const [motionRun, setMotionRun] = React.useState(0);
  const rows = React.useMemo(() => foundationTokenRows(theme), [theme]);
  const counts = React.useMemo(() => foundationCategoryCounts(theme), [theme]);
  const selectedCategory = CATEGORY_BY_ID.has(category) ? category : FOUNDATIONS_CATEGORY_INVENTORY[0].id;
  const visibleRows = rows.filter((row) => row.facets.includes(selectedCategory) && searchRow(row, query));
  const updateMode = (axis, value) => setModes((current) => ({ ...current, [axis]: value }));
  const copy = async (value) => {
    const result = await copyTextToClipboard(value);
    setCopyStatus(result.ok ? 'Copied ' + value : 'Could not copy ' + value + '. Select the name manually.');
  };
  const triggerMotion = (id) => {
    setActiveMotionDemo(null);
    setMotionRun((current) => current + 1);
    const start = () => setActiveMotionDemo(id);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(start);
    else setTimeout(start, 0);
  };
  const visual = visibleRows.length > 0 ? renderActiveCategory({ theme, rows: visibleRows, allRows: rows, category: selectedCategory, modes, onCopy: copy, activeDemo: activeMotionDemo, run: motionRun, onTrigger: triggerMotion }) : null;
  return h('section', { className: 'muxui-foundations-gallery', 'data-muxui-foundations-gallery': 'true', 'data-muxui-foundations-scheme': modes.colorScheme, 'aria-labelledby': 'muxui-foundations-title' },
    h('header', { className: 'muxui-foundations-header' },
      h('div', null, h('p', { className: 'muxui-foundations-eyebrow' }, 'Mux UI foundations'), h('h1', { id: 'muxui-foundations-title' }, 'Foundations'), h('p', null, 'Inspect canonical theme tokens, aliases, and mode behavior.')),
      h('output', { className: 'muxui-foundations-status', 'aria-live': 'polite', 'data-muxui-foundations-copy-status': true }, copyStatus),
    ),
    h('div', { className: 'muxui-foundations-toolbar' },
      h('label', { className: 'muxui-foundations-search', htmlFor: 'muxui-foundations-search' },
        h('span', null, 'Search tokens'),
        h('input', { id: 'muxui-foundations-search', type: 'search', value: query, onChange: (event) => setQuery(event.target.value), placeholder: 'Search by name, meaning, or CSS variable', 'data-muxui-foundations-search': true }),
      ),
      h('fieldset', { className: 'muxui-foundations-modes' },
        h('legend', null, 'Select displayed mode'),
        themeModeSelect({ axis: 'colorScheme', value: modes.colorScheme, options: modeOptions(theme, 'colorScheme'), onChange: (value) => updateMode('colorScheme', value) }),
        themeModeSelect({ axis: 'contrast', value: modes.contrast, options: modeOptions(theme, 'contrast'), onChange: (value) => updateMode('contrast', value) }),
        themeModeSelect({ axis: 'density', value: modes.density, options: modeOptions(theme, 'density'), onChange: (value) => updateMode('density', value) }),
        themeModeSelect({ axis: 'motion', value: modes.motion, options: modeOptions(theme, 'motion'), onChange: (value) => updateMode('motion', value) }),
      ),
    ),
    h(ModeComparisons, { theme, modes }),
    h(ResponsiveDimensionPreview, { theme, modes }),
    h('div', { className: 'muxui-foundations-layout' },
      h(CategoryNav, { selected: selectedCategory, counts, onSelect: setCategory }),
      h('div', { className: 'muxui-foundations-content' },
        h('div', { className: 'muxui-foundations-content-header' },
          h('div', null, h('h2', null, CATEGORY_BY_ID.get(selectedCategory).label), h('p', null, visibleRows.length + ' of ' + counts[selectedCategory] + ' tokens')),
          h('code', null, 'source: catalog/tokens/default-theme.json'),
        ),
        visual ?? h('p', { className: 'muxui-foundations-empty', role: 'status' }, query ? 'No tokens match this search.' : 'No supported token facts are available in this category.'),
      ),
    ),
  );
}

export function createFoundationsGalleryStory() {
  return {
    name: 'Token gallery',
    parameters: {
      layout: 'fullscreen',
      controls: { disable: true },
      muxuiFoundations: { source: 'catalog/tokens/default-theme.json', categories: FOUNDATIONS_CATEGORY_INVENTORY.map(({ id }) => id) },
    },
    render: (args = {}) => h(FoundationsGallery, { theme: args.theme ?? defaultTheme }),
  };
}

export const foundationsSource = Object.freeze({
  id: defaultTheme.id,
  schemaVersion: defaultTheme.schemaVersion,
  tokenContractVersion: defaultTheme.tokenContractVersion,
});
