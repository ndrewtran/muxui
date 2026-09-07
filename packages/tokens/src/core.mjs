/* Pure token value formatting shared by browser authoring and Node transforms. */
const LAYER_RANK = Object.freeze({ reference: 0, semantic: 1, component: 2 });
const MODE_AXES = Object.freeze(['colorScheme', 'contrast', 'motion', 'density', 'direction']);

export function cssName(tokenId) {
  return `--muxui-${tokenId.replaceAll('.', '-')}`;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatEffectLength(length) {
  return `${formatNumber(length.value)}${length.unit}`;
}

function formatEffectColor(color) {
  if (color.alpha === undefined) return color.value;
  const hex = color.value.slice(1);
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  // Legacy rgba syntax preserves the reference alpha rasterization in Chromium.
  return `rgba(${red}, ${green}, ${blue}, ${formatNumber(color.alpha)})`;
}

function effectCssValue(effect) {
  return effect.layers.map((layer) => [
    layer.inset ? 'inset' : null,
    formatEffectLength(layer.offsetX),
    formatEffectLength(layer.offsetY),
    formatEffectLength(layer.blur),
    formatEffectLength(layer.spread),
    formatEffectColor(layer.color),
  ].filter(Boolean).join(' ')).join(', ');
}

export function cssValue(token) {
  const effect = token.effect ?? (token.type === 'effect' ? token.value : undefined);
  if (effect) return effectCssValue(effect);
  if (token.fluid) {
    const { min, max, coefficient, offset, lengthUnit, viewportUnit } = token.fluid;
    return `clamp(${formatNumber(min)}${lengthUnit}, calc(${formatNumber(coefficient)}${viewportUnit} + ${formatNumber(offset)}${lengthUnit}), ${formatNumber(max)}${lengthUnit})`;
  }
  if (token.formula?.kind === 'multiply') return `calc(var(${cssName(token.formula.token)}) * ${formatNumber(token.formula.factor)})`;
  if (token.mix) return `color-mix(in ${token.mix.space}, var(${cssName(token.mix.token)}) ${formatNumber(token.mix.weight * 100)}%, ${token.mix.color})`;
  if (token.relative) return `${formatNumber(token.relative.value)}${token.relative.unit}`;
  if (token.unit === 'px') return `${token.value}px`;
  if (token.unit === 'ms') return `${token.value}ms`;
  return String(token.value);
}

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function defaultFail(code, message) { throw new TypeError(`${code}: ${message}`); }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort(compareText).map((key) => [key, canonicalValue(value[key])]));
}

function sameStructuredValue(left, right) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

