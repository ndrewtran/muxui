/*
 * Browser measurement: render each family's fixtures through the public
 * @muxui/react entry (see render.mjs), force every state, and resolve each bound part property's winning
 * declaration in every measured mode through CDP matched styles.
 *
 * Output is deterministic for one rendering environment: stable ordering,
 * stylesheet paths instead of protocol IDs, and no timestamps.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseJsonStrict } from '@muxui/schema';
import { cssName } from '@muxui/tokens/core';
import { STATE_EFFECTS, fixtureProps, partLonghands, repositoryRoot, selectorFor } from './anatomy.mjs';
import { LONGHAND_SOURCES, resolveProperty } from './css.mjs';
import { STYLESHEET_PATH, launchBrowser, pageShell, startServer } from './render.mjs';

/** Measured modes: Figma's Light/Dark color modes by Comfortable/Compact density modes. */
export const MODES = Object.freeze([
  { key: 'light+comfortable', colorScheme: 'light', density: 'comfortable' },
  { key: 'light+compact', colorScheme: 'light', density: 'compact' },
  { key: 'dark+comfortable', colorScheme: 'dark', density: 'comfortable' },
  { key: 'dark+compact', colorScheme: 'dark', density: 'compact' },
]);
export const DEFAULT_MODE = MODES[0].key;

/** Stable source name for the published stylesheet in rule descriptions; its document defaults count as the component's. */
const LIBRARY_STYLESHEET = 'packages/react/generated/styles.css';

/** Token source and the CSS custom property name of every token. */
export async function loadTokenSource() {
  const source = parseJsonStrict(await readFile(resolve(repositoryRoot, 'catalog/tokens/default-theme.json'), 'utf8'));
  const tokens = new Map(Object.keys(source.tokens).map((id) => [cssName(id), id]));
  return { source, tokens };
}

const entryModule = (fixtures) => `import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Mux from '@muxui/react';
const fixtures = ${JSON.stringify(fixtures)};
const h = React.createElement;
const noop = () => {};
const props = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '$noop' ? noop : value]));
createRoot(document.getElementById('root')).render(h('div', { 'data-figma-fixtures': '' },
  fixtures.map((fixture) => h('div', { key: fixture.key, 'data-fixture': fixture.key, style: { padding: '12px', width: 'max-content' } },
    h(Mux[fixture.component], props(fixture.props))))));
`;

// Stable rule description: at-rule context, selector, and stylesheet location.
function describeRule(rule, sources) {
  const context = [
    ...(rule.media ?? []).map((media) => `@media ${media.text}`),
    ...(rule.scopes ?? []).map((scope) => `@scope ${scope.text}`),
  ];
  const source = rule.origin === 'user-agent' ? 'user-agent' : `${sources.get(rule.styleSheetId) ?? 'inline'}:${(rule.style.range?.startLine ?? 0) + 1}`;
  return `${[...context, rule.selectorList.text.replace(/\s+/gu, ' ')].join(' ')} (${source})`;
}

// Skip CSS whitespace and comments from `index`; a comment ends at its first `*/`.
function skipTrivia(text, index) {
  let position = index;
  for (;;) {
    if (/[ \t\n\r\f]/u.test(text[position] ?? '')) {
      position += 1;
    } else if (text.startsWith('/*', position)) {
      const end = text.indexOf('*/', position + 2);
      position = end < 0 ? text.length : end + 2;
    } else {
      return position;
    }
  }
}

/**
 * Chrome leaves the priority annotation in the value text of an important
 * declaration: `!`, then `important` in any case, with whitespace or comments
 * around the word. The scan runs left to right, so a `!` inside a comment or a
 * string, or after a backslash, is value text and never the annotation. The
 * value is returned untouched unless its last real `!` starts exactly that
 * annotation and nothing else follows.
 */
