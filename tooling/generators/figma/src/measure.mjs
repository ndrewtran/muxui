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

function declarations(style) {
  const authored = style.cssProperties.some((property) => property.range);
  return style.cssProperties
    .filter((property) => (authored ? property.range : !property.implicit) && !property.disabled && property.parsedOk !== false)
    .map(({ name, value, important }) => ({ name, value, important: Boolean(important) }));
}

// A generated theme block: a top-level library rule on `:root` or one
// `[data-muxui-<axis>='<value>']` selector. Token custom properties declared
// anywhere else are overrides the resolver follows, so the audit sees them.
const THEME_SELECTOR = /^(?::root|\[data-muxui-[a-z-]+=(?:'[a-z0-9-]+'|"[a-z0-9-]+")\])$/u;
function isThemeRule(rule, sources) {
  return sources.get(rule.styleSheetId) === LIBRARY_STYLESHEET
    && !rule.media?.length && !rule.scopes?.length && !rule.supports?.length && !rule.containerQueries?.length
    && THEME_SELECTOR.test(rule.selectorList.text.trim());
}

// Declarations the resolver can read: custom properties and the sources of every measured longhand.
const MEASURED_NAMES = new Set(Object.values(LONGHAND_SOURCES).flat());
const measuredDeclaration = ({ name }) => name.startsWith('--') || MEASURED_NAMES.has(name);

function level(matches, inline, inside, sources) {
  const rules = matches.flatMap(({ rule }) => {
    // Layer order changes the cascade, and the resolver models unlayered rules
    // only. A layered rule that sets nothing measured (React Aria's injected
    // touch-action rule) cannot change a result, so it is left out.
    if (rule.layers?.length) {
      if (!declarations(rule.style).some(measuredDeclaration)) return [];
      throw new Error(`MUXUI_FIGMA_COMPONENTS_LAYER_UNSUPPORTED: ${describeRule(rule, sources)} sits in cascade layer ${rule.layers.map(({ text }) => text || '(anonymous)').join(' > ')}; the measurement cannot order layered rules`);
    }
    return [{
      rule: describeRule(rule, sources),
      component: rule.origin !== 'user-agent' && !isThemeRule(rule, sources),
      library: rule.origin !== 'user-agent' && sources.get(rule.styleSheetId) === LIBRARY_STYLESHEET,
      declarations: declarations(rule.style),
    }];
  });
  if (inline) rules.push({ rule: 'inline style', component: true, declarations: declarations(inline) });
  return { rules, inside };
}

/**
 * Resolver input from a `CSS.getMatchedStylesForNode` payload: the
 * pseudo-element's rules (when measuring one), the element, then its
 * ancestors nearest first. `depth` counts the ancestors inside the measured
 * component instance (below the fixture wrapper); the rest are outside.
 * @param {{ matchedCSSRules: any[], inlineStyle?: any, inherited: { matchedCSSRules: any[], inlineStyle?: any }[], pseudoElements?: { pseudoType: string, matches: any[] }[] }} matched
 * @param {{ depth: number, pseudo?: string, sources: Map<string, string>, at?: string }} options
 * @returns {import('./css.mjs').StyleContext}
 */
export function styleContext(matched, { depth, pseudo, sources, at = 'part' }) {
  const element = level(matched.matchedCSSRules, matched.inlineStyle, true, sources);
  const ancestors = matched.inherited.map((entry, ancestor) => level(entry.matchedCSSRules, entry.inlineStyle, ancestor < depth, sources));
  if (!pseudo) return { levels: [element, ...ancestors] };
  const pseudoMatches = (matched.pseudoElements ?? []).find(({ pseudoType }) => pseudoType === pseudo)?.matches;
  if (!pseudoMatches) throw new Error(`MUXUI_FIGMA_COMPONENTS_PART_MISSING: ${at} has no ::${pseudo}`);
  return { levels: [level(pseudoMatches, null, true, sources), element, ...ancestors] };
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
    const context = styleContext(matched, { depth, pseudo, sources, at: `${at.family} ${at.variant} part ${at.part}` });
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