const TOKEN_ID = /^(reference|semantic|component)\.[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/u;
const SAFE_OVERRIDE_STRING = /^[a-zA-Z0-9 .,+#%()/_-]+$/u;

function mixColor(left, right, weight) {
  const rgba = (hex) => [1, 3, 5, 7].map((index, channel) => channel === 3 ? Number.parseInt(hex.slice(index, index + 2) || 'ff', 16) / 255 : Number.parseInt(hex.slice(index, index + 2), 16));
  const [leftRed, leftGreen, leftBlue, leftAlpha] = rgba(left);
  const [rightRed, rightGreen, rightBlue, rightAlpha] = rgba(right);
  const alpha = leftAlpha * weight + rightAlpha * (1 - weight);
  const channels = [[leftRed, rightRed], [leftGreen, rightGreen], [leftBlue, rightBlue]].map(([leftChannel, rightChannel]) => Math.round((alpha === 0 ? 0 : (leftChannel * leftAlpha * weight + rightChannel * rightAlpha * (1 - weight)) / alpha)));
  const encoded = [...channels, Math.round(alpha * 255)].map((channel) => channel.toString(16).padStart(2, '0'));
  return `#${encoded.slice(0, encoded[3] === 'ff' ? 3 : 4).join('')}`;
}

function validateEffectValue(value, path, fail) {
  if (!isRecord(value) || Object.keys(value).some((key) => !['kind', 'layers'].includes(key)) || value.kind !== 'shadow' || !Array.isArray(value.layers) || value.layers.length < 1) {
    fail('MUXUI_TOKEN_TYPE_MISMATCH', `${path} must be a typed shadow effect`, { path });
  }
  for (const [index, layer] of value.layers.entries()) {
    const layerPath = `${path}/layers/${index}`;
    if (!isRecord(layer) || Object.keys(layer).some((key) => !['offsetX', 'offsetY', 'blur', 'spread', 'color', 'inset'].includes(key)) || !isRecord(layer.offsetX) || !isRecord(layer.offsetY) || !isRecord(layer.blur) || !isRecord(layer.spread) || !isRecord(layer.color)) {
      fail('MUXUI_TOKEN_TYPE_MISMATCH', `${layerPath} must declare typed shadow geometry`, { path: layerPath });
    }
    if (layer.inset !== undefined && typeof layer.inset !== 'boolean') {
      fail('MUXUI_TOKEN_TYPE_MISMATCH', `${layerPath}/inset must be a boolean`, { path: `${layerPath}/inset` });
    }
    for (const key of ['offsetX', 'offsetY', 'blur', 'spread']) {
      const length = layer[key];
      if (!isRecord(length) || Object.keys(length).some((field) => !['value', 'unit'].includes(field)) || !Number.isFinite(length.value) || !['px', 'rem'].includes(length.unit) || (key === 'blur' && length.value < 0)) fail('MUXUI_TOKEN_TYPE_MISMATCH', `${layerPath}/${key} must be a finite ${key === 'blur' ? 'non-negative ' : ''}px/rem length`, { path: `${layerPath}/${key}` });
    }
    if (Object.keys(layer.color).some((key) => !['value', 'alpha'].includes(key)) || typeof layer.color.value !== 'string' || !/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/.test(layer.color.value) || (layer.color.alpha !== undefined && (!Number.isFinite(layer.color.alpha) || layer.color.alpha < 0 || layer.color.alpha > 1)) || (layer.color.value.length === 9 && layer.color.alpha !== undefined)) {
      fail('MUXUI_TOKEN_TYPE_MISMATCH', `${layerPath}/color must be a hex color with optional alpha`, { path: `${layerPath}/color` });
    }
  }
}

export function validatePureLiteral(type, unit, value, path, fail = defaultFail) {
  const expected = ['dimension', 'duration', 'number'].includes(type) ? 'number' : type === 'effect' ? 'object' : 'string';
  if (typeof value !== expected || (typeof value === 'number' && !Number.isFinite(value))) fail('MUXUI_TOKEN_TYPE_MISMATCH', `${path} must be a ${expected}`, { path, type, unit });
  const units = { color: ['hex'], dimension: ['px'], duration: ['ms'], number: ['unitless'], string: ['string'], effect: ['structured'] };
  if (!units[type]?.includes(unit)) fail('MUXUI_TOKEN_UNIT_MISMATCH', `${path} has incompatible unit ${unit}`, { path, type, unit });
  if (type === 'color' && !/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/.test(value)) fail('MUXUI_TOKEN_TYPE_MISMATCH', `${path} must be a six- or eight-digit hex color`, { path });
  if (type === 'effect') validateEffectValue(value, path, fail);
}

function validateDecoration(definition, type, path, fail) {
  const decorations = ['fluid', 'formula', 'effect', 'relative', 'mix'].filter((key) => definition[key] !== undefined);
  if (decorations.length > 1) fail('MUXUI_TOKEN_DECORATION_INVALID', `${path} cannot combine ${decorations.join(', ')}`, { path });
  if (definition.fluid !== undefined) {
    const value = definition.fluid;
    if (type !== 'dimension' || !isRecord(value) || Object.keys(value).some((key) => !['min', 'max', 'coefficient', 'offset', 'lengthUnit', 'viewportUnit', 'default'].includes(key)) || !['rem', 'px'].includes(value.lengthUnit) || value.viewportUnit !== 'vw' || ['min', 'max', 'coefficient', 'offset'].some((key) => !Number.isFinite(value[key]))) fail('MUXUI_TOKEN_DECORATION_INVALID', `${path}.fluid is not a supported fluid recipe`, { path });
    if (value.default !== undefined && (!isRecord(value.default) || Object.keys(value.default).some((key) => !['value', 'unit'].includes(key)) || !Number.isFinite(value.default.value) || value.default.unit !== 'rem')) fail('MUXUI_TOKEN_DECORATION_INVALID', `${path}.fluid.default must be a typed static rem length`, { path });
  }
  if (definition.formula !== undefined) {
    const value = definition.formula;
    if (type !== 'dimension' || !isRecord(value) || Object.keys(value).some((key) => !['kind', 'token', 'factor'].includes(key)) || value.kind !== 'multiply' || !TOKEN_ID.test(value.token) || !Number.isFinite(value.factor)) fail('MUXUI_TOKEN_DECORATION_INVALID', `${path}.formula is not a supported multiply recipe`, { path });
  }
  if (definition.relative !== undefined) {
    const value = definition.relative;
    if (type !== 'dimension' || !isRecord(value) || Object.keys(value).some((key) => !['value', 'unit'].includes(key)) || !Number.isFinite(value.value) || value.unit !== 'rem') fail('MUXUI_TOKEN_DECORATION_INVALID', `${path}.relative is not a supported rem recipe`, { path });
  }
  if (definition.mix !== undefined) {
    const value = definition.mix;
    if (type !== 'color' || !isRecord(value) || Object.keys(value).some((key) => !['space', 'token', 'color', 'weight'].includes(key)) || value.space !== 'srgb' || !TOKEN_ID.test(value.token) || !/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/.test(value.color) || !Number.isFinite(value.weight) || value.weight < 0 || value.weight > 1) fail('MUXUI_TOKEN_DECORATION_INVALID', `${path}.mix is not a supported srgb color mix`, { path });
  }
  if (definition.effect !== undefined) {
    if (type !== 'effect') fail('MUXUI_TOKEN_DECORATION_INVALID', `${path}.effect only applies to effects`, { path });
    validateEffectValue(definition.effect, `${path}.effect`, fail);
  }
}

function selectedBranch(definition, modes) {
  for (const axis of MODE_AXES) {
    const key = `${axis}.${modes[axis]}`;
    if (Object.hasOwn(definition.modes ?? {}, key)) return definition.modes[key];
  }
  return definition;
}

function assertModes(source, modes, fail) {
  if (modes !== undefined && (!isRecord(modes) || Object.keys(modes).some((axis) => !MODE_AXES.includes(axis)))) fail('MUXUI_TOKEN_MODE_INVALID', 'requested modes contain an unsupported axis');
  const selected = {};
  for (const axis of MODE_AXES) {
    const values = source.theme.modeAxes[axis];
    const value = modes?.[axis] ?? source.theme.defaultModes[axis];
    if (!Array.isArray(values) || !values.includes(value)) fail('MUXUI_TOKEN_MODE_INVALID', `${axis}.${value} is not declared`, { axis, value });
    selected[axis] = value;
  }
  return Object.freeze(selected);
}

export function compilePureTokenGraph(source, { modes, responsive = false, overrides = {}, allowReferenceOverrides = false, fail = defaultFail } = {}) {
  if (!isRecord(source) || !isRecord(source.tokens) || !isRecord(source.theme)) fail('MUXUI_TOKEN_SOURCE_INVALID', 'token graph source must contain theme and tokens');
  if (typeof responsive !== 'boolean') fail('MUXUI_TOKEN_OPTIONS_INVALID', 'responsive must be a boolean');
  const selectedModes = assertModes(source, modes, fail);
  for (const [id, definition] of Object.entries(source.tokens)) {
    if (!TOKEN_ID.test(id) || !isRecord(definition) || !Object.hasOwn(LAYER_RANK, definition.layer) || !id.startsWith(`${definition.layer}.`)) fail('MUXUI_TOKEN_SOURCE_INVALID', `${id} must have a valid token identity and layer`, { tokenId: id });
    if (Object.keys(definition).some((key) => !['layer', 'type', 'unit', 'meaning', 'overridePolicy', 'value', 'alias', 'equivalence', 'fluid', 'formula', 'relative', 'mix', 'modes', 'platformRestrictions'].includes(key))) fail('MUXUI_TOKEN_SOURCE_INVALID', `${id} contains an unsupported field`, { tokenId: id });
    validateDecoration(definition, definition.type, `tokens/${id}`, fail);
    if (Object.hasOwn(definition, 'alias') && ['value', 'fluid', 'formula', 'relative', 'mix'].some((key) => Object.hasOwn(definition, key))) fail('MUXUI_TOKEN_DECORATION_INVALID', `${id} combines an alias with another value`, { tokenId: id });
    if (definition.modes !== undefined && !isRecord(definition.modes)) fail('MUXUI_TOKEN_MODE_INVALID', `${id} modes must be an object`, { tokenId: id });
    for (const [mode, branch] of Object.entries(definition.modes ?? {})) {
      const [axis, value, extra] = mode.split('.');
      if (extra !== undefined || !MODE_AXES.includes(axis) || !source.theme.modeAxes[axis]?.includes(value)) fail('MUXUI_TOKEN_MODE_INVALID', `${id} has an undeclared mode ${mode}`, { tokenId: id });
      if (!isRecord(branch) || Object.keys(branch).some((key) => !['value', 'alias', 'fluid', 'formula', 'relative', 'mix'].includes(key))) fail('MUXUI_TOKEN_DECORATION_INVALID', `${id} mode ${mode} contains unsupported fields`, { tokenId: id });
      validateDecoration(branch, definition.type, `tokens/${id}/modes/${mode}`, fail);
      if (Object.hasOwn(branch, 'alias') && Object.keys(branch).length !== 1) fail('MUXUI_TOKEN_DECORATION_INVALID', `${id} mode ${mode} combines an alias with another value`, { tokenId: id });
    }
  }
  if (!isRecord(overrides)) fail('MUXUI_TOKEN_OVERRIDE_UNAUTHORIZED', 'consumer overrides must be an object');
  const normalizedOverrides = {};
  for (const tokenId of Object.keys(overrides).sort(compareText)) {
    const definition = source.tokens[tokenId];
    if (!definition) fail('MUXUI_TOKEN_OVERRIDE_UNKNOWN', `${tokenId} is not a canonical token`, { tokenId });
    const referenceAllowed = typeof allowReferenceOverrides === 'function' ? allowReferenceOverrides(tokenId, definition) : allowReferenceOverrides;
    if ((!referenceAllowed && definition.layer === 'reference') || (definition.overridePolicy === 'fixed' && !referenceAllowed)) fail('MUXUI_TOKEN_OVERRIDE_UNAUTHORIZED', `${tokenId} cannot be overridden`, { tokenId });
    const override = overrides[tokenId];
    if (!isRecord(override) || Object.keys(override).some((key) => !['type', 'unit', 'value', 'fluid', 'formula', 'effect', 'relative', 'mix'].includes(key))) fail('MUXUI_TOKEN_OVERRIDE_UNAUTHORIZED', `${tokenId} override contains unsupported fields`, { tokenId });
    if (override.type !== definition.type || override.unit !== definition.unit) fail('MUXUI_TOKEN_TYPE_MISMATCH', `${tokenId} override changes type or unit`, { tokenId });
    validatePureLiteral(override.type, override.unit, override.value, `overrides/${tokenId}`, fail);
    if (override.type === 'string' && !SAFE_OVERRIDE_STRING.test(override.value)) fail('MUXUI_TOKEN_STRING_INVALID', `${tokenId} override must use the supported CSS string grammar`, { tokenId });
    validateDecoration(override, override.type, `overrides/${tokenId}`, fail);
    if (override.effect !== undefined && !sameStructuredValue(override.effect, override.value)) {
      fail('MUXUI_TOKEN_DECORATION_INVALID', `${tokenId} override effect must match its canonical value`, { tokenId });
    }
    normalizedOverrides[tokenId] = structuredClone(override);
  }
  const resolved = new Map(); const dependencies = new Map(); const visiting = [];
  const resolveToken = (tokenId) => {
    if (resolved.has(tokenId)) return resolved.get(tokenId);
    const definition = source.tokens[tokenId];
    if (!definition) fail('MUXUI_TOKEN_ALIAS_MISSING', `${tokenId} does not exist`, { tokenId });
    if (visiting.includes(tokenId)) fail('MUXUI_TOKEN_ALIAS_CYCLE', `token alias cycle: ${[...visiting, tokenId].join(' -> ')}`, { cycle: [...visiting, tokenId] });
    visiting.push(tokenId);
    const override = normalizedOverrides[tokenId];
    const branch = override ?? selectedBranch(definition, selectedModes);
    validateDecoration(branch, definition.type, `tokens/${tokenId}`, fail);
    let value; let sourceKind = override ? 'authoring-override' : 'literal'; let decoration = { fluid: branch.fluid, formula: branch.formula, relative: branch.relative, mix: branch.mix, effect: branch.effect ?? (definition.type === 'effect' ? branch.value : undefined) };
    if (Object.hasOwn(branch, 'alias')) {
      if (override || ['value', 'fluid', 'formula', 'relative', 'mix', 'effect'].some((key) => Object.hasOwn(branch, key))) fail('MUXUI_TOKEN_DECORATION_INVALID', `${tokenId} aliases cannot declare a literal or decoration`, { tokenId });
      const targetId = branch.alias; const target = source.tokens[targetId];
      if (!target) fail('MUXUI_TOKEN_ALIAS_MISSING', `${tokenId} aliases missing ${targetId}`, { tokenId, targetId });
      if (LAYER_RANK[target.layer] > LAYER_RANK[definition.layer]) fail('MUXUI_TOKEN_LAYER_DIRECTION', `${tokenId} cannot alias forward to ${targetId}`, { tokenId, targetId });
      if (target.layer === definition.layer && definition.equivalence !== 'semantic-equivalence' && definition.equivalence !== 'deprecation-bridge') fail('MUXUI_TOKEN_LAYER_DIRECTION', `${tokenId} same-layer alias requires an explicit equivalence`, { tokenId, targetId });
      if (target.type !== definition.type || target.unit !== definition.unit) fail('MUXUI_TOKEN_TYPE_MISMATCH', `${tokenId} and ${targetId} have incompatible type or unit`, { tokenId, targetId });
      const resolvedTarget = resolveToken(targetId); value = resolvedTarget.value; decoration = { ...decoration, fluid: resolvedTarget.fluid, formula: resolvedTarget.formula, relative: resolvedTarget.relative, mix: resolvedTarget.mix, effect: resolvedTarget.effect }; dependencies.set(tokenId, [targetId]); sourceKind = 'alias';
    } else {
      if (branch.formula?.kind === 'multiply') {
        const target = source.tokens[branch.formula.token];
        if (!target) fail('MUXUI_TOKEN_FORMULA_MISSING', `${tokenId} formula references missing ${branch.formula.token}`, { tokenId, targetId: branch.formula.token });
        if (LAYER_RANK[target.layer] > LAYER_RANK[definition.layer]) fail('MUXUI_TOKEN_LAYER_DIRECTION', `${tokenId} formula cannot reference forward to ${branch.formula.token}`, { tokenId, targetId: branch.formula.token });
        if (target.type !== definition.type || target.unit !== definition.unit) fail('MUXUI_TOKEN_TYPE_MISMATCH', `${tokenId} formula target has incompatible type or unit`, { tokenId, targetId: branch.formula.token });
        const resolvedTarget = resolveToken(branch.formula.token);
        value = resolvedTarget.value * branch.formula.factor;
        if (resolvedTarget.relative) decoration.relative = { value: resolvedTarget.relative.value * branch.formula.factor, unit: 'rem' };
        dependencies.set(tokenId, [branch.formula.token]);
        sourceKind = override ? 'authoring-override' : 'formula';
      } else if (branch.mix) {
        const target = source.tokens[branch.mix.token];
        if (!target) fail('MUXUI_TOKEN_MIX_MISSING', `${tokenId} mix references missing ${branch.mix.token}`, { tokenId, targetId: branch.mix.token });
        if (LAYER_RANK[target.layer] > LAYER_RANK[definition.layer]) fail('MUXUI_TOKEN_LAYER_DIRECTION', `${tokenId} mix cannot reference forward to ${branch.mix.token}`, { tokenId, targetId: branch.mix.token });
        if (target.type !== 'color' || target.unit !== 'hex') fail('MUXUI_TOKEN_TYPE_MISMATCH', `${tokenId} mix target has incompatible type or unit`, { tokenId, targetId: branch.mix.token });
        const resolvedTarget = resolveToken(branch.mix.token);
        value = mixColor(resolvedTarget.value, branch.mix.color, branch.mix.weight);
        dependencies.set(tokenId, [branch.mix.token]);
        sourceKind = override ? 'authoring-override' : 'mix';
      } else {
        validatePureLiteral(definition.type, definition.unit, branch.value, `tokens/${tokenId}`, fail); value = branch.value; dependencies.set(tokenId, []);
      }
    }
    // Donor-compatible dimensions keep static defaults; fluid recipes are opt-in.
    if (decoration.fluid?.default && !responsive) {
      decoration.relative = { ...decoration.fluid.default };
      decoration.fluid = undefined;
    }
    visiting.pop();
    const result = Object.freeze({ id: tokenId, layer: definition.layer, type: definition.type, unit: definition.unit, value, overridePolicy: definition.overridePolicy, source: sourceKind, ...decoration });
    resolved.set(tokenId, result); return result;
  };
  for (const tokenId of Object.keys(source.tokens).sort(compareText)) resolveToken(tokenId);
  return Object.freeze({ modes: selectedModes, responsive, tokens: Object.freeze(Object.fromEntries([...resolved.entries()].sort(([a], [b]) => compareText(a, b)))), dependencies: Object.freeze(Object.fromEntries([...dependencies.entries()].sort(([a], [b]) => compareText(a, b)))) });
}
