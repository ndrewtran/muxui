import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalJson, parseJsonStrict } from '@muxui/schema';
import { TokenContractError, compileTokenGraph, compileWebTheme } from '../src/index.mjs';
import { applyFigmaBatch } from '../src/figma-applier.mjs';
import { FIGMA_NAME_SEGMENT, compileFigmaExport, planFigmaBatches } from '../src/figma.mjs';

const source = parseJsonStrict(await readFile(
  new URL('../../../catalog/tokens/default-theme.json', import.meta.url),
  'utf8',
));
const document = compileFigmaExport({ source });
const batches = planFigmaBatches(document);
const variableById = new Map(document.variables.map((variable) => [variable.tokenId, variable]));

function withToken(id, patch) {
  const copy = structuredClone(source);
  copy.tokens[id] = { ...copy.tokens[id], ...patch };
  return copy;
}

test('export is deterministic and independent of source key order', () => {
  const reordered = { ...source, tokens: Object.fromEntries(Object.entries(source.tokens).reverse()) };
  assert.equal(canonicalJson(compileFigmaExport({ source: reordered })), canonicalJson(document));
  assert.equal(canonicalJson(planFigmaBatches(compileFigmaExport({ source }))), canonicalJson(batches));
  assert.equal(document.provenance.tokenContractVersion, source.tokenContractVersion);
  assert.equal(document.provenance.sourceDigest, compileTokenGraph(source).sourceRevision);
});

test('every token is exported or reported, and lossy notes only describe exported tokens', () => {
  const exported = [...document.variables.map(({ tokenId }) => tokenId), ...document.effectStyles.map(({ tokenId }) => tokenId)];
  const reported = document.report.unsupported.map(({ tokenId }) => tokenId);
  assert.equal(new Set([...exported, ...reported]).size, exported.length + reported.length);
  assert.deepEqual([...exported, ...reported].sort(), Object.keys(source.tokens).sort());
  for (const { tokenId, reason } of document.report.unsupported) {
    assert.ok(['duration', 'easing', 'transition'].includes(source.tokens[tokenId].type));
    assert.ok(reason.length > 0);
  }
  const exportedSet = new Set(exported);
  for (const { tokenId } of document.report.lossy) assert.ok(exportedSet.has(tokenId), tokenId);
});

test('aliases stay Figma aliases, including across collections', () => {
  assert.deepEqual(variableById.get('semantic.color.color-5').values, {
    'colorScheme.light': { alias: 'reference.color.brand-5' },
    'colorScheme.dark': { alias: 'reference.color.brand-100' },
  });
  const graphs = new Map();
  for (const variable of document.variables) {
    const collection = document.collections.find(({ key }) => key === variable.collection);
    for (const mode of collection.modes) {
      const graphKey = JSON.stringify(mode.modes);
      if (!graphs.has(graphKey)) graphs.set(graphKey, compileTokenGraph(source, { modes: mode.modes }));
      const graph = graphs.get(graphKey);
      const token = graph.tokens[variable.tokenId];
      const value = variable.values[mode.key];
      if (token.source === 'alias') assert.deepEqual(value, { alias: graph.dependencies[variable.tokenId][0] });
      else assert.equal(value.alias, undefined);
    }
  }
});

test('code syntax names the exact CSS custom properties from the web compiler', () => {
  const properties = new Set([...compileWebTheme(source).css.matchAll(/^\s+(--[a-z0-9-]+):/gmu)].map(([, name]) => name));
  for (const variable of document.variables) {
    const [, property] = /^var\((--[a-z0-9-]+)\)$/u.exec(variable.codeSyntax.WEB);
    assert.ok(properties.has(property), property);
  }
});

