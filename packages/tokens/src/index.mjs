import { canonicalDigest, canonicalJson, validateFamily } from '@muxui/schema';
import { compilePureTokenGraph, cssDeclaration } from './core.mjs';

const UNIT_BY_TYPE = Object.freeze({
  color: new Set(['hex']),
  dimension: new Set(['px']),
  duration: new Set(['ms']),
  number: new Set(['unitless']),
  string: new Set(['string']),
  effect: new Set(['structured']),
});
const MODE_AXES = Object.freeze(['colorScheme', 'contrast', 'motion', 'density', 'direction']);
const PROFILE_IDS = new Set([
  'web.html',
  'web.react',
  'native.ios',
  'native.android',
  'native.react-native-web',
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class TokenContractError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'TokenContractError';
    this.code = code;
    this.details = Object.freeze(structuredClone(details));
  }
}

function fail(code, message, details) {
  throw new TokenContractError(code, message, details);
}

const CROSSWALK_TARGETS = Object.freeze([
  'web.html',
  'web.react',
  'native.ios',
  'native.android',
  'native.react-native-web',
]);

function assertCrosswalkTargets(entry, path) {
  const values = CROSSWALK_TARGETS.map((profile) => entry.targets[profile]);
  if (['adopt', 'adapt'].includes(entry.disposition)) {
    if (!values.includes('direct') || values.some((value) => !['direct', 'deferred'].includes(value))) {
      fail('MUXUI_TOKEN_CROSSWALK_TARGET_INVALID', `${path} admitted targets require direct output and no rejection`, { path });
    }
  } else if (entry.disposition === 'defer' && values.some((value) => value !== 'deferred')) {
    fail('MUXUI_TOKEN_CROSSWALK_TARGET_INVALID', `${path} deferred targets must all be deferred`, { path });
  } else if (entry.disposition === 'reject' && values.some((value) => value !== 'rejected')) {
    fail('MUXUI_TOKEN_CROSSWALK_TARGET_INVALID', `${path} rejected targets must all be rejected`, { path });
  }
}

function assertGroupSemantics(group, path) {
  const ordinals = group.members.map(({ ordinal }) => ordinal);
  if (new Set(ordinals).size !== ordinals.length || ordinals.some((ordinal, index) => index > 0 && ordinal <= ordinals[index - 1])) {
    fail('MUXUI_TOKEN_CROSSWALK_GROUP_INVALID', `${path} members must use unique ascending ordinals`, { path });
  }
  for (const [index, member] of group.members.entries()) {
    const memberPath = `${path}/members/${index}`;
    if (group.relationship === 'equivalent-source-values') {
      if (member.role !== 'equivalent-source-value' || member.mode !== undefined) {
        fail('MUXUI_TOKEN_CROSSWALK_GROUP_INVALID', `${memberPath} must be an unmoded equivalent source value`, { path: memberPath });
      }
    } else if (group.relationship === 'selector-variants') {
      if (!['base', 'web-responsive'].includes(member.role) || member.mode !== undefined) {
        fail('MUXUI_TOKEN_CROSSWALK_GROUP_INVALID', `${memberPath} must be an unmoded selector variant`, { path: memberPath });
      }
    } else {
      const expectedMode = member.role === 'default' ? 'motion.full'
        : ['reduced-system', 'reduced-explicit'].includes(member.role) ? 'motion.reduced' : null;
      if (member.mode !== expectedMode) {
        fail('MUXUI_TOKEN_CROSSWALK_GROUP_INVALID', `${memberPath} has an invalid motion role/mode`, { path: memberPath });
      }
    }
  }
}

function assertBaselineSemantics(baseline, occurrences) {
  const customProperties = occurrences.filter(({ name }) => name.startsWith('--'));
  const nonCustomProperties = occurrences.length - customProperties.length;
  const uniqueCustomPropertyNames = new Set(customProperties.map(({ name }) => name)).size;
  if (
    baseline.declarationOccurrences !== occurrences.length
    || baseline.customPropertyOccurrences !== customProperties.length
    || baseline.nonCustomPropertyOccurrences !== nonCustomProperties
    || baseline.uniqueCustomPropertyNames !== uniqueCustomPropertyNames
    || baseline.customPropertyOccurrences + baseline.nonCustomPropertyOccurrences
      !== baseline.declarationOccurrences
    || baseline.uniqueCustomPropertyNames > baseline.customPropertyOccurrences
  ) {
    fail(
      'MUXUI_TOKEN_CROSSWALK_BASELINE_INVALID',
      'baseline counts must exactly describe the explicitly supplied occurrences',
      {
        expected: {
          declarationOccurrences: occurrences.length,
          customPropertyOccurrences: customProperties.length,
          uniqueCustomPropertyNames,
          nonCustomPropertyOccurrences: nonCustomProperties,
        },
      },
    );
  }
}

