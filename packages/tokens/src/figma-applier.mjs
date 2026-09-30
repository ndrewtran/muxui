/*
 * Figma Plugin API applier for one export batch. Its source text is embedded
 * verbatim into generated scripts (see `planFigmaBatches`), so it must stay
 * self-contained: no imports, no closures over module state, and conservative
 * syntax (no optional chaining, nullish coalescing, or object spread) for the
 * plugin sandbox.
 *
 * Items are matched by the Mux ID stored in shared plugin data
 * (`muxui` / `id`). Missing items are created, changed items are updated in
 * place, unchanged items are left alone, and nothing is ever deleted.
 * Tagged items and modes that the export no longer expects are reported in
 * `orphans` and `modeOrphans`; `errors` is capped, `errorCount` is not.
 */
export async function applyFigmaBatch(figma, payload) {
  var NS = 'muxui';
  var KEY = 'id';
  var EPSILON = 0.0005;
  var summary = { batch: payload.batch, total: payload.total, created: 0, updated: 0, unchanged: 0, orphanCount: 0, orphans: [], modeOrphans: [], errorCount: 0, errors: [] };

  function tagOf(node) { return node.getSharedPluginData(NS, KEY); }
  function tag(node, id) { node.setSharedPluginData(NS, KEY, id); }
  function count(created, changed) {
    if (created) summary.created += 1;
    else if (changed) summary.updated += 1;
    else summary.unchanged += 1;
  }
  function error(id, message) {
    summary.errorCount += 1;
    if (summary.errors.length < 50) summary.errors.push({ id: id, message: String(message).slice(0, 300) });
  }
  function same(left, right) {
    if (typeof left === 'number' && typeof right === 'number') return Math.abs(left - right) < EPSILON;
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return left === right;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    var keys = Object.keys(right);
    for (var index = 0; index < keys.length; index += 1) {
      if (!same(left[keys[index]], right[keys[index]])) return false;
    }
    return Array.isArray(left) ? left.length === right.length : true;
  }
  function indexByTag(nodes) {
    var map = new Map();
    for (var index = 0; index < nodes.length; index += 1) {
      var id = tagOf(nodes[index]);
      if (id) map.set(id, nodes[index]);
    }
    return map;
  }

  // Collections and modes: present in every batch so each script stands alone.
  var collections = indexByTag(await figma.variables.getLocalVariableCollectionsAsync());
  var collectionByKey = {};
  var modeIds = {};
  for (var c = 0; c < payload.collections.length; c += 1) {
    var spec = payload.collections[c];
    try {
      var collection = collections.get(spec.id);
      var created = !collection;
      var changed = false;
      var expectedNames = spec.modes.map(function (expectedMode) { return expectedMode.name; });
      var hasName = function (name) { return collection.modes.some(function (candidate) { return candidate.name === name; }); };
      if (created) {
        collection = figma.variables.createVariableCollection(spec.name);
        tag(collection, spec.id);
        collections.set(spec.id, collection);
        collection.renameMode(collection.defaultModeId, expectedNames[0]);
      } else if (collection.name !== spec.name) {
        collection.name = spec.name;
        changed = true;
      }
      // A stale default mode takes the expected default name, so it stays the
      // default and keeps its values instead of a new mode being added.
      var defaultMode = collection.modes.find(function (candidate) { return candidate.modeId === collection.defaultModeId; });
      if (defaultMode && expectedNames.indexOf(defaultMode.name) < 0 && !hasName(expectedNames[0])) {
        collection.renameMode(defaultMode.modeId, expectedNames[0]);
        changed = true;
      }
      var ids = {};
      for (var m = 0; m < spec.modes.length; m += 1) {
        var mode = collection.modes.find(function (candidate) { return candidate.name === spec.modes[m].name; });
        var modeId = mode ? mode.modeId : collection.addMode(spec.modes[m].name);
        if (!mode) changed = true;
        ids[spec.modes[m].key] = modeId;
      }
      for (var x = 0; x < collection.modes.length; x += 1) {
        if (expectedNames.indexOf(collection.modes[x].name) < 0) summary.modeOrphans.push(spec.id + '/' + collection.modes[x].name);
      }
      modeIds[spec.key] = ids;
      collectionByKey[spec.key] = collection;
      count(created, changed);
    } catch (caught) {
      error(spec.id, caught && caught.message ? caught.message : caught);
    }
  }

  var variables = indexByTag(await figma.variables.getLocalVariablesAsync());
  for (var v = 0; v < payload.variables.length; v += 1) {
    var item = payload.variables[v];
    var target = collectionByKey[item.collection];
    var variable = variables.get(item.id);
    var isNew = !variable;
    var dirty = false;
    try {
      if (!target) {
        error(item.id, 'collection ' + item.collection + ' could not be set up; left unchanged');
        continue;
      }
      if (isNew) {
        variable = figma.variables.createVariable(item.name, target, item.type);
        tag(variable, item.id);
        variables.set(item.id, variable);
      } else if (variable.variableCollectionId !== target.id || variable.resolvedType !== item.type) {
        error(item.id, 'existing variable has a different collection or type; left unchanged. To recover, delete this Figma variable by hand and rerun the export.');
        continue;
      }
      if (variable.name !== item.name) { variable.name = item.name; dirty = true; }
      if (variable.description !== item.description) { variable.description = item.description; dirty = true; }
      if (variable.scopes.slice().sort().join() !== item.scopes.slice().sort().join()) { variable.scopes = item.scopes; dirty = true; }
      if (variable.codeSyntax.WEB !== item.web) { variable.setVariableCodeSyntax('WEB', item.web); dirty = true; }
      var modeKeys = Object.keys(item.values);
      for (var k = 0; k < modeKeys.length; k += 1) {
        var entry = item.values[modeKeys[k]];
        var desired = entry.value;
        if (entry.alias) {
          var aliased = variables.get(entry.alias);
          if (!aliased) { error(item.id, 'alias target ' + entry.alias + ' is missing'); continue; }
          desired = figma.variables.createVariableAlias(aliased);
        }
        var modeTarget = modeIds[item.collection][modeKeys[k]];
        if (!same(variable.valuesByMode[modeTarget], desired)) {
          variable.setValueForMode(modeTarget, desired);
          dirty = true;
        }
      }
      count(isNew, dirty);
    } catch (caught) {
      error(item.id, caught && caught.message ? caught.message : caught);
    }
  }

  if (payload.textStyles.length) {
    var textStyles = indexByTag(await figma.getLocalTextStylesAsync());
    for (var t = 0; t < payload.textStyles.length; t += 1) {
      var textSpec = payload.textStyles[t];
      var style = textStyles.get(textSpec.id);
      var newStyle = !style;
      var textDirty = false;
      try {
        if (newStyle) {
          style = figma.createTextStyle();
          tag(style, textSpec.id);
        }
        // Both the current and the target font must be loaded before text
        // style properties change, including a new style's default font.
        await figma.loadFontAsync(style.fontName);
        await figma.loadFontAsync(textSpec.fontName);
        if (style.name !== textSpec.name) { style.name = textSpec.name; textDirty = true; }
        if (style.description !== textSpec.description) { style.description = textSpec.description; textDirty = true; }
        if (!same(style.fontName, textSpec.fontName)) { style.fontName = textSpec.fontName; textDirty = true; }
        if (!same(style.lineHeight, textSpec.lineHeight)) { style.lineHeight = textSpec.lineHeight; textDirty = true; }
        if (!same(style.letterSpacing, textSpec.letterSpacing)) { style.letterSpacing = textSpec.letterSpacing; textDirty = true; }
        var fields = ['fontSize', 'fontWeight'];
        for (var f = 0; f < fields.length; f += 1) {
          var field = fields[f];
          var boundId = textSpec.bindings[field];
          var bound = style.boundVariables && style.boundVariables[field];
          if (!boundId) {
            if (field === 'fontSize' && !same(style.fontSize, textSpec.fontSize)) { style.fontSize = textSpec.fontSize; textDirty = true; }
            continue;
          }
          var boundVariable = variables.get(boundId);
          if (!boundVariable) { error(textSpec.id, 'bound variable ' + boundId + ' is missing'); continue; }
          if (!bound || bound.id !== boundVariable.id) {
            style.setBoundVariable(field, boundVariable);
            textDirty = true;
          }
        }
        count(newStyle, textDirty);
      } catch (caught) {
        error(textSpec.id, caught && caught.message ? caught.message : caught);
      }
    }
  }

  if (payload.effectStyles.length) {
    var effectStyles = indexByTag(await figma.getLocalEffectStylesAsync());
    for (var e = 0; e < payload.effectStyles.length; e += 1) {
      var effectSpec = payload.effectStyles[e];
      var effectStyle = effectStyles.get(effectSpec.id);
      var newEffect = !effectStyle;
      var effectDirty = false;
      try {
        if (newEffect) {
          effectStyle = figma.createEffectStyle();
          tag(effectStyle, effectSpec.id);
        }
        if (effectStyle.name !== effectSpec.name) { effectStyle.name = effectSpec.name; effectDirty = true; }
        if (effectStyle.description !== effectSpec.description) { effectStyle.description = effectSpec.description; effectDirty = true; }
        if (!same(effectStyle.effects, effectSpec.effects)) { effectStyle.effects = effectSpec.effects; effectDirty = true; }
        count(newEffect, effectDirty);
      } catch (caught) {
        error(effectSpec.id, caught && caught.message ? caught.message : caught);
      }
    }
  }

  // The final batch lists every expected Mux ID and reports tagged leftovers.
  if (payload.expected) {
    var expected = new Set();
    Object.keys(payload.expected).forEach(function (prefix) {
      payload.expected[prefix].forEach(function (suffix) { expected.add(prefix + suffix); });
    });
    var tagged = [].concat(
      Array.from(collections.keys()),
      Array.from(variables.keys()),
      Array.from(indexByTag(await figma.getLocalTextStylesAsync()).keys()),
      Array.from(indexByTag(await figma.getLocalEffectStylesAsync()).keys())
    ).sort();
    for (var o = 0; o < tagged.length; o += 1) {
      if (expected.has(tagged[o])) continue;
      summary.orphanCount += 1;
      if (summary.orphans.length < 100) summary.orphans.push(tagged[o]);
    }
  }
  return summary;
}
