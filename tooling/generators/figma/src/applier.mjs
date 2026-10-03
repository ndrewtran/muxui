/*
 * Figma Plugin API applier for one component batch. Its source text is
 * embedded verbatim into generated scripts (see `planComponentBatches`), so it
 * must stay self-contained: no imports, no closures over module state, and
 * conservative syntax (no optional chaining, nullish coalescing, object or
 * array spread, or arrow functions) for the plugin sandbox.
 *
 * Every node it owns carries shared plugin data `muxui` / `id`: the
 * Components page it created, glyph components and their imported vectors,
 * component sets, variants, parts, and previews. Variables, text styles, and
 * effect styles are found by the same key, as the token export tags them.
 *
 * A tag alone does not prove ownership: Figma copies plugin data onto
 * duplicates, and instances report their main component's data. A node is
 * owned only when its type matches its ID prefix, it sits under its tagged
 * owner, and no other eligible node carries the same tag. Instances are owned
 * only as glyph parts or preview cells, whose main component carries another
 * tag. When two eligible nodes share a tag, both are reported and left alone.
 *
 * Missing nodes are created, changed nodes are updated in place, and
 * unchanged nodes are left alone. Nothing is deleted except the applier's own
 * glyph vectors, which a changed SVG replaces. Untagged nodes are never
 * changed, and no page other than its own tagged Components page is read or
 * written; an untagged page with that name gets a separate page beside it.
 * The orphan-check batch reports tagged sets, variants, and glyphs the spec
 * no longer expects, and lays out each set; the last batch builds the tagged
 * Light/Dark/Compact previews.
 */