function assertRelationshipClosure(group, memberEntries, path) {
  const roles = group.members.map(({ role }) => role);
  if (group.relationship === 'equivalent-source-values') {
    const values = new Set(memberEntries.map(({ occurrence }) => occurrence.value));
    const dispositions = new Set(memberEntries.map(({ disposition }) => disposition));
    const muxuiTokenIds = new Set(memberEntries.map(({ muxuiTokenId }) => muxuiTokenId ?? null));
    if (values.size !== 1 || dispositions.size !== 1 || muxuiTokenIds.size !== 1) {
      fail(
        'MUXUI_TOKEN_CROSSWALK_GROUP_INVALID',
        `${path} equivalent members must share value, disposition, and MuxUI-token identity`,
        { path },
      );
    }
    const muxuiTokenId = memberEntries[0].muxuiTokenId;
    if ((muxuiTokenId === undefined) !== (group.muxuiTokenId === undefined)
      || (muxuiTokenId !== undefined && group.muxuiTokenId !== muxuiTokenId)) {
      fail('MUXUI_TOKEN_CROSSWALK_GROUP_INVALID', `${path} must bind its members' exact Mux UI token`, { path });
    }
    return;
  }
  if (group.relationship === 'selector-variants') {
    const baseEntries = memberEntries.filter((_, index) => roles[index] === 'base');
    const responsiveEntries = memberEntries.filter((_, index) => roles[index] === 'web-responsive');
    if (
      baseEntries.length !== 1
      || responsiveEntries.length < 1
      || !['adopt', 'adapt'].includes(baseEntries[0].disposition)
      || baseEntries[0].muxuiTokenId === undefined
      || group.muxuiTokenId !== baseEntries[0].muxuiTokenId
      || responsiveEntries.some(({ disposition, muxuiTokenId }) => (
        disposition !== 'defer' || muxuiTokenId !== undefined
      ))
    ) {
      fail(
        'MUXUI_TOKEN_CROSSWALK_GROUP_INVALID',
        `${path} requires one admitted base and one or more deferred responsive variants`,
        { path },
      );
    }
    return;
  }
  const expectedRoles = ['default', 'reduced-system', 'reduced-explicit'];
  if (
    roles.length !== expectedRoles.length
    || expectedRoles.some((role) => roles.filter((candidate) => candidate === role).length !== 1)
    || group.muxuiTokenId !== undefined
    || memberEntries.some(({ disposition, muxuiTokenId }) => (
      disposition !== 'defer' || muxuiTokenId !== undefined
    ))
  ) {
    fail(
      'MUXUI_TOKEN_CROSSWALK_GROUP_INVALID',
      `${path} requires one deferred default and both deferred reduced-motion variants`,
      { path },
    );
  }
}