function withoutPriority(value) {
  let bang = -1;
  for (let index = 0; index < value.length;) {
    const character = value[index];
    if (character === '\\') {
      index += 2;
    } else if (value.startsWith('/*', index)) {
      index = skipTrivia(value, index);
    } else if (character === '"' || character === "'") {
      index += 1;
      while (index < value.length && value[index] !== character) index += value[index] === '\\' ? 2 : 1;
      index += 1;
    } else {
      if (character === '!') bang = index;
      index += 1;
    }
  }
  if (bang < 0) return value;
  const word = skipTrivia(value, bang + 1);
  if (value.slice(word, word + 'important'.length).toLowerCase() !== 'important' || skipTrivia(value, word + 'important'.length) !== value.length) return value;
  return value.slice(0, bang).replace(/[ \t\n\r\f]+$/u, '');
}

function declarations(style) {
  const authored = style.cssProperties.some((property) => property.range);
  return style.cssProperties
    .filter((property) => (authored ? property.range : !property.implicit) && !property.disabled && property.parsedOk !== false)
    .map(({ name, value, important }) => ({ name, value: important ? withoutPriority(value) : value, important: Boolean(important) }));
}

// Names of the cascade layers a rule sits in, outermost first (Chrome 145 and
// 154 list them that way, although the protocol documents innermost first).
// A dotted name such as `muxui.tokens` is a path of nested layers.
const layerNames = (rule) => (rule.layers ?? []).map(({ text }) => text);

// A generated theme block: a top-level library rule on `:root` or one
// `[data-muxui-<axis>='<value>']` selector, unlayered or in the `muxui.tokens`
// layer. Token custom properties declared anywhere else are overrides the
// resolver follows, so the audit sees them.
const THEME_SELECTOR = /^(?::root|\[data-muxui-[a-z-]+=(?:'[a-z0-9-]+'|"[a-z0-9-]+")\])$/u;
const TOKENS_LAYER = 'muxui.tokens';
function isThemeRule(rule, sources) {
  return sources.get(rule.styleSheetId) === LIBRARY_STYLESHEET
    && (!rule.layers?.length || layerNames(rule).join('.') === TOKENS_LAYER)
    && !rule.media?.length && !rule.scopes?.length && !rule.supports?.length && !rule.containerQueries?.length
    && THEME_SELECTOR.test(rule.selectorList.text.trim());
}

/**
 * Cascade order of every named layer in a `CSS.getLayersForNode` tree, keyed
 * by dotted path. Chrome numbers layers by the document's layer declaration
 * order, a layer's sublayers before its own rules; a higher number wins for
 * normal declarations. Anonymous layers cannot be addressed by name, so they
 * are left out.
 * @param {{ subLayers?: any[] }} root The tree's `rootLayer`.
 * @returns {Map<string, number>}
 */
export function layerOrders(root) {
  const orders = new Map();
  const visit = (layer, path) => {
    for (const sub of layer.subLayers ?? []) {
      if (!sub.name) continue;
      const key = path ? `${path}.${sub.name}` : sub.name;
      orders.set(key, sub.order);
      visit(sub, key);
    }
  };
  visit(root, '');
  return orders;
}

// Declarations the resolver can read: custom properties and the sources of every measured longhand.
const MEASURED_NAMES = new Set(Object.values(LONGHAND_SOURCES).flat());
const measuredDeclaration = ({ name }) => name.startsWith('--') || MEASURED_NAMES.has(name);

// Cascade order of a rule's layer, or undefined for an unlayered rule. Chrome
// lists a rule's layers outermost first; if a version listed them the other
// way, a path that also exists reversed would silently take the wrong layer, so
// such a rule fails. So does a layer the page does not list by name (an
// anonymous one) rather than being guessed at.
function cascadeLayer(rule, layers, sources) {
  if (!rule.layers?.length) return undefined;
  const names = layerNames(rule);
  const order = names.includes('') ? undefined : layers.get(names.join('.'));
  if (order === undefined) {
    throw new Error(`MUXUI_FIGMA_COMPONENTS_LAYER_UNORDERED: ${describeRule(rule, sources)} sits in cascade layer ${names.map((name) => name || '(anonymous)').join(' > ')}; the measurement can only order named layers listed by the page`);
  }
  const reversed = layers.get([...names].reverse().join('.'));
  if (reversed !== undefined && reversed !== order) {
    throw new Error(`MUXUI_FIGMA_COMPONENTS_LAYER_AMBIGUOUS: ${describeRule(rule, sources)} sits in cascade layer ${names.join(' > ')}, which names two layers of the page (${names.join('.')} and ${[...names].reverse().join('.')}) depending on the order Chrome lists them`);
  }
  return order;
}