export async function applyComponentBatch(figma, payload) {
  var NS = 'muxui';
  var KEY = 'id';
  var PAGE_ID = 'page:components';
  var PROTECTED_PAGES = ['Pilot components', 'Page 1'];
  var EPSILON = 0.0005;
  // Canvas positions and set sizes round-trip through Figma's float geometry.
  var LAYOUT_EPSILON = 0.01;
  var summary = { batch: payload.batch, total: payload.total, created: 0, updated: 0, unchanged: 0, updatedIds: [], orphanCount: 0, orphans: [], errorCount: 0, errors: [], notices: [] };

  // Repeated subtrees arrive once in `defs` and are referenced as { $: index }.
  function expand(value) {
    if (Array.isArray(value)) return value.map(expand);
    if (!value || typeof value !== 'object') return value;
    var keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '$') return expand(payload.defs[value.$]);
    var result = {};
    for (var k = 0; k < keys.length; k += 1) result[keys[k]] = expand(value[keys[k]]);
    return result;
  }
  var sets = expand(payload.sets);

  // Nodes are compared by `id`: Plugin API wrappers need not be identical objects.
  function tagOf(node) { return node.getSharedPluginData(NS, KEY); }
  function tag(node, id) { node.setSharedPluginData(NS, KEY, id); }
  function error(id, message) {
    summary.errorCount += 1;
    if (summary.errors.length < 50) summary.errors.push({ id: id, message: String(message).slice(0, 300) });
  }
  function orphan(id) {
    summary.orphanCount += 1;
    if (summary.orphans.length < 100) summary.orphans.push(id);
  }
  // Tally one owned node; the first updated IDs are reported to explain reruns.
  function count(created, changed, id) {
    if (created) summary.created += 1;
    else if (changed) {
      summary.updated += 1;
      if (summary.updatedIds.length < 20) summary.updatedIds.push(id);
    } else summary.unchanged += 1;
  }
  function near(left, right) { return Math.abs(left - right) < EPSILON; }
  // Move `node` to (x, y) unless it is already there; true when it moved.
  function moveTo(node, x, y) {
    if (Math.abs(node.x - x) < LAYOUT_EPSILON && Math.abs(node.y - y) < LAYOUT_EPSILON) return false;
    node.x = x;
    node.y = y;
    return true;
  }
  function same(left, right) {
    if (typeof left === 'number' && typeof right === 'number') return near(left, right);
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return left === right;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    var keys = Object.keys(right);
    for (var index = 0; index < keys.length; index += 1) {
      if (!same(left[keys[index]], right[keys[index]])) return false;
    }
    return Array.isArray(left) ? left.length === right.length : true;
  }
  function indexByTag(items) {
    var map = new Map();
    for (var index = 0; index < items.length; index += 1) {
      var id = tagOf(items[index]);
      if (id) map.set(id, items[index]);
    }
    return map;
  }

  // The Components page: the one tagged page, else a new page. An untagged
  // page that already has the name is a designer's, so the new page gets a
  // distinct name instead of adopting it.
  var page = null;
  var pages = figma.root.children;
  var taggedPages = pages.filter(function (candidate) { return tagOf(candidate) === PAGE_ID; });
  if (taggedPages.length > 1) {
    error(PAGE_ID, taggedPages.length + ' pages carry this tag (' + taggedPages.map(function (candidate) { return candidate.id; }).join(', ') + '); left untouched. Untag the copies and rerun.');
    return summary;
  }
  page = taggedPages[0] || null;
  if (!page) {
    var taken = pages.some(function (candidate) { return candidate.name === payload.page; });
    page = figma.createPage();
    page.name = taken ? payload.page + ' (Mux UI)' : payload.page;
    tag(page, PAGE_ID);
    summary.notices.push('created page ' + page.name + (taken ? ' because an untagged page named ' + payload.page + ' exists' : ''));
  }
  if (PROTECTED_PAGES.indexOf(page.name) >= 0) {
    error(PAGE_ID, 'refusing to write to protected page ' + page.name);
    return summary;
  }
  if (page.loadAsync) await page.loadAsync();
  // `figma.create*` puts new nodes on the current page, which starts as the
  // first page; switch first so no node is ever created on another page.
  if (figma.setCurrentPageAsync) await figma.setCurrentPageAsync(page);

  var variables = indexByTag(await figma.variables.getLocalVariablesAsync());
  var textStyles = indexByTag(await figma.getLocalTextStylesAsync());
  var effectStyles = indexByTag(await figma.getLocalEffectStylesAsync());
  // What a tag may be: allowed node types, the tag of the owner it must sit
  // under, its level (owners before their parts), and for instances the tag
  // prefix of their main component.
  function kindOf(id) {
    var segments = id.split('/');
    if (id.indexOf('component-set:') === 0) return segments.length === 1 ? { types: ['COMPONENT_SET'], level: 1 } : null;
    if (id.indexOf('component:') === 0) {
      if (segments.length === 2) return { types: ['COMPONENT'], level: 1 };
      return { types: ['FRAME', 'TEXT', 'INSTANCE'], owner: segments[0] + '/' + segments[1], level: 2, main: 'glyph:' };
    }
    if (id.indexOf('glyph:') === 0) {
      if (segments.length === 1) return { types: ['COMPONENT'], level: 1 };
      return segments.length === 2 ? { types: null, owner: segments[0], level: 2 } : null;
    }
    if (id.indexOf('preview:') === 0) {
      if (segments.length === 1) return { types: ['FRAME'], level: 1 };
      if (segments.length === 2) return { types: ['FRAME'], owner: segments[0], level: 2 };
      return segments.length === 3 ? { types: ['INSTANCE'], owner: segments[0] + '/' + segments[1], level: 3, main: 'component:' } : null;
    }
    return null;
  }
  // Tagged candidates in tree order with their tagged ancestors. Instance
  // sublayers report their main component's plugin data, so the walk never
  // descends into instances.
  function collect(root, ancestors, found) {
    var kids = root.children || [];
    for (var index = 0; index < kids.length; index += 1) {
      var kid = kids[index];
      var id = tagOf(kid);
      var kind = id ? kindOf(id) : null;
      var own = ancestors;
      if (kind) {
        found.push({ node: kid, id: id, kind: kind, ancestors: ancestors });
        own = ancestors.concat([{ id: id, nodeId: kid.id }]);
      }
      if (kid.type !== 'INSTANCE') collect(kid, own, found);
    }
    return found;
  }
  var candidates = collect(page, [], []);
  var nodes = new Map();
  // Tags held by more than one eligible node: reported once and never written.
  var conflicts = new Set();
  var acceptedIds = new Set();
  for (var level = 1; level <= 3; level += 1) {
    var byTag = new Map();
    for (var ci = 0; ci < candidates.length; ci += 1) {
      var candidate = candidates[ci];
      var kind = candidate.kind;
      if (kind.level !== level) continue;
      if (kind.types && kind.types.indexOf(candidate.node.type) < 0) continue;
      if (!kind.types && candidate.node.type === 'INSTANCE') continue;
      if (kind.owner && !candidate.ancestors.some(function (ancestor) { return ancestor.id === kind.owner && acceptedIds.has(ancestor.nodeId); })) continue;
      if (candidate.node.type === 'INSTANCE') {
        var main = await candidate.node.getMainComponentAsync();
        if (!main || tagOf(main).indexOf(kind.main) !== 0) continue;
      }
      if (!byTag.has(candidate.id)) byTag.set(candidate.id, []);
      byTag.get(candidate.id).push(candidate.node);
    }
    byTag.forEach(function (group, id) {
      if (group.length === 1) {
        nodes.set(id, group[0]);
        acceptedIds.add(group[0].id);
        return;
      }
      conflicts.add(id);
      error(id, group.length + ' nodes carry this tag (' + group.map(function (node) { return node.id; }).join(', ') + '); all are left untouched. Delete or untag the copies and rerun.');
    });
  }
  // True when `node` is the owned node for its tag, not a copy or an instance.
  function isOwned(node) {
    var owned = nodes.get(tagOf(node));
    return Boolean(owned) && owned.id === node.id;
  }

  function variableFor(token, owner) {
    var found = variables.get(token);
    if (!found) throw new Error('variable ' + token + ' is missing; apply the token export first (' + owner + ')');
    return found;
  }

  function paintMatches(current, spec) {
    if (!current || current.type !== 'SOLID') return false;
    var bound = current.boundVariables && current.boundVariables.color;
    var opacity = current.opacity === undefined ? 1 : current.opacity;
    if (spec.token) return Boolean(bound) && bound.id === variableFor(spec.token, 'paint').id && near(opacity, spec.opacity === undefined ? 1 : spec.opacity);
    return !bound && near(current.color.r, spec.color.r) && near(current.color.g, spec.color.g) && near(current.color.b, spec.color.b) && near(opacity, spec.color.a);
  }
  function makePaint(spec) {
    if (spec.token) {
      return figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: spec.opacity === undefined ? 1 : spec.opacity }, 'color', variableFor(spec.token, 'paint'));
    }
    return { type: 'SOLID', color: { r: spec.color.r, g: spec.color.g, b: spec.color.b }, opacity: spec.color.a };
  }
  // Set `field` (fills or strokes) to the spec paints when they differ.
  function setPaints(node, field, specs) {
    var current = node[field];
    var matches = Array.isArray(current) && current.length === specs.length;
    for (var index = 0; matches && index < specs.length; index += 1) matches = paintMatches(current[index], specs[index]);
    if (matches) return false;
    node[field] = specs.map(makePaint);
    return true;
  }

  var NUMBER_DEFAULTS = {
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, itemSpacing: 0,
    minWidth: null, minHeight: null, opacity: 1,
    topLeftRadius: 0, topRightRadius: 0, bottomLeftRadius: 0, bottomRightRadius: 0,
  };
  // Bind `field` to a FLOAT variable, set a literal, or restore its default.
  function setNumber(node, field, spec) {
    var bound = node.boundVariables && node.boundVariables[field];
    if (spec && spec.token) {
      var target = variableFor(spec.token, field);
      if (bound && bound.id === target.id) return false;
      node.setBoundVariable(field, target);
      return true;
    }
    var value = spec ? spec.value : NUMBER_DEFAULTS[field];
    var changed = false;
    if (bound) {
      node.setBoundVariable(field, null);
      changed = true;
    }
    if (!same(node[field], value)) {
      node[field] = value;
      changed = true;
    }
    return changed;
  }
  function setValue(node, field, value) {
    if (same(node[field], value)) return false;
    node[field] = value;
    return true;
  }

  function makeEffect(spec) {
    var effect = {
      type: spec.type, color: { r: 0, g: 0, b: 0, a: 1 }, offset: { x: spec.x, y: spec.y }, radius: spec.blur, spread: spec.spread,
      visible: true, blendMode: 'NORMAL',
    };
    if (spec.type === 'DROP_SHADOW') effect.showShadowBehindNode = false;
    if (spec.color.token) return figma.variables.setBoundVariableForEffect(effect, 'color', variableFor(spec.color.token, 'effect'));
    effect.color = spec.color.color;
    return effect;
  }
  function effectMatches(current, spec) {
    if (!current || current.type !== spec.type || !same(current.offset, { x: spec.x, y: spec.y }) || !near(current.radius, spec.blur) || !near(current.spread || 0, spec.spread)) return false;
    var bound = current.boundVariables && current.boundVariables.color;
    if (spec.color.token) return Boolean(bound) && bound.id === variableFor(spec.color.token, 'effect').id;
    return !bound && same(current.color, spec.color.color);
  }
  async function setEffects(node, spec) {
    if (spec && spec.style) {
      var style = effectStyles.get(spec.style);
      if (!style) throw new Error('effect style ' + spec.style + ' is missing; apply the token export first');
      if (node.effectStyleId === style.id) return false;
      await node.setEffectStyleIdAsync(style.id);
      return true;
    }
    var specs = spec || [];
    var changed = false;
    if (node.effectStyleId) {
      await node.setEffectStyleIdAsync('');
      changed = true;
    }
    var matches = node.effects.length === specs.length;
    for (var index = 0; matches && index < specs.length; index += 1) matches = effectMatches(node.effects[index], specs[index]);
    if (!matches) {
      node.effects = specs.map(makeEffect);
      changed = true;
    }
    return changed;
  }

  async function loadFont(font) {
    if (font && typeof font === 'object' && font.family) await figma.loadFontAsync(font);
  }
  async function applyText(node, spec) {
    var changed = false;
    await loadFont(node.fontName);
    if (spec.style) {
      var style = textStyles.get(spec.style);
      if (!style) throw new Error('text style ' + spec.style + ' is missing; apply the token export first');
      await loadFont(style.fontName);
      if (node.textStyleId !== style.id) {
        await node.setTextStyleIdAsync(style.id);
        changed = true;
      }
    } else {
      await loadFont(spec.fontName);
      if (node.textStyleId) {
        await node.setTextStyleIdAsync('');
        changed = true;
      }
      changed = setValue(node, 'fontName', spec.fontName) || changed;
      var fields = ['fontSize', 'fontWeight'];
      for (var f = 0; f < fields.length; f += 1) {
        var fieldSpec = spec[fields[f]];
        var bound = node.boundVariables && node.boundVariables[fields[f]];
        if (fieldSpec && fieldSpec.token) {
          var target = variableFor(fieldSpec.token, fields[f]);
          if (!bound || (Array.isArray(bound) ? bound[0].id : bound.id) !== target.id) {
            node.setBoundVariable(fields[f], target);
            changed = true;
          }
        } else if (fieldSpec && fields[f] === 'fontSize') {
          changed = setValue(node, 'fontSize', fieldSpec.value) || changed;
        }
      }
      changed = setValue(node, 'lineHeight', spec.lineHeight) || changed;
    }
    changed = setValue(node, 'characters', spec.characters) || changed;
    changed = setValue(node, 'textAutoResize', 'WIDTH_AND_HEIGHT') || changed;
    changed = setPaints(node, 'fills', spec.fills) || changed;
    return changed;
  }

  // Frame-like fields: auto layout, paints, strokes, radius, sizes, effects, opacity.
  async function applyFrame(node, spec) {
    var changed = false;
    var layout = spec.layout;
    changed = setValue(node, 'layoutMode', layout.mode) || changed;
    if (layout.mode !== 'NONE') {
      changed = setValue(node, 'primaryAxisAlignItems', layout.primary) || changed;
      changed = setValue(node, 'counterAxisAlignItems', layout.counter) || changed;
      // Borders sit inside the box as in CSS border-box layout.
      changed = setValue(node, 'strokesIncludedInLayout', true) || changed;
      var padding = spec.padding || {};
      changed = setNumber(node, 'paddingTop', padding.top) || changed;
      changed = setNumber(node, 'paddingRight', padding.right) || changed;
      changed = setNumber(node, 'paddingBottom', padding.bottom) || changed;
      changed = setNumber(node, 'paddingLeft', padding.left) || changed;
      changed = setNumber(node, 'itemSpacing', spec.gap) || changed;
      changed = setNumber(node, 'minWidth', spec.minWidth) || changed;
      changed = setNumber(node, 'minHeight', spec.minHeight) || changed;
    }
    // Figma renders shadow spread only on filled frames that clip content.
    var hasEffects = Boolean(spec.effects && (spec.effects.style || spec.effects.length));
    changed = setValue(node, 'clipsContent', hasEffects) || changed;
    changed = setPaints(node, 'fills', spec.fills || []) || changed;
    changed = setPaints(node, 'strokes', spec.strokes || []) || changed;
    if (spec.strokes && spec.strokes.length) {
      var weights = spec.strokeWeights;
      changed = setValue(node, 'strokeAlign', spec.strokeAlign) || changed;
      changed = setValue(node, 'strokeTopWeight', weights.top) || changed;
      changed = setValue(node, 'strokeRightWeight', weights.right) || changed;
      changed = setValue(node, 'strokeBottomWeight', weights.bottom) || changed;
      changed = setValue(node, 'strokeLeftWeight', weights.left) || changed;
    }
    var corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
    for (var c = 0; c < corners.length; c += 1) changed = setNumber(node, corners[c] + 'Radius', spec.radii ? spec.radii[corners[c]] : spec.radius) || changed;
    changed = await setEffects(node, spec.effects) || changed;
    // Fixed sizes: a bound variable or a literal; otherwise the frame hugs.
    // Sizes come first because resize() resets both axes to FIXED.
    var axes = [['width', 'layoutSizingHorizontal', 'fillWidth'], ['height', 'layoutSizingVertical', 'fillHeight']];
    for (var a = 0; a < axes.length; a += 1) {
      var size = spec[axes[a][0]];
      if (size && size.token) {
        changed = setNumber(node, axes[a][0], size) || changed;
      } else if (size && !near(node[axes[a][0]], size.value)) {
        if (axes[a][0] === 'width') node.resize(size.value, node.height);
        else node.resize(node.width, size.value);
        changed = true;
      }
    }
    var inFlow = node.parent && node.parent.layoutMode && node.parent.layoutMode !== 'NONE' && layout.positioning !== 'ABSOLUTE';
    for (var s = 0; s < axes.length; s += 1) {
      var sizing = spec[axes[s][0]] ? 'FIXED' : (layout[axes[s][2]] && inFlow ? 'FILL' : (layout.mode !== 'NONE' ? 'HUG' : 'FIXED'));
      if ((layout.mode !== 'NONE' || inFlow) && node[axes[s][1]] !== sizing) {
        node[axes[s][1]] = sizing;
        changed = true;
      }
    }
    return changed;
  }

  // Glyph instances: bind stroke colour, size the instance, and scale stroke
  // weights with it, since SVG strokes scale with the viewBox and Figma's do not.
  async function applyGlyph(node, spec) {
    var changed = false;
    var main = await node.getMainComponentAsync();
    var width = spec.width ? spec.width.value : main.width;
    var height = spec.height ? spec.height.value : main.height;
    if (!near(node.width, width) || !near(node.height, height)) {
      node.resize(width, height);
      changed = true;
    }
    var vectors = function (root) { return root.findAll(function (child) { return child.type === 'VECTOR' || child.type === 'BOOLEAN_OPERATION'; }); };
    var children = vectors(node);
    var sources = vectors(main);
    var scale = width / main.width;
    for (var index = 0; index < children.length; index += 1) {
      if (!children[index].strokes.length) continue;
      changed = setPaints(children[index], 'strokes', spec.strokes) || changed;
      if (sources[index]) changed = setValue(children[index], 'strokeWeight', Math.round(sources[index].strokeWeight * scale * 1000) / 1000) || changed;
    }
    return changed;
  }

  function createFor(spec, owner) {
    if (spec.type === 'TEXT') return figma.createText();
    if (spec.type === 'GLYPH') {
      var glyph = nodes.get('glyph:' + spec.glyph);
      if (conflicts.has('glyph:' + spec.glyph)) throw new Error('glyph ' + spec.glyph + ' has duplicate tagged copies (' + owner + ')');
      if (!glyph) throw new Error('glyph ' + spec.glyph + ' is missing; apply the glyph batch first (' + owner + ')');
      return glyph.createInstance();
    }
    return figma.createFrame();
  }

  // Absolute children: overlays fill their parent, rings sit outset around it
  // by `outset`, and bars sit along its bottom edge.
  function place(node, spec, parent) {
    var changed = false;
    changed = setValue(node, 'layoutPositioning', 'ABSOLUTE') || changed;
    if (spec.layout.placement === 'fill' || spec.layout.placement === 'outset') {
      var out = spec.layout.outset || 0;
      changed = setValue(node, 'constraints', { horizontal: 'STRETCH', vertical: 'STRETCH' }) || changed;
      if (!near(node.x, -out) || !near(node.y, -out)) { node.x = -out; node.y = -out; changed = true; }
      if (!near(node.width, parent.width + 2 * out) || !near(node.height, parent.height + 2 * out)) { node.resize(parent.width + 2 * out, parent.height + 2 * out); changed = true; }
    } else if (spec.layout.placement === 'bottom-bar') {
      changed = setValue(node, 'constraints', { horizontal: 'STRETCH', vertical: 'MAX' }) || changed;
      var inset = parent.paddingLeft || 0;
      var width = Math.max(1, parent.width - inset - (parent.paddingRight || 0));
      if (!near(node.width, width)) { node.resize(width, node.height); changed = true; }
      if (!near(node.x, inset) || !near(node.y, parent.height - node.height)) {
        node.x = inset;
        node.y = parent.height - node.height;
        changed = true;
      }
    }
    return changed;
  }

  // Apply a part spec to `node`, reconciling its tagged children by part ID.
  // The variant component itself is the root part and keeps its variant name.
  async function applyNode(node, spec, variantId, isRoot) {
    var changed = false;
    if (!isRoot) changed = setValue(node, 'name', spec.name) || changed;
    // Any part may carry opacity: a bound FLOAT variable or a literal.
    changed = setNumber(node, 'opacity', spec.opacity) || changed;
    if (spec.type === 'TEXT') return await applyText(node, spec.text) || changed;
    if (spec.type === 'GLYPH') return await applyGlyph(node, spec) || changed;
    changed = await applyFrame(node, spec) || changed;
    var specs = spec.children || [];
    var expectedIds = specs.map(function (child) { return variantId + '/' + child.part; });
    var placed = [];
    for (var index = 0; index < specs.length; index += 1) {
      var childSpec = specs[index];
      var childId = expectedIds[index];
      if (conflicts.has(childId)) continue;
      var child = nodes.get(childId);
      var created = false;
      try {
        if (child && (child.type === 'INSTANCE') !== (childSpec.type === 'GLYPH')) {
          error(childId, 'existing node has a different type; left unchanged. Delete it by hand and rerun.');
          continue;
        }
        if (!child) {
          child = createFor(childSpec, childId);
          node.appendChild(child);
          tag(child, childId);
          nodes.set(childId, child);
          created = true;
        } else if (child.parent.id !== node.id) {
          node.appendChild(child);
          changed = true;
        }
        // Take absolute parts out of flow first so they never stretch the hugging parent.
        var positioned = childSpec.layout && childSpec.layout.positioning === 'ABSOLUTE' ? setValue(child, 'layoutPositioning', 'ABSOLUTE') : false;
        var childChanged = await applyNode(child, childSpec, variantId, false) || positioned;
        if (childSpec.layout && childSpec.layout.positioning === 'ABSOLUTE') placed.push([child, childSpec]);
        count(created, childChanged, childId);
      } catch (caught) {
        error(childId, caught && caught.message ? caught.message : caught);
      }
    }
    // Keep tagged children in spec order; untagged children keep their place.
    var order = node.children.filter(function (child) { return expectedIds.indexOf(tagOf(child)) >= 0 && isOwned(child); }).map(tagOf);
    if (order.join('|') !== expectedIds.filter(function (id) { return nodes.has(id); }).join('|')) {
      for (var o = 0; o < expectedIds.length; o += 1) {
        if (nodes.has(expectedIds[o])) node.appendChild(nodes.get(expectedIds[o]));
      }
      changed = true;
    }
    for (var c = 0; c < node.children.length; c += 1) {
      var childTag = tagOf(node.children[c]);
      if (childTag && childTag.indexOf(variantId + '/') === 0 && expectedIds.indexOf(childTag) < 0) orphan(childTag);
    }
    for (var pl = 0; pl < placed.length; pl += 1) changed = place(placed[pl][0], placed[pl][1], node) || changed;
    return changed;
  }

  // Glyph components come first so variants can instance them.
  for (var g = 0; g < payload.glyphs.length; g += 1) {
    var glyphSpec = payload.glyphs[g];
    if (conflicts.has(glyphSpec.id)) continue;
    try {
      var component = nodes.get(glyphSpec.id);
      var createdGlyph = !component;
      var glyphChanged = false;
      if (createdGlyph || component.getSharedPluginData(NS, 'svg') !== glyphSpec.svg) {
        var imported = figma.createNodeFromSvg(glyphSpec.svg);
        page.appendChild(imported);
        // Only the vectors this import brings are tagged and constrained.
        var vectors = imported.children.slice();
        if (createdGlyph) {
          component = figma.createComponentFromNode(imported);
          tag(component, glyphSpec.id);
          nodes.set(glyphSpec.id, component);
        } else {
          var stale = component.children.filter(function (child) { return tagOf(child).indexOf(glyphSpec.id + '/') === 0 && isOwned(child); });
          for (var s = 0; s < stale.length; s += 1) stale[s].remove();
          while (imported.children.length) component.appendChild(imported.children[0]);
          imported.remove();
          glyphChanged = true;
        }
        for (var v = 0; v < vectors.length; v += 1) {
          tag(vectors[v], glyphSpec.id + '/vector-' + v);
          nodes.set(glyphSpec.id + '/vector-' + v, vectors[v]);
          vectors[v].constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
        }
        component.setSharedPluginData(NS, 'svg', glyphSpec.svg);
      }
      // The SVG import frame keeps a hidden white fill; glyphs paint strokes only.
      glyphChanged = setPaints(component, 'fills', []) || glyphChanged;
      glyphChanged = setValue(component, 'name', glyphSpec.name) || glyphChanged;
      count(createdGlyph, glyphChanged, glyphSpec.id);
    } catch (caught) {
      error(glyphSpec.id, caught && caught.message ? caught.message : caught);
    }
  }

  for (var f = 0; f < sets.length; f += 1) {
    var setSpec = sets[f];
    var set = nodes.get(setSpec.id);
    var setConflict = conflicts.has(setSpec.id);
    var fresh = [];
    for (var i = 0; i < setSpec.variants.length; i += 1) {
      var variantSpec = setSpec.variants[i];
      if (conflicts.has(variantSpec.id)) continue;
      try {
        var variant = nodes.get(variantSpec.id);
        var createdVariant = !variant;
        if (createdVariant) {
          variant = figma.createComponent();
          page.appendChild(variant);
          tag(variant, variantSpec.id);
          nodes.set(variantSpec.id, variant);
          fresh.push(variant);
        } else if (set && !setConflict && variant.parent.id !== set.id) {
          set.appendChild(variant);
        }
        var variantChanged = setValue(variant, 'name', variantSpec.name);
        if (variant.getSharedPluginData(NS, 'grid') !== variantSpec.grid.join(',')) {
          variant.setSharedPluginData(NS, 'grid', variantSpec.grid.join(','));
          variantChanged = true;
        }
        variantChanged = await applyNode(variant, variantSpec.node, variantSpec.id, true) || variantChanged;
        count(createdVariant, variantChanged, variantSpec.id);
      } catch (caught) {
        error(variantSpec.id, caught && caught.message ? caught.message : caught);
      }
    }
    try {
      if (setConflict) continue;
      if (!set) {
        if (!fresh.length) throw new Error('component set has no variants to combine');
        set = figma.combineAsVariants(fresh, page);
        tag(set, setSpec.id);
        nodes.set(setSpec.id, set);
        set.name = setSpec.name;
        count(true, false, setSpec.id);
      } else {
        for (var n = 0; n < fresh.length; n += 1) set.appendChild(fresh[n]);
        count(false, setValue(set, 'name', setSpec.name), setSpec.id);
      }
    } catch (caught) {
      error(setSpec.id, caught && caught.message ? caught.message : caught);
    }
  }

  // Orphan-check batch: report orphans, then lay out glyphs and each set's variant grid.
  if (payload.expected) {
    var expected = new Set();
    payload.expected['glyph:'].forEach(function (name) { expected.add('glyph:' + name); });
    payload.expected['component-set:'].forEach(function (family) { expected.add('component-set:' + family); });
    Object.keys(payload.expected.variants).forEach(function (family) {
      var segments = payload.expected.variants[family][0];
      payload.expected.variants[family][1].forEach(function (code) {
        expected.add('component:' + family + '/' + code.split('.').map(function (index) { return segments[Number(index)]; }).join(','));
      });
    });
    var owned = Array.from(nodes.keys()).filter(function (id) {
      if (id.indexOf('component-set:') === 0) return true;
      if (id.indexOf('glyph:') === 0) return id.indexOf('/') < 0;
      return id.indexOf('component:') === 0 && id.split('/').length === 2;
    }).sort();
    for (var o = 0; o < owned.length; o += 1) {
      if (!expected.has(owned[o])) orphan(owned[o]);
    }
    // Layout moves count as updates (one tally per glyph row and per set), so
    // an unchanged rerun proves the canvas layout is stable too.
    var GAP = 24;
    var cursor = 0;
    var glyphsMoved = false;
    var glyphIds = payload.expected['glyph:'] || [];
    for (var gl = 0; gl < glyphIds.length; gl += 1) {
      var glyphNode = nodes.get('glyph:' + glyphIds[gl]);
      if (!glyphNode) continue;
      glyphsMoved = moveTo(glyphNode, cursor, 0) || glyphsMoved;
      cursor += glyphNode.width + GAP;
    }
    count(false, glyphsMoved, 'layout:glyphs');
    var top = 120;
    var setIds = payload.expected['component-set:'] || [];
    for (var si = 0; si < setIds.length; si += 1) {
      var laidOut = nodes.get('component-set:' + setIds[si]);
      if (!laidOut) continue;
      var widths = [];
      var heights = [];
      var cells = laidOut.children.filter(isOwned).map(function (child) {
        var grid = child.getSharedPluginData(NS, 'grid').split(',').map(Number);
        widths[grid[1]] = Math.max(widths[grid[1]] || 0, child.width);
        heights[grid[0]] = Math.max(heights[grid[0]] || 0, child.height);
        return [child, grid];
      });
      var offset = function (sizes, index) {
        var total = GAP;
        for (var k = 0; k < index; k += 1) total += (sizes[k] || 0) + GAP;
        return total;
      };
      var setMoved = false;
      cells.forEach(function (cell) {
        setMoved = moveTo(cell[0], offset(widths, cell[1][1]), offset(heights, cell[1][0])) || setMoved;
      });
      var setWidth = offset(widths, widths.length);
      var setHeight = offset(heights, heights.length);
      if (Math.abs(laidOut.width - setWidth) >= LAYOUT_EPSILON || Math.abs(laidOut.height - setHeight) >= LAYOUT_EPSILON) {
        laidOut.resizeWithoutConstraints(setWidth, setHeight);
        setMoved = true;
      }
      setMoved = moveTo(laidOut, 0, top) || setMoved;
      count(false, setMoved, 'layout:component-set:' + setIds[si]);
      top += setHeight + 120;
    }
  }

  // Preview batch (last): a tagged preview per family beside its laid-out
  // set. Each row pins explicit variable modes and paints the canvas token.
  if (payload.preview) {
    var rightEdge = 0;
    nodes.forEach(function (candidate, id) {
      if (id.indexOf('component-set:') === 0) rightEdge = Math.max(rightEdge, candidate.x + candidate.width);
    });
    var collections = indexByTag(await figma.variables.getLocalVariableCollectionsAsync());
    var rows = payload.preview.rows.map(function (row) {
      var modes = Object.keys(row.modes).map(function (collectionId) {
        var collection = collections.get(collectionId);
        if (!collection) throw new Error('collection ' + collectionId + ' is missing; apply the token export first');
        var mode = collection.modes.filter(function (candidate) { return candidate.name === row.modes[collectionId]; })[0];
        if (!mode) throw new Error('mode ' + row.modes[collectionId] + ' is missing in ' + collectionId);
        return [collection, mode.modeId];
      });
      return { name: row.name, modes: modes };
    });
    var ownedChild = function (id, parent, make) {
      var found = nodes.get(id);
      var created = !found;
      if (created) {
        found = make();
        parent.appendChild(found);
        tag(found, id);
        nodes.set(id, found);
      } else if (found.parent.id !== parent.id) {
        parent.appendChild(found);
        return [found, created, true];
      }
      return [found, created, false];
    };
    var autoLayout = function (frame, mode, fills) {
      var changed = setValue(frame, 'layoutMode', mode);
      changed = setValue(frame, 'counterAxisAlignItems', mode === 'HORIZONTAL' ? 'CENTER' : 'MIN') || changed;
      changed = setNumber(frame, 'itemSpacing', { value: mode === 'HORIZONTAL' ? 16 : 0 }) || changed;
      var sides = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
      for (var side = 0; side < sides.length; side += 1) changed = setNumber(frame, sides[side], { value: mode === 'HORIZONTAL' ? 16 : 0 }) || changed;
      changed = setValue(frame, 'layoutSizingHorizontal', 'HUG') || changed;
      changed = setValue(frame, 'layoutSizingVertical', 'HUG') || changed;
      return setPaints(frame, 'fills', fills) || changed;
    };
    for (var pf = 0; pf < payload.preview.families.length; pf += 1) {
      var previewSpec = payload.preview.families[pf];
      var previewId = 'preview:' + previewSpec.family;
      if (conflicts.has(previewId)) continue;
      try {
        var outer = ownedChild(previewId, page, function () { return figma.createFrame(); });
        var outerChanged = setValue(outer[0], 'name', 'Preview / ' + previewSpec.name) || outer[2];
        outerChanged = autoLayout(outer[0], 'VERTICAL', []) || outerChanged;
        var family = nodes.get('component-set:' + previewSpec.family);
        var x = rightEdge + 240;
        var y = family ? family.y : 0;
        outerChanged = moveTo(outer[0], x, y) || outerChanged;
        count(outer[1], outerChanged, previewId);
        for (var r = 0; r < rows.length; r += 1) {
          var rowId = previewId + '/' + rows[r].name;
          if (conflicts.has(rowId)) continue;
          var row = ownedChild(rowId, outer[0], function () { return figma.createFrame(); });
          var rowChanged = setValue(row[0], 'name', rows[r].name) || row[2];
          rowChanged = autoLayout(row[0], 'HORIZONTAL', [{ token: payload.preview.canvas }]) || rowChanged;
          for (var m = 0; m < rows[r].modes.length; m += 1) {
            var pinned = rows[r].modes[m];
            if (row[0].explicitVariableModes[pinned[0].id] !== pinned[1]) {
              row[0].setExplicitVariableModeForCollection(pinned[0], pinned[1]);
              rowChanged = true;
            }
          }
          var instanceIds = [];
          for (var pv = 0; pv < previewSpec.variants.length; pv += 1) {
            var source = nodes.get('component:' + previewSpec.family + '/' + previewSpec.variants[pv]);
            var instanceId = rowId + '/' + previewSpec.variants[pv];
            instanceIds.push(instanceId);
            if (conflicts.has(instanceId) || conflicts.has('component:' + previewSpec.family + '/' + previewSpec.variants[pv])) continue;
            if (!source) { error(instanceId, 'variant is missing; apply the variant batches first'); continue; }
            var made = ownedChild(instanceId, row[0], function () { return source.createInstance(); });
            var instanceChanged = made[2];
            if (!made[1] && (await made[0].getMainComponentAsync()).id !== source.id) {
              made[0].swapComponent(source);
              instanceChanged = true;
            }
            count(made[1], instanceChanged, instanceId);
          }
          var order = row[0].children.filter(isOwned).map(tagOf).filter(function (id) { return instanceIds.indexOf(id) >= 0; });
          var wanted = instanceIds.filter(function (id) { return nodes.has(id); });
          if (order.join('|') !== wanted.join('|')) {
            for (var w = 0; w < wanted.length; w += 1) row[0].appendChild(nodes.get(wanted[w]));
            rowChanged = true;
          }
          for (var rc = 0; rc < row[0].children.length; rc += 1) {
            var extra = tagOf(row[0].children[rc]);
            if (extra && instanceIds.indexOf(extra) < 0) orphan(extra);
          }
          count(row[1], rowChanged, rowId);
        }
      } catch (caught) {
        error(previewId, caught && caught.message ? caught.message : caught);
      }
    }
  }
  return summary;
}