export function validateSourceCrosswalk(source, { baselineOccurrences } = {}) {
  validateFamily('token-source', source);
  const crosswalk = source.sourceCrosswalk;
  if (crosswalk === undefined) {
    if (baselineOccurrences !== undefined) {
      fail('MUXUI_TOKEN_CROSSWALK_BASELINE_INVALID', 'an omitted crosswalk cannot consume a baseline');
    }
    return Object.freeze({ status: 'absent', digest: null, crosswalk: null });
  }
  if (!Array.isArray(baselineOccurrences)) {
    fail('MUXUI_TOKEN_CROSSWALK_BASELINE_INVALID', 'semantic validation requires explicit baseline occurrences');
  }
  assertBaselineSemantics(crosswalk.baseline, baselineOccurrences);
  const entries = crosswalk.entries;
  if (
    baselineOccurrences.length !== crosswalk.baseline.declarationOccurrences
    || entries.length !== baselineOccurrences.length
  ) {
    fail('MUXUI_TOKEN_CROSSWALK_COVERAGE_INVALID', 'crosswalk must cover the complete supplied baseline', {
      baseline: baselineOccurrences.length,
      entries: entries.length,
    });
  }
  const entryByOrdinal = new Map();
  for (const [index, entry] of entries.entries()) {
    const ordinal = entry.occurrence.ordinal;
    if (entryByOrdinal.has(ordinal) || ordinal !== index + 1) {
      fail('MUXUI_TOKEN_CROSSWALK_COVERAGE_INVALID', 'entries must use each contiguous baseline ordinal exactly once', { ordinal, index });
    }
    if (canonicalJson(entry.occurrence) !== canonicalJson(baselineOccurrences[index])) {
      fail('MUXUI_TOKEN_CROSSWALK_BASELINE_INVALID', 'entry occurrence differs from the supplied baseline', { ordinal });
    }
    if (['adopt', 'adapt'].includes(entry.disposition)) {
      const target = source.tokens[entry.muxuiTokenId];
      if (!target || target.layer !== 'reference') {
        fail('MUXUI_TOKEN_CROSSWALK_TARGET_INVALID', `${entry.muxuiTokenId} must be an existing reference token`, { ordinal });
      }
    } else if (Object.hasOwn(entry, 'muxuiTokenId')) {
      fail('MUXUI_TOKEN_CROSSWALK_TARGET_INVALID', `${entry.disposition} cannot claim a Mux UI token`, { ordinal });
    }
    assertCrosswalkTargets(entry, `sourceCrosswalk/entries/${index}`);
    entryByOrdinal.set(ordinal, entry);
  }
  const groupById = new Map();
  const groupedOrdinals = new Map();
  for (const [index, group] of crosswalk.groups.entries()) {
    const path = `sourceCrosswalk/groups/${index}`;
    if (groupById.has(group.id)) {
      fail('MUXUI_TOKEN_CROSSWALK_GROUP_INVALID', `${group.id} is duplicated`, { path });
    }
    if (index > 0 && group.id <= crosswalk.groups[index - 1].id) {
      fail('MUXUI_TOKEN_CROSSWALK_GROUP_INVALID', 'groups must use strict bytewise ID order', { path });
    }
    assertGroupSemantics(group, path);
    const memberEntries = [];
    for (const member of group.members) {
      const entry = entryByOrdinal.get(member.ordinal);
      if (!entry || entry.groupId !== group.id || groupedOrdinals.has(member.ordinal)) {
        fail('MUXUI_TOKEN_CROSSWALK_GROUP_INVALID', `${group.id} membership is incomplete or duplicated`, { ordinal: member.ordinal });
      }
      memberEntries.push(entry);
      if (
        group.relationship === 'equivalent-source-values'
        && group.muxuiTokenId !== undefined
        && entry.muxuiTokenId !== group.muxuiTokenId
      ) {
        fail('MUXUI_TOKEN_CROSSWALK_GROUP_INVALID', `${group.id} Mux UI token differs from its member`, { ordinal: member.ordinal });
      }
      groupedOrdinals.set(member.ordinal, group.id);
    }
    assertRelationshipClosure(group, memberEntries, path);
    groupById.set(group.id, group);
  }
  for (const entry of entries) {
    if (entry.groupId !== undefined && groupedOrdinals.get(entry.occurrence.ordinal) !== entry.groupId) {
      fail('MUXUI_TOKEN_CROSSWALK_GROUP_INVALID', `${entry.groupId} lacks the reciprocal group member`, { ordinal: entry.occurrence.ordinal });
    }
  }
  const ordinalsByCoreToken = new Map();
  for (const entry of entries) {
    if (entry.muxuiTokenId === undefined) continue;
    const ordinals = ordinalsByCoreToken.get(entry.muxuiTokenId) ?? [];
    ordinals.push(entry.occurrence.ordinal);
    ordinalsByCoreToken.set(entry.muxuiTokenId, ordinals);
  }
  for (const [muxuiTokenId, ordinals] of ordinalsByCoreToken) {
    if (ordinals.length < 2) continue;
    const groupIds = new Set(ordinals.map((ordinal) => entryByOrdinal.get(ordinal).groupId));
    if (groupIds.size !== 1 || groupIds.has(undefined) || !groupById.has([...groupIds][0])) {
      fail(
        'MUXUI_TOKEN_CROSSWALK_GROUP_INVALID',
        `${muxuiTokenId} repeated mappings require one explicit complete group`,
        { muxuiTokenId, ordinals },
      );
    }
  }
  return Object.freeze({
    status: 'available',
    digest: canonicalDigest(crosswalk),
    crosswalk: Object.freeze(structuredClone(crosswalk)),
  });
}