function level(matches, inline, inside, sources, layers) {
  const rules = matches.flatMap(({ rule }) => {
    // A layered rule that sets nothing measured (React Aria's injected
    // touch-action rule, in an anonymous layer) cannot change a result, so it
    // is left out rather than ordered.
    if (rule.layers?.length && !declarations(rule.style).some(measuredDeclaration)) return [];
    const layer = cascadeLayer(rule, layers, sources);
    return [{
      rule: describeRule(rule, sources),
      component: rule.origin !== 'user-agent' && !isThemeRule(rule, sources),
      library: rule.origin !== 'user-agent' && sources.get(rule.styleSheetId) === LIBRARY_STYLESHEET,
      ...(rule.origin === 'user-agent' ? { userAgent: true } : {}),
      ...(layer === undefined ? {} : { layer }),
      declarations: declarations(rule.style),
    }];
  });
  if (inline) rules.push({ rule: 'inline style', component: true, inline: true, declarations: declarations(inline) });
  return { rules, inside };
}

/**
 * Resolver input from a `CSS.getMatchedStylesForNode` payload: the
 * pseudo-element's rules (when measuring one), the element, then its
 * ancestors nearest first. `depth` counts the ancestors inside the measured
 * component instance (below the fixture wrapper); the rest are outside.
 * `layers` orders the named cascade layers (see `layerOrders`); without it a
 * layered rule that sets a measured property fails.
 * @param {{ matchedCSSRules: any[], inlineStyle?: any, inherited: { matchedCSSRules: any[], inlineStyle?: any }[], pseudoElements?: { pseudoType: string, matches: any[] }[] }} matched
 * @param {{ depth: number, pseudo?: string, sources: Map<string, string>, at?: string, layers?: Map<string, number> }} options
 * @returns {import('./css.mjs').StyleContext}
 */
export function styleContext(matched, { depth, pseudo, sources, at = 'part', layers = new Map() }) {
  const element = level(matched.matchedCSSRules, matched.inlineStyle, true, sources, layers);
  const ancestors = matched.inherited.map((entry, ancestor) => level(entry.matchedCSSRules, entry.inlineStyle, ancestor < depth, sources, layers));
  if (!pseudo) return { levels: [element, ...ancestors] };
  const pseudoMatches = (matched.pseudoElements ?? []).find(({ pseudoType }) => pseudoType === pseudo)?.matches;
  if (!pseudoMatches) throw new Error(`MUXUI_FIGMA_COMPONENTS_PART_MISSING: ${at} has no ::${pseudo}`);
  return { levels: [level(pseudoMatches, null, true, sources, layers), element, ...ancestors] };
}

/**
 * Measure one resolved anatomy in a live page.
 * @param {import('playwright-core').Page} page
 */