test('collections follow the axes tokens vary on and reject more than four modes', () => {
  assert.deepEqual(document.collections.map(({ key, modes }) => [key, modes.map(({ name }) => name)]), [
    ['reference', ['Default']],
    ['semantic-color', ['Light', 'Dark']],
    ['semantic-dimension', ['Comfortable', 'Compact']],
    ['semantic-number-string', ['Default']],
  ]);
  assert.ok(document.variables.filter(({ tokenId }) => tokenId.startsWith('reference.')).every(({ scopes }) => scopes.length === 0));

  const contrast = compileFigmaExport({ source: withToken('semantic.content.default', {
    modes: { 'contrast.more': { alias: 'semantic.color.neutral-100' } },
  }) });
  assert.deepEqual(contrast.collections.find(({ key }) => key === 'semantic-color').modes.map(({ name }) => name),
    ['Light', 'Light more contrast', 'Dark', 'Dark more contrast']);

  const tooMany = withToken('semantic.content.default', {
    modes: {
      'colorScheme.dark': { alias: 'semantic.color.neutral-80' },
      'contrast.more': { alias: 'semantic.color.neutral-100' },
      'density.compact': { alias: 'semantic.color.neutral-70' },
    },
  });
  assert.throws(() => compileFigmaExport({ source: tooMany }),
    (error) => error instanceof TokenContractError && error.code === 'MUXUI_FIGMA_MODE_LIMIT');

  const darkFirst = structuredClone(source);
  darkFirst.theme.defaultModes.colorScheme = 'dark';
  assert.deepEqual(compileFigmaExport({ source: darkFirst }).collections.find(({ key }) => key === 'semantic-color').modes.map(({ name }) => name),
    ['Dark', 'Light']);

  const motionOnly = compileFigmaExport({ source: withToken('semantic.layout.dense-gap', { modes: { 'motion.reduced': { value: 3 } } }) });
  assert.deepEqual(Object.values(motionOnly.variables.find(({ tokenId }) => tokenId === 'semantic.layout.dense-gap').values), [{ value: 2 }, { value: 2 }]);
  assert.ok(motionOnly.report.lossy.some(({ tokenId, code }) => tokenId === 'semantic.layout.dense-gap' && code === 'axis-not-exported'));
});

test('literal conversions keep Figma units and effect layers', () => {
  const textStyle = (name) => document.textStyles.find((style) => style.name === name);
  assert.equal(textStyle('Text/M').fontSize, 16);
  assert.deepEqual(variableById.get('reference.dimension.text-m').values, { default: { value: 16 } });
  assert.equal(textStyle('Title/L').fontSize, 24.09);
  assert.deepEqual(Object.values(variableById.get('semantic.typography.title-l-font-size').values), [{ value: 24.09 }, { value: 24.09 }]);
  assert.deepEqual(textStyle('Text/M').lineHeight, { unit: 'PERCENT', value: 150 });

  const { effects } = document.effectStyles.find(({ tokenId }) => tokenId === 'semantic.elevation.control');
  const layers = source.tokens['semantic.elevation.control'].value.layers;
  assert.deepEqual(effects.map(({ type }) => type), layers.map(({ inset }) => (inset ? 'INNER_SHADOW' : 'DROP_SHADOW')));
  const index = layers.findIndex(({ inset, color }) => inset && color.alpha === 0.18);
  assert.ok(index >= 0);
  assert.equal(effects[index].color.a, 0.18);
  assert.equal(effects[index].showShadowBehindNode, undefined);
});

test('fluid recipes without a static default report their fallback value', () => {
  const recipe = structuredClone(source.tokens['reference.dimension.section-space-l']);
  delete recipe.fluid.default;
  const fallback = compileFigmaExport({ source: withToken('reference.dimension.section-space-l', recipe) });
  assert.deepEqual(fallback.variables.find(({ tokenId }) => tokenId === 'reference.dimension.section-space-l').values, { default: { value: 158.3 } });
  assert.ok(fallback.report.lossy.some(({ tokenId, code }) => tokenId === 'reference.dimension.section-space-l' && code === 'fluid-value-fallback'));
});

test('variable and style names are valid, grouped, and unique', () => {
  const seen = new Set();
  for (const { collection, name } of document.variables) {
    assert.ok(name.split('/').every((segment) => FIGMA_NAME_SEGMENT.test(segment)), name);
    assert.ok(!seen.has(`${collection}|${name}`), name);
    seen.add(`${collection}|${name}`);
  }
  assert.equal(variableById.get('component.button.background').name, 'component/button/background');
  assert.equal(new Set(document.textStyles.map(({ name }) => name)).size, document.textStyles.length);
  assert.equal(new Set(document.effectStyles.map(({ name }) => name)).size, document.effectStyles.length);
});