function validateLiteral(type, unit, value, path) {
  const expected = ['dimension', 'duration', 'number'].includes(type) ? 'number'
    : type === 'effect' ? 'object' : 'string';
  if (typeof value !== expected || (typeof value === 'number' && !Number.isFinite(value))) {
    fail('MUXUI_TOKEN_TYPE_MISMATCH', `${path} must be a ${expected}`, { path, type, unit });
  }
  if (!UNIT_BY_TYPE[type]?.has(unit)) {
    fail('MUXUI_TOKEN_UNIT_MISMATCH', `${path} has incompatible unit ${unit}`, { path, type, unit });
  }
  if (type === 'color' && !/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/.test(value)) {
    fail('MUXUI_TOKEN_TYPE_MISMATCH', `${path} must be a six- or eight-digit hex color`, { path });
  }
  if (type === 'effect') validateEffect(value, path);
}

function validateEffect(value, path) {
  if (!isObject(value) || value.kind !== 'shadow' || !Array.isArray(value.layers) || value.layers.length < 1) {
    fail('MUXUI_TOKEN_TYPE_MISMATCH', `${path} must be a typed shadow effect`, { path });
  }
  for (const [index, layer] of value.layers.entries()) {
    const layerPath = `${path}/layers/${index}`;
    if (!isObject(layer) || !isObject(layer.offsetX) || !isObject(layer.offsetY)
      || !isObject(layer.blur) || !isObject(layer.spread) || !isObject(layer.color)) {
      fail('MUXUI_TOKEN_TYPE_MISMATCH', `${layerPath} must declare typed shadow geometry`, { path: layerPath });
    }
    for (const key of ['offsetX', 'offsetY', 'blur', 'spread']) {
      const length = layer[key];
      if (!Number.isFinite(length.value) || !['px', 'rem'].includes(length.unit)) {
        fail('MUXUI_TOKEN_TYPE_MISMATCH', `${layerPath}/${key} must be a finite px/rem length`, { path: `${layerPath}/${key}` });
      }
    }
    if (typeof layer.color.value !== 'string' || !/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/.test(layer.color.value)
      || (layer.color.alpha !== undefined && (!Number.isFinite(layer.color.alpha) || layer.color.alpha < 0 || layer.color.alpha > 1))) {
      fail('MUXUI_TOKEN_TYPE_MISMATCH', `${layerPath}/color must be a hex color with optional alpha`, { path: `${layerPath}/color` });
    }
  }
}

function assertThemeContract(source) {
  if (source.theme.runtimeSwitching !== 'unavailable') {
    fail('MUXUI_THEME_RUNTIME_UNAVAILABLE', 'G1.0 permits static theme output only', {
      runtimeSwitching: source.theme.runtimeSwitching,
    });
  }
  for (const axis of MODE_AXES) {
    const values = source.theme.modeAxes[axis];
    const defaultValue = source.theme.defaultModes[axis];
    if (!Array.isArray(values) || values.length === 0 || new Set(values).size !== values.length) {
      fail('MUXUI_TOKEN_MODE_INVALID', `${axis} must declare unique values`, { axis });
    }
    if (!values.includes(defaultValue)) {
      fail('MUXUI_TOKEN_MODE_INVALID', `${axis} default is not declared`, { axis, defaultValue });
    }
  }
}

export function compileTokenGraph(source, options = {}) {
  if (!isObject(options) || Object.keys(options).some((key) => !['modes', 'overrides', 'responsive'].includes(key))) {
    fail('MUXUI_TOKEN_OPTIONS_INVALID', 'token compilation options must be closed', {
      fields: isObject(options) ? Object.keys(options).sort(compareText) : [],
    });
  }
  validateFamily('token-source', source);
  assertThemeContract(source);
  const graph = compilePureTokenGraph(source, {
    modes: options.modes,
    responsive: options.responsive,
    overrides: options.overrides,
    fail,
  });
  return Object.freeze({
    sourceId: source.id,
    sourceRevision: canonicalDigest(source),
    tokenContractVersion: source.tokenContractVersion,
    theme: source.theme.name,
    modes: graph.modes,
    tokens: graph.tokens,
    dependencies: graph.dependencies,
  });
}

function profileMatches(requirement, profile) {
  return requirement.profiles === undefined || requirement.profiles.includes(profile);
}