async function measureFamily(page, cdp, resolved, tokens, sources) {
  const { anatomy, variants } = resolved;
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const query = async (nodeId, selector) => (await cdp.send('DOM.querySelector', { nodeId, selector })).nodeId;
  const html = await query(root.nodeId, 'html');
  const layers = layerOrders((await cdp.send('CSS.getLayersForNode', { nodeId: html })).rootLayer);
  const output = variants.map(({ key, name, axes, selection, state }) => ({ key, name, axes, ...(selection ? { selection } : {}), state, parts: {} }));
  const glyphs = {};

  // Resolve `longhands` for one element (or its pseudo-element) in the current mode.
  const measureElement = async (wrapper, selector, pseudo, longhands, at) => {
    const nodeId = await query(wrapper, selector);
    if (!nodeId) throw new Error(`MUXUI_FIGMA_COMPONENTS_PART_MISSING: ${at.family} ${at.variant} part ${at.part} matches nothing for ${selector}`);
    const { object } = await cdp.send('DOM.resolveNode', { nodeId });
    const facts = await cdp.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      returnByValue: true,
      arguments: [{ value: longhands }, { value: pseudo ? `::${pseudo}` : null }],
      functionDeclaration: `function (longhands, pseudo) {
        let depth = 0;
        for (let node = this.parentElement; node && !node.hasAttribute('data-fixture'); node = node.parentElement) depth += 1;
        const style = getComputedStyle(this, pseudo);
        return {
          depth,
          computed: Object.fromEntries(longhands.map((name) => [name, style.getPropertyValue(name)])),
          text: 'value' in this && typeof this.value === 'string' ? this.value : this.textContent.trim(),
          svg: this instanceof SVGElement ? this.outerHTML : null,
          strokeWidth: style.getPropertyValue('stroke-width'),
        };
      }`,
    });
    await cdp.send('Runtime.releaseObject', { objectId: object.objectId });
    const { depth, computed, text, svg, strokeWidth } = facts.result.value;
    const matched = await cdp.send('CSS.getMatchedStylesForNode', { nodeId });
    const context = styleContext(matched, { depth, pseudo, sources, layers, at: `${at.family} ${at.variant} part ${at.part}` });
    const resolutions = {};
    for (const longhand of longhands) {
      const measured = resolveProperty(context, longhand, tokens);
      if (measured.kind === 'literal' || measured.kind === 'expression') measured.computed = computed[longhand];
      resolutions[longhand] = measured;
    }
    return { resolutions, text, svg, strokeWidth };
  };

  for (const mode of MODES) {
    await cdp.send('DOM.setAttributeValue', { nodeId: html, name: 'data-muxui-color-scheme', value: mode.colorScheme });
    await cdp.send('DOM.setAttributeValue', { nodeId: html, name: 'data-muxui-density', value: mode.density });
    for (const [index, variant] of variants.entries()) {
      const wrapper = await query(root.nodeId, `[data-fixture="${variant.key}"]`);
      const effect = STATE_EFFECTS[variant.state];
      const target = await query(wrapper, selectorFor(anatomy.stateTarget, variant));
      if (!target) throw new Error(`MUXUI_FIGMA_COMPONENTS_PART_MISSING: ${anatomy.family} ${variant.key} has no state target`);
      await cdp.send('CSS.forcePseudoState', { nodeId: target, forcedPseudoClasses: effect.pseudo ?? [] });
      for (const attribute of effect.attributes ?? []) await cdp.send('DOM.setAttributeValue', { nodeId: target, name: attribute, value: 'true' });

      for (const part of anatomy.parts) {
        if (part.when && !part.when(variant)) continue;
        const own = selectorFor(part.selector, variant);
        const from = part.measureFrom?.(variant) ?? {};
        const groups = new Map();
        for (const longhand of partLonghands(part)) {
          const selector = from[longhand] ?? own;
          groups.set(selector, [...(groups.get(selector) ?? []), longhand]);
        }
        const record = (output[index].parts[part.id] ??= { properties: {} });
        for (const [selector, longhands] of groups) {
          const facts = await measureElement(wrapper, selector, selector === own ? part.pseudo : undefined, longhands, { family: anatomy.family, variant: variant.key, part: part.id });
          for (const longhand of longhands) (record.properties[longhand] ??= {})[mode.key] = facts.resolutions[longhand];
          if (selector !== own) continue;
          if (part.node === 'TEXT') record.text = facts.text;
          if (part.node === 'GLYPH') {
            const glyph = part.glyph(variant);
            record.glyph = glyph;
            const svg = normalizeSvg(facts.svg, facts.strokeWidth);
            if (glyphs[glyph] !== undefined && glyphs[glyph] !== svg) {
              throw new Error(`MUXUI_FIGMA_COMPONENTS_GLYPH_CONFLICT: ${glyph} renders differently within ${anatomy.family} (${variant.key} ${mode.key})`);
            }
            glyphs[glyph] = svg;
          }
        }
      }
      await cdp.send('CSS.forcePseudoState', { nodeId: target, forcedPseudoClasses: [] });
      for (const attribute of effect.attributes ?? []) await cdp.send('DOM.removeAttribute', { nodeId: target, name: attribute });
    }
  }
  return { family: anatomy.family, modes: MODES.map(({ key }) => key), glyphs: sortKeys(glyphs), variants: output };
}

