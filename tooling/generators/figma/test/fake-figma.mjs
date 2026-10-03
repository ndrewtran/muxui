/*
 * In-memory model of the Plugin API surface the component applier uses.
 * Every write after setup is counted so a no-op rerun can prove it changed
 * nothing; `removes` counts deletions, which the applier must never make.
 * `state.nodeWrites` counts writes per node ID, so a test can prove one node
 * was left untouched. Like Figma: `create*` and `clone()` land on the current
 * page (`state.createdOn` records which), clones copy plugin data, instances
 * and their sublayers read their main component's plugin data until they set
 * their own (probed in Figma, October 2026), and resize() fixes both
 * auto-layout axes.
 */
import assert from 'node:assert/strict';

export function createFakeFigma(source) {
  let nextId = 1;
  const state = { writes: 0, removes: 0, fonts: new Set(), createdOn: new Set(), nodeWrites: new Map() };
  const newId = (prefix) => `${prefix}:${nextId++}`;
  const alias = (variable) => ({ type: 'VARIABLE_ALIAS', id: variable.id });
  const node = (type, fields = {}, inherit = null) => {
    const data = new Map();
    const target = {
      id: newId(type), type, name: type, parent: null, children: [], x: 0, y: 0, width: 100, height: 100,
      fills: [], strokes: [], effects: [], effectStyleId: '', opacity: 1, boundVariables: {}, layoutMode: 'NONE', explicitVariableModes: {},
      ...fields,
    };
    const proxy = new Proxy(target, {
      set(object, key, value) {
        if (key === 'parent') {
          object.parent = value;
          return true;
        }
        if (object.type === 'TEXT' && ['characters', 'fontName', 'fontSize', 'lineHeight'].includes(key)) {
          assert.ok(state.fonts.has(`${object.fontName.family}/${object.fontName.style}`), `font for ${String(key)} not loaded`);
        }
        write();
        object[key] = structuredClone(value);
        return true;
      },
    });
    const write = () => {
      state.writes += 1;
      state.nodeWrites.set(target.id, (state.nodeWrites.get(target.id) ?? 0) + 1);
    };
    const detach = (child) => {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
    };
    Object.assign(target, {
      getSharedPluginData: (namespace, key) => data.get(`${namespace}/${key}`) ?? (inherit ? inherit.getSharedPluginData(namespace, key) : ''),
      setSharedPluginData: (namespace, key, value) => { write(); data.set(`${namespace}/${key}`, value); },
      appendChild(child) { write(); detach(child); child.parent = proxy; target.children.push(child); },
      remove() { state.removes += 1; detach(proxy); },
      findAll(filter) {
        const found = [];
        const visit = (current) => current.children.forEach((child) => { if (filter(child)) found.push(child); visit(child); });
        visit(target);
        return found;
      },
      resize(width, height) {
        write();
        target.width = width;
        target.height = height;
        if (target.layoutMode !== 'NONE') Object.assign(target, { layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED' });
      },
      resizeWithoutConstraints(width, height) { write(); target.width = width; target.height = height; },
      setBoundVariable(field, variable) {
        write();
        if (variable) target.boundVariables = { ...target.boundVariables, [field]: alias(variable) };
        else target.boundVariables = Object.fromEntries(Object.entries(target.boundVariables).filter(([key]) => key !== field));
      },
      async setEffectStyleIdAsync(id) { write(); target.effectStyleId = id; },
      async setTextStyleIdAsync(id) { write(); target.textStyleId = id; },
      setExplicitVariableModeForCollection(collection, modeId) { write(); target.explicitVariableModes = { ...target.explicitVariableModes, [collection.id]: modeId }; },
      async getMainComponentAsync() { return target.mainComponent; },
      swapComponent(component) { write(); target.mainComponent = component; },
      clone() {
        const copy = (source, parent) => {
          const { id, parent: _parent, children, ...fields } = source.raw;
          const created = node(source.type, structuredClone(Object.fromEntries(Object.entries(fields).filter(([, value]) => typeof value !== 'function' && !(value && value.raw)))), source.inheritFrom);
          if (fields.mainComponent) created.raw.mainComponent = fields.mainComponent;
          for (const [key, value] of source.data) created.data.set(key, value);
          if (parent) parent.appendChild(created);
          for (const child of children) copy(child, created);
          return created;
        };
        const duplicate = copy(proxy, null);
        figma.currentPage.appendChild(duplicate);
        state.createdOn.add(figma.currentPage.name);
        return duplicate;
      },
      createInstance() {
        const instance = node('INSTANCE', { mainComponent: proxy, width: target.width, height: target.height }, proxy);
        for (const child of target.children) instance.appendChild(node(child.type, { strokes: structuredClone(child.strokes), strokeWeight: child.strokeWeight }, child));
        state.createdOn.add(figma.currentPage.name);
        return instance;
      },
    });
    Object.defineProperties(target, {
      raw: { value: target },
      data: { value: data },
      inheritFrom: { value: inherit },
    });
    state.writes += 1;
    return proxy;
  };
  const page = (name) => node('PAGE', { name });
  const pages = [page('Page 1'), page('Pilot components')];
  const untouched = node('FRAME', { name: 'Pilot button' });
  pages[1].appendChild(untouched);
  const variables = [];
  const tagged = (item, id) => { item.setSharedPluginData('muxui', 'id', id); return item; };
  const onPage = (created) => { state.createdOn.add(figma.currentPage.name); return created; };
  const figma = {
    root: { children: pages },
    currentPage: pages[0],
    async setCurrentPageAsync(target) { figma.currentPage = target; },
    createPage() { const created = page('Page'); pages.push(created); return created; },
    createFrame: () => onPage(node('FRAME', { fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }] })),
    createText: () => onPage(node('TEXT', { fontName: { family: 'Inter', style: 'Regular' }, characters: '', fontSize: 12, lineHeight: { unit: 'AUTO' }, textStyleId: '', textAutoResize: 'NONE' })),
    createComponent: () => onPage(node('COMPONENT')),
    createNodeFromSvg(svg) {
      const frame = onPage(node('FRAME', { width: 12, height: 12, fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, visible: false }] }));
      for (const _path of svg.match(/<path/gu) ?? []) frame.appendChild(node('VECTOR', { strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }], strokeWeight: 1 }));
      return frame;
    },
    createComponentFromNode(frame) {
      const component = node('COMPONENT', { width: frame.width, height: frame.height, fills: structuredClone(frame.fills) });
      frame.parent.appendChild(component);
      while (frame.children.length) component.appendChild(frame.children[0]);
      frame.remove();
      state.removes -= 1; // Conversion replaces the frame; it is not a deletion of user content.
      return component;
    },
    combineAsVariants(components, parent) {
      const set = node('COMPONENT_SET');
      parent.appendChild(set);
      for (const component of components) set.appendChild(component);
      return set;
    },
    variables: {
      getLocalVariablesAsync: async () => [...variables],
      getLocalVariableCollectionsAsync: async () => collections,
      setBoundVariableForPaint: (paint, field, variable) => ({ ...paint, boundVariables: { [field]: alias(variable) } }),
      setBoundVariableForEffect: (effect, field, variable) => ({ ...effect, boundVariables: { [field]: alias(variable) } }),
    },
    getLocalTextStylesAsync: async () => [],
    getLocalEffectStylesAsync: async () => effectStyles,
    loadFontAsync: async (font) => { state.fonts.add(`${font.family}/${font.style}`); },
  };
  for (const id of Object.keys(source.tokens).filter((token) => source.tokens[token].type !== 'effect')) variables.push(tagged(node('VARIABLE'), id));
  const collections = [['semantic-color', 'Light', 'Dark'], ['semantic-dimension', 'Comfortable', 'Compact']].map(([key, ...names]) => {
    const collection = tagged(node('VARIABLE_COLLECTION'), `collection:${key}`);
    collection.modes = names.map((name, index) => ({ name, modeId: `${key}:${index}` }));
    return collection;
  });
  const effectStyles = Object.keys(source.tokens).filter((id) => source.tokens[id].type === 'effect').map((id) => tagged(node('EFFECT_STYLE'), id));
  state.writes = 0;
  return { figma, state, pages, untouched, variableId: (token) => variables.find((variable) => variable.getSharedPluginData('muxui', 'id') === token).id };
}

const AsyncFunction = (async () => {}).constructor;
export async function applyAll(figma, plan) {
  const totals = { created: 0, updated: 0, unchanged: 0, updatedIds: [], errors: [], orphans: [], notices: [] };
  for (const { script } of plan) {
    const summary = await new AsyncFunction('figma', script)(figma);
    assert.ok(JSON.stringify(summary).length <= 20_000);
    for (const key of ['created', 'updated', 'unchanged']) totals[key] += summary[key];
    totals.updatedIds.push(...summary.updatedIds);
    totals.errors.push(...summary.errors);
    totals.orphans.push(...summary.orphans);
    totals.notices.push(...summary.notices);
  }
  return totals;
}