test('batches fit the size budget and order alias targets before their aliases', () => {
  for (const budgetBytes of [40_000, 25_000]) {
    const plan = budgetBytes === 40_000 ? batches : planFigmaBatches(document, { budgetBytes });
    const position = new Map();
    let sawStyle = false;
    for (const { script, bytes } of plan) {
      assert.ok(bytes <= budgetBytes && new TextEncoder().encode(script).length === bytes);
      const payload = JSON.parse(/^const payload = (.*);$/mu.exec(script)[1]);
      for (const item of payload.variables) {
        assert.equal(sawStyle, false);
        for (const { alias } of Object.values(item.values)) if (alias) assert.ok(position.has(alias), `${item.id} -> ${alias}`);
        position.set(item.id, position.size);
      }
      if (payload.textStyles.length || payload.effectStyles.length) sawStyle = true;
    }
    assert.equal(position.size, document.variables.length);
    assert.equal(plan.at(-1).orphanCheck, true);
  }
  assert.throws(() => planFigmaBatches(document, { budgetBytes: 5_000 }), /MUXUI_FIGMA_BATCH_ITEM_TOO_LARGE/u);
  assert.doesNotMatch(applyFigmaBatch.toString(), /\?\.|\?\?|\.\.\./u);
});

// Minimal in-memory model of the Plugin API surface the applier uses. Every
// write after creation is counted so a no-op rerun can prove it changed nothing.
function createFakeFigma() {
  let nextId = 1;
  const state = { writes: 0, removes: 0, collections: [], variables: [], textStyles: [], effectStyles: [], fonts: new Set() };
  const newId = (prefix) => `${prefix}:${nextId++}`;
  const requireFont = (font) => {
    if (!state.fonts.has(`${font.family}/${font.style}`)) throw new Error(`font ${font.family} ${font.style} not loaded`);
  };
  const node = (fields, methods = () => ({})) => {
    const data = new Map();
    const target = { ...fields };
    const proxy = new Proxy(target, {
      set(object, key, value) {
        if (object.type === 'TEXT' && ['fontName', 'fontSize', 'lineHeight', 'letterSpacing'].includes(key)) {
          requireFont(object.fontName);
          if (key === 'fontName') requireFont(value);
        }
        state.writes += 1;
        object[key] = structuredClone(value);
        return true;
      },
    });
    Object.assign(target, {
      getSharedPluginData: (namespace, key) => data.get(`${namespace}/${key}`) ?? '',
      setSharedPluginData: (namespace, key, value) => { state.writes += 1; data.set(`${namespace}/${key}`, value); },
      remove: () => { state.removes += 1; },
      ...methods(target),
    });
    state.writes += 1;
    return proxy;
  };
  const figma = {
    variables: {
      getLocalVariableCollectionsAsync: async () => [...state.collections],
      getLocalVariablesAsync: async () => [...state.variables],
      createVariableCollection(name) {
        const defaultModeId = newId('M');
        const collection = node({ id: newId('C'), name, defaultModeId, modes: [{ modeId: defaultModeId, name: 'Mode 1' }] }, (self) => ({
          renameMode(modeId, modeName) { state.writes += 1; self.modes.find((mode) => mode.modeId === modeId).name = modeName; },
          addMode(modeName) {
            state.writes += 1;
            const modeId = newId('M');
            self.modes.push({ modeId, name: modeName });
            return modeId;
          },
        }));
        state.collections.push(collection);
        return collection;
      },
      createVariable(name, collection, resolvedType) {
        assert.ok(state.collections.includes(collection));
        const variable = node({
          id: newId('V'), name, resolvedType, variableCollectionId: collection.id,
          description: '', scopes: ['ALL_SCOPES'], codeSyntax: {}, valuesByMode: {},
        }, (self) => ({
          setVariableCodeSyntax(platform, value) { state.writes += 1; self.codeSyntax = { ...self.codeSyntax, [platform]: value }; },
          setValueForMode(modeId, value) {
            assert.ok(collection.modes.some((mode) => mode.modeId === modeId));
            if (value.type === 'VARIABLE_ALIAS') assert.ok(state.variables.some(({ id }) => id === value.id));
            state.writes += 1;
            self.valuesByMode = { ...self.valuesByMode, [modeId]: structuredClone(value) };
          },
        }));
        state.variables.push(variable);
        return variable;
      },
      createVariableAlias: (variable) => ({ type: 'VARIABLE_ALIAS', id: variable.id }),
    },
    getLocalTextStylesAsync: async () => [...state.textStyles],
    getLocalEffectStylesAsync: async () => [...state.effectStyles],
    loadFontAsync: async (font) => { state.fonts.add(`${font.family}/${font.style}`); },
    createTextStyle() {
      const style = node({
        id: newId('S'), type: 'TEXT', name: '', description: '', fontName: { family: 'Inter', style: 'Regular' },
        fontSize: 12, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PERCENT', value: 0 }, boundVariables: {},
      }, (self) => ({
        setBoundVariable(field, variable) {
          state.writes += 1;
          self.boundVariables = { ...self.boundVariables, [field]: { type: 'VARIABLE_ALIAS', id: variable.id } };
        },
      }));
      state.textStyles.push(style);
      return style;
    },
    createEffectStyle() {
      const style = node({ id: newId('S'), type: 'EFFECT', name: '', description: '', effects: [] });
      state.effectStyles.push(style);
      return style;
    },
  };
  return { figma, state };
}