function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => (left < right ? -1 : 1)));
}

/**
 * Keep only the glyph geometry and stroke attributes; colour is bound in
 * Figma. The CSS stroke width replaces the SVG attribute because CSS wins.
 */
export function normalizeSvg(svg, strokeWidth) {
  if (!svg) throw new Error('MUXUI_FIGMA_COMPONENTS_GLYPH_MISSING: a GLYPH part must select an <svg> element');
  const width = /^\d+(?:\.\d+)?(?:px)?$/u.test(strokeWidth ?? '') ? strokeWidth.replace('px', '') : undefined;
  return svg
    .replace(/\s(?:class|aria-hidden|focusable|style|data-[a-z-]+)="[^"]*"/gu, '')
    .replace(/stroke-width="[^"]*"/u, (attribute) => (width ? `stroke-width="${width}"` : attribute))
    .replace(/stroke="currentColor"/gu, 'stroke="#000000"')
    .replace(/\s+/gu, ' ')
    .replace(/>\s+</gu, '><')
    .trim();
}

/**
 * Render and measure resolved anatomies. One page serves every family so the
 * stylesheet is parsed once; each family renders into its own document.
 * @param {ReturnType<typeof import('./anatomy.mjs').resolveAnatomy>[]} resolvedFamilies
 */
export async function measureFamilies(resolvedFamilies) {
  const { tokens } = await loadTokenSource();
  const pages = {};
  const modules = {};
  for (const { anatomy, variants } of resolvedFamilies) {
    const fixtures = variants.map((variant) => ({ key: variant.key, component: anatomy.component, props: fixtureProps(anatomy, variant) }));
    modules[`/figma-${anatomy.family}.mjs`] = entryModule(fixtures);
    pages[`/figma-${anatomy.family}.html`] = pageShell({
      attributes: `data-muxui-color-scheme="${MODES[0].colorScheme}" data-muxui-density="${MODES[0].density}"`,
      entry: `/figma-${anatomy.family}.mjs`,
    });
  }
  const server = await startServer({ pages, modules });
  let browser;
  try {
    browser = await launchBrowser();
    const results = [];
    for (const resolved of resolvedFamilies) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1200 }, reducedMotion: 'reduce' });
      const browserPage = await context.newPage();
      const errors = [];
      browserPage.on('pageerror', (error) => errors.push(error.message));
      const cdp = await context.newCDPSession(browserPage);
      const sources = new Map();
      cdp.on('CSS.styleSheetAdded', ({ header }) => {
        const path = header.sourceURL ? new URL(header.sourceURL, server.url).pathname.replace(/^\//u, '') : '';
        if (path) sources.set(header.styleSheetId, `/${path}` === STYLESHEET_PATH ? LIBRARY_STYLESHEET : path);
      });
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      await browserPage.goto(`${server.url}/figma-${resolved.anatomy.family}.html`, { waitUntil: 'networkidle' });
      const rootSelector = selectorFor(resolved.anatomy.parts[0].selector, resolved.variants[0]);
      try {
        await browserPage.waitForFunction(({ count, selector }) => {
          const wrappers = document.querySelectorAll('[data-fixture]');
          return wrappers.length === count && [...wrappers].every((wrapper) => wrapper.querySelector(selector));
        }, { count: resolved.variants.length, selector: rootSelector }, { timeout: 30_000 });
      } catch (error) {
        throw new Error(`${error.message}\n${errors.join('\n')}`);
      }
      // Let layout effects (for example the Tabs indicator) settle before measuring.
      await browserPage.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      results.push(await measureFamily(browserPage, cdp, resolved, tokens, sources));
      if (errors.length) throw new Error(`MUXUI_FIGMA_COMPONENTS_PAGE_ERROR: ${resolved.anatomy.family}: ${errors.join('\n')}`);
      await context.close();
    }
    return results;
  } finally {
    await browser?.close();
    await server.close();
  }
}