function dependencyClosure(graph, tokenId, closure = new Set()) {
  if (closure.has(tokenId)) return closure;
  closure.add(tokenId);
  for (const dependency of graph.dependencies[tokenId] ?? []) dependencyClosure(graph, dependency, closure);
  return closure;
}

function validateFallback(fallback, source, requirement, profile) {
  if (fallback === undefined) return undefined;
  if (!fallback.profiles.includes(profile)) return undefined;
  if (!fallback.evidenceIds?.length) {
    fail('MUXUI_TOKEN_FALLBACK_UNPROVED', `${requirement.token} fallback lacks evidence`, {
      tokenId: requirement.token,
      profile,
    });
  }
  const definition = source.tokens[requirement.token];
  if (fallback.kind === 'token') {
    const target = source.tokens[fallback.token];
    if (!target || target.layer === 'reference' || target.type !== definition.type || target.unit !== definition.unit) {
      fail('MUXUI_TOKEN_FALLBACK_INVALID', `${requirement.token} fallback token is incompatible`, {
        tokenId: requirement.token,
        fallbackToken: fallback.token,
        profile,
      });
    }
  } else {
    if (fallback.type !== definition.type || fallback.unit !== definition.unit) {
      fail('MUXUI_TOKEN_FALLBACK_INVALID', `${requirement.token} fallback literal is incompatible`, {
        tokenId: requirement.token,
        profile,
      });
    }
    validateLiteral(fallback.type, fallback.unit, fallback.value, `fallback/${requirement.token}`);
  }
  return structuredClone(fallback);
}

export function compileTokenRequirementSet({ source, recipe, bindingId, profile, modes }) {
  if (!PROFILE_IDS.has(profile)) fail('MUXUI_TOKEN_PROFILE_INVALID', `${profile} is not supported`, { profile });
  if (!recipe || recipe.source !== source.id || !Array.isArray(recipe.requirements)) {
    fail('MUXUI_TOKEN_RECIPE_INVALID', `${bindingId} must reference ${source.id}`, { bindingId, profile });
  }
  const graph = compileTokenGraph(source, { modes });
  const requirements = recipe.requirements
    .filter((requirement) => profileMatches(requirement, profile))
    .map((requirement) => {
      const definition = source.tokens[requirement.token];
      if (!definition || definition.layer === 'reference') {
        fail('MUXUI_TOKEN_RECIPE_INVALID', `${bindingId} consumes invalid ${requirement.token}`, {
          bindingId,
          profile,
          tokenId: requirement.token,
        });
      }
      const fallback = validateFallback(requirement.fallback, source, requirement, profile);
      return {
        token: requirement.token,
        requirement: requirement.requirement,
        type: definition.type,
        unit: definition.unit,
        modes: Object.keys(definition.modes ?? {}).sort(compareText),
        overridePolicy: definition.overridePolicy,
        ...(fallback === undefined ? {} : { fallback }),
      };
    })
    .sort((left, right) => compareText(left.token, right.token));
  const closureIds = new Set();
  for (const requirement of requirements) {
    dependencyClosure(graph, requirement.token, closureIds);
    if (requirement.fallback?.kind === 'token') {
      dependencyClosure(graph, requirement.fallback.token, closureIds);
    }
  }
  const closure = [...closureIds].sort(compareText).map((tokenId) => {
    const definition = source.tokens[tokenId];
    return {
      token: tokenId,
      layer: definition.layer,
      type: definition.type,
      unit: definition.unit,
      meaning: definition.meaning,
      overridePolicy: definition.overridePolicy,
      resolved: graph.tokens[tokenId].value,
      dependencies: graph.dependencies[tokenId],
    };
  });
  const digestPreimage = {
    schemaVersion: '1.0.0',
    bindingId,
    profile,
    source: source.id,
    tokenContractVersion: source.tokenContractVersion,
    requirements,
    closure,
  };
  return Object.freeze({
    ...digestPreimage,
    sourceRevision: graph.sourceRevision,
    digest: canonicalDigest(digestPreimage),
  });
}