const AsyncFunction = (async () => {}).constructor;
async function applyAll(figma, plan) {
  const totals = { created: 0, updated: 0, unchanged: 0, errorCount: 0, orphans: [], modeOrphans: [], errors: [] };
  for (const { script } of plan) {
    const summary = await new AsyncFunction('figma', script)(figma);
    assert.ok(JSON.stringify(summary).length < 20_000);
    for (const key of ['created', 'updated', 'unchanged', 'errorCount']) totals[key] += summary[key];
    totals.orphans.push(...summary.orphans);
    totals.modeOrphans.push(...new Set(summary.modeOrphans).difference(new Set(totals.modeOrphans)));
    totals.errors.push(...summary.errors);
  }
  return totals;
}

test('applier creates, then no-ops, updates changed values, and reports orphans without deleting', async () => {
  const { figma, state } = createFakeFigma();
  const first = await applyAll(figma, batches);
  const itemCount = document.collections.length + document.variables.length + document.textStyles.length + document.effectStyles.length;
  assert.deepEqual([first.created, first.updated, first.errors, first.orphans], [itemCount, 0, [], []]);
  const bound = state.textStyles.find((style) => style.name === 'Display/L').boundVariables.fontSize.id;
  assert.equal(state.variables.find(({ id }) => id === bound).name, 'typography/display-l-font-size');

  const writes = state.writes;
  const second = await applyAll(figma, batches);
  assert.deepEqual([second.created, second.updated, second.errors, state.writes], [0, 0, [], writes]);

  const changedSource = withToken('reference.color.brand-5', { value: '#123456' });
  const changed = await applyAll(figma, planFigmaBatches(compileFigmaExport({ source: changedSource })));
  assert.deepEqual([changed.created, changed.updated, changed.errors], [0, 1, []]);
  const brand = state.variables.find((variable) => variable.getSharedPluginData('muxui', 'id') === 'reference.color.brand-5');
  assert.deepEqual(Object.values(brand.valuesByMode), [{ r: 0.070588, g: 0.203922, b: 0.337255, a: 1 }]);

  const removedSource = structuredClone(changedSource);
  delete removedSource.tokens['semantic.shape.editor-mark-radius'];
  const removed = await applyAll(figma, planFigmaBatches(compileFigmaExport({ source: removedSource })));
  assert.deepEqual([removed.created, removed.updated, removed.orphans], [0, 0, ['semantic.shape.editor-mark-radius']]);
  assert.equal(state.removes, 0);
  assert.equal(state.variables.length, document.variables.length);
});

const tagged = (nodes, id) => nodes.find((node) => node.getSharedPluginData('muxui', 'id') === id);
const modeNames = (collection) => collection.modes.map(({ name }) => name);

test('applier reports collection or type mismatches without writing them', async () => {
  const { figma, state } = createFakeFigma();
  await applyAll(figma, batches);
  tagged(state.variables, 'semantic.control.radius').resolvedType = 'STRING';
  const writes = state.writes;
  const result = await applyAll(figma, batches);
  assert.deepEqual([result.created, result.updated, result.errorCount, state.writes], [0, 0, 1, writes]);
  assert.equal(result.errors[0].id, 'semantic.control.radius');
  assert.match(result.errors[0].message, /delete this Figma variable by hand and rerun/u);
});

test('applier moves modes forward when a collection gains an axis', async () => {
  const { figma, state } = createFakeFigma();
  await applyAll(figma, batches);

  // Density on a number token: the collection keeps its key, adds Compact, and
  // the stale Default mode becomes Comfortable instead of a new default.
  const density = compileFigmaExport({ source: withToken('semantic.typography.text-line-height', { modes: { 'density.compact': { value: 1.3 } } }) });
  assert.equal(density.variables.find(({ tokenId }) => tokenId === 'semantic.typography.text-line-height').collection, 'semantic-number-string');
  assert.ok(density.report.lossy.some(({ tokenId, code }) => tokenId === 'semantic.typography.text-line-height' && code === 'style-axis-not-exported'));
  const numbers = tagged(state.collections, 'collection:semantic-number-string');
  const defaultModeId = numbers.defaultModeId;
  const densityResult = await applyAll(figma, planFigmaBatches(density));
  assert.deepEqual([densityResult.created, densityResult.errorCount, densityResult.modeOrphans], [0, 0, []]);
  assert.deepEqual(modeNames(numbers), ['Comfortable', 'Compact']);
  assert.equal(numbers.modes.find(({ modeId }) => modeId === defaultModeId).name, 'Comfortable');
  const lineHeight = tagged(state.variables, 'semantic.typography.text-line-height');
  assert.deepEqual(Object.values(lineHeight.valuesByMode).at(-1), 1.3);

  // Color scheme on a dimension token (from the base source): the default is
  // renamed, and Compact modes nothing expects are reported, not deleted.
  const scheme = compileFigmaExport({ source: withToken('semantic.control.radius', { modes: { 'colorScheme.dark': { alias: 'reference.dimension.radius-l' } } }) });
  const dimensions = tagged(state.collections, 'collection:semantic-dimension');
  const schemeResult = await applyAll(figma, planFigmaBatches(scheme));
  assert.deepEqual([schemeResult.created, schemeResult.errorCount], [0, 0]);
  assert.equal(dimensions.modes.find(({ modeId }) => modeId === dimensions.defaultModeId).name, 'Light comfortable');
  assert.deepEqual(modeNames(dimensions), ['Light comfortable', 'Compact', 'Light compact', 'Dark comfortable', 'Dark compact']);
  assert.deepEqual(schemeResult.modeOrphans, ['collection:semantic-dimension/Compact', 'collection:semantic-number-string/Compact']);
});

test('applier restores drifted styles and switches values between alias and literal', async () => {
  const { figma, state } = createFakeFigma();
  await applyAll(figma, batches);
  const text = tagged(state.textStyles, 'text-style:text-m');
  const effect = tagged(state.effectStyles, 'semantic.elevation.control');
  await figma.loadFontAsync(text.fontName);
  text.lineHeight = { unit: 'AUTO' };
  effect.effects = [];
  const restored = await applyAll(figma, batches);
  assert.deepEqual([restored.created, restored.updated, restored.errorCount], [0, 2, 0]);
  assert.deepEqual(text.lineHeight, { unit: 'PERCENT', value: 150 });
  assert.equal(effect.effects.length, source.tokens['semantic.elevation.control'].value.layers.length);

  const literal = structuredClone(source);
  delete literal.tokens['semantic.control.radius'].alias;
  literal.tokens['semantic.control.radius'].value = 5;
  const radius = tagged(state.variables, 'semantic.control.radius');
  const toLiteral = await applyAll(figma, planFigmaBatches(compileFigmaExport({ source: literal })));
  assert.deepEqual([toLiteral.updated, toLiteral.errorCount], [1, 0]);
  assert.deepEqual(Object.values(radius.valuesByMode), [5, 5]);
  const toAlias = await applyAll(figma, batches);
  assert.deepEqual([toAlias.updated, toAlias.errorCount], [1, 0]);
  const target = tagged(state.variables, 'reference.dimension.radius-m');
  assert.deepEqual(Object.values(radius.valuesByMode), [{ type: 'VARIABLE_ALIAS', id: target.id }, { type: 'VARIABLE_ALIAS', id: target.id }]);
});