export function validateThemeForRequirementSet({ requirementSet, values }) {
  const diagnostics = [];
  const resolved = {};
  for (const requirement of requirementSet.requirements) {
    if (Object.hasOwn(values, requirement.token)) {
      validateLiteral(
        requirement.type,
        requirement.unit,
        values[requirement.token],
        `values/${requirement.token}`,
      );
      resolved[requirement.token] = values[requirement.token];
      continue;
    }
    if (requirement.fallback) {
      if (
        requirement.fallback.kind === 'token'
        && !Object.hasOwn(values, requirement.fallback.token)
      ) {
        fail('MUXUI_TOKEN_REQUIRED_MISSING', `${requirement.fallback.token} fallback is missing`, {
          bindingId: requirementSet.bindingId,
          fallbackToken: requirement.fallback.token,
          profile: requirementSet.profile,
          tokenId: requirement.token,
        });
      }
      const fallbackValue = requirement.fallback.kind === 'token'
        ? values[requirement.fallback.token]
        : requirement.fallback.value;
      const fallbackDefinition = requirement.fallback.kind === 'token'
        ? requirementSet.closure.find(({ token }) => token === requirement.fallback.token)
        : requirement.fallback;
      validateLiteral(
        fallbackDefinition.type,
        fallbackDefinition.unit,
        fallbackValue,
        `fallback/${requirement.token}`,
      );
      resolved[requirement.token] = fallbackValue;
      diagnostics.push(Object.freeze({
        code: 'MUXUI_TOKEN_FALLBACK_USED',
        bindingId: requirementSet.bindingId,
        profile: requirementSet.profile,
        token: requirement.token,
        fallback: structuredClone(requirement.fallback),
      }));
      continue;
    }
    if (requirement.requirement === 'required') {
      fail('MUXUI_TOKEN_REQUIRED_MISSING', `${requirement.token} is required`, {
        bindingId: requirementSet.bindingId,
        profile: requirementSet.profile,
        tokenId: requirement.token,
      });
    }
  }
  return Object.freeze({ values: Object.freeze(resolved), diagnostics: Object.freeze(diagnostics) });
}

function publicTokenEntries(graph) {
  return Object.values(graph.tokens);
}

export function compileWebTheme(source, options = {}) {
  const graph = compileTokenGraph(source, options);
  const declarations = publicTokenEntries(graph)
    .map((token) => cssDeclaration(token, graph.dependencies))
    .join('\n');
  return Object.freeze({
    kind: 'web.css.static',
    format: 'muxui-web-theme-v1',
    sourceId: graph.sourceId,
    sourceRevision: graph.sourceRevision,
    tokenContractVersion: graph.tokenContractVersion,
    modes: graph.modes,
    runtimeSwitching: false,
    provenance: Object.freeze({ source: 'canonical-token-source', digest: graph.sourceRevision }),
    css: `:root {\n${declarations}\n}\n`,
  });
}

export function compileNativeTheme(source, { profile, rootFontSizePx, ...options } = {}) {
  if (!['native.ios', 'native.android'].includes(profile)) {
    fail('MUXUI_TOKEN_PROFILE_INVALID', `${profile} has no native transform`, { profile });
  }
  if (rootFontSizePx !== undefined && (!Number.isFinite(rootFontSizePx) || rootFontSizePx <= 0)) {
    fail('MUXUI_TOKEN_ROOT_METRIC_INVALID', 'rootFontSizePx must be a positive finite number', { rootFontSizePx });
  }
  const graph = compileTokenGraph(source, options);
  const diagnostics = [];
  const theme = {};
  for (const token of publicTokenEntries(graph)) {
    const code = token.fluid ? 'MUXUI_TOKEN_FLUID_RECIPE_DEFERRED'
      : token.formula ? 'MUXUI_TOKEN_FORMULA_DEFERRED'
        : token.relative && rootFontSizePx === undefined ? 'MUXUI_TOKEN_RELATIVE_ROOT_METRIC_REQUIRED' : null;
    if (code) {
      diagnostics.push(Object.freeze({ code, id: token.id, profile }));
      continue;
    }
    theme[token.id] = Object.freeze({
      type: token.type,
      unit: token.unit,
      value: token.relative ? token.relative.value * rootFontSizePx : token.value,
      ...(token.effect === undefined ? {} : { effect: token.effect }),
    });
  }
  return Object.freeze({
    kind: 'native.theme.static',
    format: 'muxui-native-theme-v1',
    profile,
    sourceId: graph.sourceId,
    sourceRevision: graph.sourceRevision,
    tokenContractVersion: graph.tokenContractVersion,
    modes: graph.modes,
    runtimeSwitching: false,
    provenance: Object.freeze({ source: 'canonical-token-source', digest: graph.sourceRevision }),
    theme: Object.freeze(theme),
    diagnostics: Object.freeze(diagnostics),
  });
}
