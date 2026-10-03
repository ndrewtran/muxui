/*
 * Spec compiler: turns audited measurements into a deterministic Figma
 * component-spec document. Each family becomes one component set whose
 * variants hold auto-layout part trees with variables, text styles, and
 * effect styles bound by token ID. A coverage report lists every field that
 * is literal, derived, or unbound, with its reason.
 */
import { canonicalDigest } from '@muxui/schema';
import { compileTokenGraph } from '@muxui/tokens';
import { compileFigmaExport } from '@muxui/tokens/figma';
import { selectorFor } from './anatomy.mjs';
import { DEFAULT_MODE } from './measure.mjs';
import { comparable } from './audit.mjs';

export const SPEC_FORMAT = 'muxui-figma-components-v1';
const ROOT_FONT_SIZE_PX = 16;
const FULL_RADIUS = 9999;
const FONT_STYLES = Object.freeze({
  100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black',
});

/** Reasons a painted colour may stay literal. Anything else fails binding coverage. */
export const LITERAL_PAINT_REASONS = Object.freeze({});

/** Token facts the spec compiler needs from the canonical source and the token export. */
export function tokenContext(source) {
  const exported = compileFigmaExport({ source });
  const graph = compileTokenGraph(source);
  return {
    exportDigest: exported.provenance.exportDigest,
    variableTypes: new Map(exported.variables.map(({ tokenId, type }) => [tokenId, type])),
    effectStyles: new Set(exported.effectStyles.map(({ tokenId }) => tokenId)),
    textStyles: exported.textStyles.map(({ id, bindings }) => ({ id, bindings })),
    graph,
  };
}

function round(value) {
  return Number(value.toFixed(3));
}

// Pixels for a CSS length literal, or undefined when it is not a fixed length.
function lengthPx(text) {
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  if (trimmed === '0') return 0;
  const match = /^(-?\d*\.?\d+)(px|rem)$/u.exec(trimmed);
  if (!match) return undefined;
  return round(Number(match[1]) * (match[2] === 'rem' ? ROOT_FONT_SIZE_PX : 1));
}

function parseRgba(text) {
  const match = /^rgba?\(([^)]+)\)$/u.exec(text ?? '');
  if (!match) return undefined;
  const [r, g, b, a = '1'] = match[1].split(/[\s,/]+/u).filter(Boolean);
  return { r: round(Number(r) / 255), g: round(Number(g) / 255), b: round(Number(b) / 255), a: round(Number(a)) };
}

function isTransparent(measured) {
  if (measured.kind !== 'literal') return false;
  const color = parseRgba(measured.computed);
  return measured.value === 'transparent' || measured.value === 'none' || (color !== undefined && color.a === 0);
}

/**
 * Compile one family. `measured` is that family's measurement document after
 * the mode audit, so the default mode stands for every mode.
 */
function compileFamily(resolved, measured, tokens) {
  const { anatomy, axes, variants } = resolved;
  const coverage = [];
  const note = (part, field, status, reason, value) => coverage.push({ part, field, status, reason, ...(value === undefined ? {} : { value }) });
  const variable = (part, field, token, type) => {
    if (tokens.variableTypes.get(token) !== type) {
      throw new Error(`MUXUI_FIGMA_COMPONENTS_BINDING_TYPE: ${anatomy.family} ${part} ${field} resolves to ${token}, which is not a ${type} variable`);
    }
    note(part, field, 'bound');
    return { token };
  };

  const byKey = new Map(measured.variants.map((variant) => [variant.key, variant]));
  const children = (parentId) => anatomy.parts.filter((part) => part.parent === parentId);
  const stateIndex = new Map(anatomy.states.map((state, index) => [state, index]));
  const selections = anatomy.selection ? Object.keys(anatomy.selection.values) : [undefined];
  const rowKeys = [];

  const compiled = variants.map((variant) => {
    const record = byKey.get(variant.key);
    if (!record) throw new Error(`MUXUI_FIGMA_COMPONENTS_MEASUREMENT_MISSING: ${anatomy.family} ${variant.key}`);
    const value = (partId, longhand) => {
      const byMode = record.parts[partId]?.properties[longhand];
      if (!byMode) throw new Error(`MUXUI_FIGMA_COMPONENTS_MEASUREMENT_MISSING: ${anatomy.family} ${variant.key} ${partId} ${longhand}`);
      const measuredValue = byMode[DEFAULT_MODE];
      for (const other of Object.values(byMode)) {
        if (comparable(other) !== comparable(measuredValue)) {
          throw new Error(`MUXUI_FIGMA_MODE_INCONSISTENT: ${anatomy.family} ${variant.key} ${partId} ${longhand}; run the mode audit first`);
        }
      }
      return measuredValue;
    };

    // Numeric field: a FLOAT variable, a fixed literal, or nothing (hug/auto).
    const number = (part, field, measuredValue, { allowPercent = false, quiet = false } = {}) => {
      if (quiet) {
        const mark = coverage.length;
        const silent = number(part, field, measuredValue, { allowPercent });
        coverage.length = mark;
        return silent;
      }
      if (measuredValue.kind === 'token') return variable(part, field, measuredValue.token, 'FLOAT');
      if (measuredValue.kind === 'literal') {
        // Relative lengths use the browser's computed pixels; keywords such as
        // fit-content or auto leave the field to hug its content.
        const relative = /^-?\d*\.?\d+(?:em|ex|ch|lh)$/u.test(measuredValue.value);
        const px = lengthPx(measuredValue.value) ?? (relative ? lengthPx(measuredValue.computed) : undefined);
        if (px !== undefined) {
          if (px !== 0) note(part, field, 'literal', 'CSS declares a literal length.', `${measuredValue.value}`);
          return { value: px };
        }
        if (allowPercent && measuredValue.value === '50%') {
          note(part, field, 'literal', 'A 50% radius on a square part is fully round; Figma uses a 9999 radius.', '50%');
          return { value: FULL_RADIUS };
        }
        return undefined;
      }
      if (measuredValue.kind === 'expression') {
        const px = lengthPx(measuredValue.computed);
        note(part, field, 'literal', `Figma cannot express calc(); the default-mode computed value of ${measuredValue.value} is used.`, measuredValue.computed);
        return px === undefined ? undefined : { value: px };
      }
      return undefined;
    };

    // Colour: a COLOR variable paint, an overlay (token at N% opacity), or
    // nothing. Only a background (`fills`, `overlay`) may resolve to nothing,
    // meaning transparent; text, glyph, and painted stroke colours that resolve
    // to nothing or to a value outside the instance are unbound.
    const paint = (part, field, measuredValue, overlays) => {
      const background = field === 'fills' || field === 'overlay';
      if (measuredValue.kind === 'token') return [variable(part, field, measuredValue.token, 'COLOR')];
      if (measuredValue.kind === 'mix') {
        const bound = variable(part, field, measuredValue.token, 'COLOR');
        const opacity = round(measuredValue.percent / 100);
        if (background) {
          overlays.push({ token: measuredValue.token, opacity, mixed: true });
          return [];
        }
        note(part, `${field}.opacity`, 'derived', `color-mix(token ${measuredValue.percent}%, transparent) becomes the bound paint at that opacity.`, `${measuredValue.percent}%`);
        return [{ ...bound, opacity }];
      }
      if (measuredValue.kind === 'overlay') return paint(part, field, measuredValue.paint, overlays);
      if (isTransparent(measuredValue)) return [];
      if (measuredValue.kind === 'none' || measuredValue.kind === 'outside') {
        if (background) return [];
        note(part, field, 'unbound', measuredValue.kind === 'none' ? 'No colour declaration resolves for this painted field.' : 'The colour comes from outside the component instance.', measuredValue.rule);
        return [];
      }
      const reason = LITERAL_PAINT_REASONS[`${anatomy.family}.${part}.${field}`];
      const color = parseRgba(measuredValue.computed);
      note(part, field, reason ? 'literal' : 'unbound', reason ?? `Painted colour ${measuredValue.value ?? measuredValue.kind} has no token.`, measuredValue.value);
      return color ? [{ color }] : [];
    };

    // Effects in Figma paint order: Figma draws later effects on top, CSS draws
    // the first box-shadow layer on top, so the layers are reversed.
    const shadow = (part, measuredValue) => {
      if (measuredValue.kind === 'token') {
        if (!tokens.effectStyles.has(measuredValue.token)) {
          throw new Error(`MUXUI_FIGMA_COMPONENTS_BINDING_TYPE: ${anatomy.family} ${part} box-shadow resolves to ${measuredValue.token}, which is not an effect style`);
        }
        note(part, 'effects', 'bound');
        return { style: measuredValue.token };
      }
      if (measuredValue.kind === 'shadow') {
        const painted = measuredValue.layers.filter((layer) => !isTransparent(layer.color));
        return painted.map((layer, index) => {
          const [x = 0, y = 0, blur = 0, spread = 0] = layer.lengths.map((length) => lengthPx(length) ?? 0);
          const field = `effects[${index}]`;
          let color;
          if (layer.color.kind === 'token') color = variable(part, field, layer.color.token, 'COLOR');
          else if (layer.color.kind === 'mix') {
            variable(part, field, layer.color.token, 'COLOR');
            note(part, `${field}.alpha`, 'lossy', `A bound effect colour takes the variable's alpha; the ${layer.color.percent}% color-mix alpha is not kept.`, `${layer.color.percent}%`);
            color = { token: layer.color.token };
          } else {
            note(part, field, 'unbound', 'Shadow colour has no token.', layer.color.value);
            color = { color: parseRgba(layer.color.value) ?? { r: 0, g: 0, b: 0, a: 1 } };
          }
          if (layer.lengths.some((length) => lengthPx(length) !== 0)) note(part, `${field}.geometry`, 'literal', 'CSS declares literal shadow offsets, blur, and spread.', layer.lengths.join(' '));
          return { type: layer.inset ? 'INNER_SHADOW' : 'DROP_SHADOW', x, y, blur, spread, color };
        }).reverse();
      }
      return undefined;
    };

    // Figma renders spread only on filled, clipped frames. A fill-less ring of
    // sharp spread shadows becomes outset frames with inside strokes, one band
    // per layer, as the hand-built pilot drew ghost focus rings.
    const ringsFor = (id, node, effects) => {
      if (node.fills.length || !Array.isArray(effects) || !effects.length) return undefined;
      if (!effects.every((effect) => effect.type === 'DROP_SHADOW' && effect.x === 0 && effect.y === 0 && effect.blur === 0 && effect.spread > 0)) return undefined;
      const corner = node.radius ?? node.radii?.topLeft;
      const radius = corner?.value ?? (corner?.token ? Number(tokens.graph.tokens[corner.token]?.value) : 0);
      const bands = [...effects].sort((left, right) => left.spread - right.spread);
      note(id, 'effects', 'derived', 'Figma draws spread shadows only on filled, clipped frames; this fill-less ring becomes outset frames with inside strokes, and their radii are default-mode pixels.');
      return bands.map((band, index) => {
        const weight = round(band.spread - (index ? bands[index - 1].spread : 0));
        return {
          part: `${id}-ring${index ? `-${index + 1}` : ''}`,
          type: 'FRAME',
          name: 'focus-ring',
          layout: { mode: 'NONE', positioning: 'ABSOLUTE', placement: 'outset', outset: band.spread },
          fills: [],
          strokes: [band.color],
          strokeWeights: { top: weight, right: weight, bottom: weight, left: weight },
          strokeAlign: 'INSIDE',
          ...(radius ? { radius: { value: radius >= FULL_RADIUS ? FULL_RADIUS : round(radius + band.spread) } } : {}),
        };
      });
    };

    const strokeOf = (partId, part) => {
      const sides = ['top', 'right', 'bottom', 'left'];
      // Declared widths first: Chromium snaps computed border widths to device pixels.
      const width = (side) => lengthPx(value(partId, `border-${side}-width`).value) ?? lengthPx(value(partId, `border-${side}-width`).computed) ?? 0;
      const painted = sides.filter((side) => value(partId, `border-${side}-style`).value !== 'none' && width(side) > 0);
      const overlays = [];
      if (painted.length) {
        const colors = new Set(painted.map((side) => comparable(value(partId, `border-${side}-color`))));
        if (colors.size > 1) throw new Error(`MUXUI_FIGMA_COMPONENTS_STROKE: ${anatomy.family} ${part} borders use different colours per side`);
        const strokes = paint(part, 'strokes', value(partId, `border-${painted[0]}-color`), overlays);
        const weights = Object.fromEntries(sides.map((side) => [side, painted.includes(side) ? width(side) : 0]));
        note(part, 'strokeWeight', 'literal', 'CSS declares a literal border width.', `${weights.top} ${weights.right} ${weights.bottom} ${weights.left}`);
        return { strokes, weights, align: 'INSIDE', border: true };
      }
      const outlineWidth = lengthPx(value(partId, 'outline-width').value) ?? lengthPx(value(partId, 'outline-width').computed) ?? 0;
      if (value(partId, 'outline-style').value === 'none' || outlineWidth === 0) return undefined;
      const strokes = paint(part, 'strokes', value(partId, 'outline-color'), overlays);
      if (!strokes.length) return undefined;
      const offset = lengthPx(value(partId, 'outline-offset').value) ?? 0;
      note(part, 'strokeWeight', 'literal', 'CSS declares a literal outline width.', `${outlineWidth}px`);
      if (offset !== 0 && offset !== -outlineWidth) note(part, 'strokeAlign', 'literal', `The ${offset}px outline offset has no Figma equivalent; the outline is drawn as an outside stroke.`, `${offset}px`);
      const weights = { top: outlineWidth, right: outlineWidth, bottom: outlineWidth, left: outlineWidth };
      return { strokes, weights, align: offset === -outlineWidth ? 'INSIDE' : offset < 0 ? 'CENTER' : 'OUTSIDE' };
    };

    const textOf = (partId, part, characters) => {
      const overlays = [];
      const fills = paint(part, 'text.fills', value(partId, 'color'), overlays);
      const size = value(partId, 'font-size');
      const weight = value(partId, 'font-weight');
      const family = value(partId, 'font-family');
      const lineHeight = value(partId, 'line-height');
      const text = { characters, fills };
      const style = size.kind === 'token' && weight.kind === 'token'
        ? tokens.textStyles.find(({ bindings }) => bindings.fontSize === size.token && bindings.fontWeight === weight.token)
        : undefined;
      if (style) {
        note(part, 'text.style', 'bound');
        text.style = style.id;
        return text;
      }
      const fontSize = number(part, 'text.fontSize', size);
      if (fontSize) text.fontSize = fontSize;
      if (weight.kind === 'token') text.fontWeight = variable(part, 'text.fontWeight', weight.token, 'FLOAT');
      const familyValue = family.kind === 'token' ? tokens.graph.tokens[family.token]?.value : family.value;
      const weightValue = weight.kind === 'token' ? tokens.graph.tokens[weight.token]?.value : Number(weight.value);
      text.fontName = { family: String(familyValue ?? 'Inter').split(',')[0].trim().replace(/^["']|["']$/gu, ''), style: FONT_STYLES[weightValue] ?? 'Regular' };
      note(part, 'text.fontName', 'literal', 'Figma needs a single family name; the CSS font stack resolves to its first family.', text.fontName.family);
      const multiplier = lineHeight.kind === 'token' ? Number(tokens.graph.tokens[lineHeight.token]?.value) : Number(lineHeight.value);
      if (Number.isFinite(multiplier)) {
        text.lineHeight = { unit: 'PERCENT', value: round(multiplier * 100) };
        note(part, 'text.lineHeight', 'literal', 'Figma binds line height to pixel values only; the CSS unitless multiplier becomes a percent.', String(lineHeight.token ?? lineHeight.value));
      } else {
        const px = lengthPx(lineHeight.computed);
        text.lineHeight = px === undefined ? { unit: 'AUTO' } : { unit: 'PIXELS', value: px };
        if (px !== undefined) note(part, 'text.lineHeight', 'literal', 'CSS line height computes to a literal pixel value.', lineHeight.computed);
      }
      return text;
    };

    // Opacity of any part: a FLOAT variable or a literal. A part measured on
    // its parent's element (a text value inside its input) inherits the
    // parent's layer opacity in Figma, so it does not repeat it.
    const opacityOf = (part) => {
      const opacity = value(part.id, 'opacity');
      const parent = anatomy.parts.find(({ id }) => id === part.parent);
      if (parent && part.pseudo === parent.pseudo && selectorFor(part.selector, variant) === selectorFor(parent.selector, variant)) {
        if (opacity.kind !== 'none' && Number(opacity.value) !== 1) note(part.id, 'opacity', 'derived', `The part shares the ${parent.id} element, whose layer carries this opacity.`, opacity.value ?? opacity.token);
        return undefined;
      }
      if (opacity.kind === 'token') return variable(part.id, 'opacity', opacity.token, 'FLOAT');
      if (opacity.kind === 'literal' && Number(opacity.value) !== 1) {
        note(part.id, 'opacity', 'literal', 'CSS declares a literal opacity.', opacity.value);
        return { value: Number(opacity.value) };
      }
      return undefined;
    };

    const build = (part, parentLayout) => {
      const id = part.id;
      const layout = part.layout ?? {};
      const partRecord = record.parts[id];
      const node = { part: id, type: part.node, name: id };
      const opacity = opacityOf(part);
      if (opacity) node.opacity = opacity;
      if (part.node === 'TEXT') {
        node.text = textOf(id, id, partRecord.text);
        return node;
      }
      if (part.node === 'GLYPH') {
        const overlays = [];
        node.glyph = partRecord.glyph;
        node.strokes = paint(id, 'glyph.strokes', value(id, 'color'), overlays);
        const width = number(id, 'width', value(id, 'width'));
        const height = number(id, 'height', value(id, 'height'));
        if (width) node.width = width;
        if (height) node.height = height;
        return node;
      }
      const has = (group) => part.bind.includes(group);
      let borders;
      const direction = layout.direction;
      node.layout = {
        mode: direction ?? 'NONE',
        ...(direction ? {
          primary: typeof layout.justify === 'function' ? layout.justify(variant) : layout.justify ?? 'MIN',
          counter: layout.align ?? 'MIN',
        } : {}),
        ...(layout.placement ? { positioning: 'ABSOLUTE', placement: layout.placement } : {}),
      };
      const overlays = [];
      node.fills = has('fill') ? paint(id, 'fills', value(id, 'background-color'), overlays) : [];
      if (has('overlay')) {
        const image = value(id, 'background-image');
        // A plain token overlay paints at full opacity; a color-mix one at its percent.
        if (image.kind === 'overlay' && image.paint.kind === 'token') overlays.push({ token: variable(id, 'overlay', image.paint.token, 'COLOR').token, opacity: 1, mixed: false });
        else if (image.kind === 'overlay') paint(id, 'overlay', image, overlays);
        else if (!(image.kind === 'literal' && image.value === 'none') && image.kind !== 'none') note(id, 'overlay', 'unbound', 'Background image is not a single-colour overlay.', image.value);
      }
      if (has('stroke')) {
        const stroke = strokeOf(id, id);
        if (stroke) Object.assign(node, { strokes: stroke.strokes, strokeWeights: stroke.weights, strokeAlign: stroke.align });
        if (stroke?.border) borders = stroke.weights;
      }
      if (has('radius')) {
        // One radius when all four corners agree; otherwise Figma's per-corner fields.
        const corners = [['topLeft', 'border-top-left-radius'], ['topRight', 'border-top-right-radius'], ['bottomRight', 'border-bottom-right-radius'], ['bottomLeft', 'border-bottom-left-radius']];
        const quiet = corners.map(([, longhand]) => number(id, 'cornerRadius', value(id, longhand), { allowPercent: true, quiet: true }));
        const empty = (radius) => !radius || radius.value === 0;
        if (quiet.every((radius) => JSON.stringify(radius ?? null) === JSON.stringify(quiet[0] ?? null))) {
          const radius = number(id, 'cornerRadius', value(id, 'border-top-left-radius'), { allowPercent: true });
          if (!empty(radius)) node.radius = radius;
        } else {
          node.radii = Object.fromEntries(corners.map(([corner, longhand]) => {
            const radius = number(id, `${corner}Radius`, value(id, longhand), { allowPercent: true });
            return [corner, empty(radius) ? { value: 0 } : radius];
          }));
        }
      }
      if ((has('padding') || layout.paddingFrom) && direction) {
        const padding = {};
        for (const side of ['top', 'right', 'bottom', 'left']) {
          const field = `padding${side[0].toUpperCase()}${side.slice(1)}`;
          if (layout.ignore?.[field]) {
            note(id, field, 'derived', layout.ignore[field]);
            continue;
          }
          if (layout.paddingFrom && (side === 'left' || side === 'right')) {
            const measuredInset = value(layout.paddingFrom.part, layout.paddingFrom.longhand);
            const inset = number(id, field, measuredInset, { quiet: true });
            if (inset?.token) note(id, field, 'bound');
            else note(id, field, 'literal', `CSS insets the absolutely positioned ${layout.paddingFrom.part} by this literal; Figma pads the auto layout by it instead.`, measuredInset.value);
            // The inset runs from this part's outer edge; Figma lays out inside its stroke.
            if (inset?.value && borders?.[side]) {
              inset.value = round(inset.value - borders[side]);
              note(id, field, 'derived', 'Figma includes the border in layout, so the inset loses the border width.', `-${borders[side]}px`);
            }
            if (inset) padding[side] = inset;
            continue;
          }
          if (layout.centerInMinHeight && (side === 'top' || side === 'bottom')) {
            note(id, field, 'derived', 'CSS derives vertical padding from the bound min height; Figma centres content within that min height instead.');
            continue;
          }
          if (!has('padding')) continue;
          const resolvedPadding = number(id, field, value(id, `padding-${side}`));
          if (resolvedPadding && !('value' in resolvedPadding && resolvedPadding.value === 0)) padding[side] = resolvedPadding;
        }
        if (Object.keys(padding).length) node.padding = padding;
      }
      if (has('gap') && direction) {
        const expressionToken = layout.expressionTokens?.itemSpacing;
        const gap = value(id, direction === 'HORIZONTAL' ? 'column-gap' : 'row-gap');
        if (expressionToken) {
          const source = layout.expressionTokens.from ? value(id, layout.expressionTokens.from) : gap;
          if (!(source.tokens ?? []).includes(expressionToken) && source.token !== expressionToken) {
            throw new Error(`MUXUI_FIGMA_COMPONENTS_EXPRESSION_TOKEN: ${anatomy.family} ${id} itemSpacing expects ${expressionToken} in ${source.value ?? source.token}`);
          }
          node.gap = variable(id, 'itemSpacing', expressionToken, 'FLOAT');
          note(id, 'itemSpacing', 'derived', `CSS spaces this part with ${source.value ?? source.token}; Figma binds the named token as item spacing.`);
        } else if (!(gap.kind === 'literal' && gap.value === 'normal')) {
          const resolvedGap = number(id, 'itemSpacing', gap);
          if (resolvedGap) node.gap = resolvedGap;
        }
      }
      if (has('size')) {
        // Figma frames are border-box; a content-box CSS size excludes the
        // border and padding, so literal sizes add them back.
        const contentBox = value(id, 'box-sizing').value !== 'border-box';
        const extra = (axis) => {
          const sides = axis === 'width' ? ['left', 'right'] : ['top', 'bottom'];
          return sides.reduce((total, side) => total + (borders?.[side] ?? 0) + (node.padding?.[side]?.value ?? 0), 0);
        };
        for (const [field, longhand] of [['width', 'width'], ['height', 'height'], ['minWidth', 'min-width'], ['minHeight', 'min-height']]) {
          if (layout.ignore?.[field]) {
            note(id, field, 'derived', layout.ignore[field]);
            continue;
          }
          const measuredSize = value(id, longhand);
          if (measuredSize.kind === 'literal' && measuredSize.value === '100%' && parentLayout) {
            node.layout[field === 'width' ? 'fillWidth' : 'fillHeight'] = true;
            continue;
          }
          // A fluid root has no container in Figma; it gets the anatomy's fixed
          // preview width, never a measured one, which depends on text shaping.
          if (measuredSize.kind === 'literal' && measuredSize.value === '100%' && field === 'width') {
            if (!layout.previewWidth) throw new Error(`MUXUI_FIGMA_COMPONENTS_FLUID_WIDTH: ${anatomy.family} ${id} fills its container; declare layout.previewWidth in the anatomy`);
            note(id, field, 'literal', 'CSS fills its container at 100% width; Figma uses the anatomy\'s fixed preview width.', `${layout.previewWidth}px`);
            node.width = { value: layout.previewWidth };
            continue;
          }
          const resolvedSize = number(id, field, measuredSize);
          const added = contentBox && resolvedSize && 'value' in resolvedSize && resolvedSize.value ? extra(/width/iu.test(field) ? 'width' : 'height') : 0;
          if (added) {
            note(id, field, 'derived', 'CSS sizes the content box; Figma sizes the frame, so the border and padding are added.', `+${round(added)}px`);
            resolvedSize.value = round(resolvedSize.value + added);
          }
          if (resolvedSize && !('value' in resolvedSize && resolvedSize.value === 0)) node[field] = resolvedSize;
        }
      }
      let rings;
      if (has('shadow')) {
        const effects = shadow(id, value(id, 'box-shadow'));
        rings = ringsFor(id, node, effects);
        if (effects && !rings) node.effects = effects;
      }
      const kids = [];
      overlays.forEach((overlay, index) => {
        kids.push({
          part: `${id}-overlay${index ? `-${index + 1}` : ''}`,
          type: 'FRAME',
          name: 'overlay',
          layout: { mode: 'NONE', positioning: 'ABSOLUTE', placement: 'fill' },
          fills: [{ token: overlay.token }],
          opacity: { value: overlay.opacity },
          ...(node.radius ? { radius: node.radius } : {}),
          ...(node.radii ? { radii: node.radii } : {}),
        });
        note(id, 'overlay', 'derived', overlay.mixed
          ? `color-mix(token ${round(overlay.opacity * 100)}%, transparent) becomes an overlay layer at that opacity with the token bound.`
          : 'A single-colour background image becomes an overlay layer with the token bound.');
      });
      for (const child of children(id)) {
        if (child.when && !child.when(variant)) continue;
        kids.push(build(child, node.layout));
      }
      if (rings) kids.push(...rings);
      if (kids.length) node.children = kids;
      return node;
    };

    const rowKey = JSON.stringify(axes.map(({ prop }) => variant.axes[prop]));
    if (!rowKeys.includes(rowKey)) rowKeys.push(rowKey);
    const column = selections.indexOf(variant.selection) * anatomy.states.length + stateIndex.get(variant.state);
    return {
      id: `component:${anatomy.family}/${variant.key}`,
      key: variant.key,
      name: variant.name,
      grid: [rowKeys.indexOf(rowKey), column],
      node: build(anatomy.parts[0], null),
    };
  });

  return {
    family: {
      id: `component-set:${anatomy.family}`,
      family: anatomy.family,
      name: anatomy.name,
      properties: [
        ...axes.map(({ name, values }) => ({ name, values })),
        ...(anatomy.selection ? [{ name: anatomy.selection.name, values: selections }] : []),
        { name: 'State', values: anatomy.states },
      ],
      variants: compiled,
      preview: (anatomy.preview ?? []).map((key) => {
        const match = compiled.find((variant) => variant.key === key);
        if (!match) throw new Error(`MUXUI_FIGMA_COMPONENTS_PREVIEW: ${anatomy.family} preview names ${key}, which is not a variant`);
        return match.id;
      }),
    },
    coverage: summarizeCoverage(coverage),
  };
}

// Count every field by status and keep one entry per distinct exception.
function summarizeCoverage(entries) {
  const counts = { bound: 0, literal: 0, derived: 0, lossy: 0, unbound: 0 };
  const exceptions = new Map();
  for (const entry of entries) {
    counts[entry.status] += 1;
    if (entry.status === 'bound') continue;
    const key = JSON.stringify([entry.part, entry.field, entry.status, entry.value ?? null, entry.reason]);
    const existing = exceptions.get(key);
    if (existing) existing.count += 1;
    else exceptions.set(key, { part: entry.part, field: entry.field, status: entry.status, ...(entry.value === undefined ? {} : { value: entry.value }), reason: entry.reason, count: 1 });
  }
  const sortKey = (entry) => JSON.stringify([entry.part, entry.field, entry.status, entry.value ?? '', entry.reason]);
  const sorted = [...exceptions.values()].sort((left, right) => (sortKey(left) < sortKey(right) ? -1 : 1));
  return { ...counts, exceptions: sorted };
}

/**
 * Compile the component spec for resolved anatomies and their measurements.
 * Throws when a family's measurements are missing or a binding has the wrong type.
 */
export function compileComponentSpec({ resolvedFamilies, measurements, source }) {
  const tokens = tokenContext(source);
  const byFamily = new Map(measurements.map((measurement) => [measurement.family, measurement]));
  const families = [];
  const coverage = {};
  const glyphs = new Map();
  for (const resolved of resolvedFamilies) {
    const measurement = byFamily.get(resolved.anatomy.family);
    if (!measurement) throw new Error(`MUXUI_FIGMA_COMPONENTS_MEASUREMENT_MISSING: ${resolved.anatomy.family}`);
    const compiled = compileFamily(resolved, measurement, tokens);
    families.push(compiled.family);
    coverage[resolved.anatomy.family] = compiled.coverage;
    for (const [name, svg] of Object.entries(measurement.glyphs)) {
      if (glyphs.has(name) && glyphs.get(name) !== svg) throw new Error(`MUXUI_FIGMA_COMPONENTS_GLYPH_CONFLICT: ${name} renders differently in two families`);
      glyphs.set(name, svg);
    }
  }
  const body = {
    format: SPEC_FORMAT,
    provenance: {
      tokenExportDigest: tokens.exportDigest,
      tokenSourceDigest: tokens.graph.sourceRevision,
      defaultMode: DEFAULT_MODE,
      families: families.map(({ family }) => family),
    },
    glyphs: [...glyphs].sort(([left], [right]) => (left < right ? -1 : 1)).map(([name, svg]) => ({ id: `glyph:${name}`, name: `Glyph/${name}`, svg })),
    families,
    coverage,
  };
  return { ...body, provenance: { ...body.provenance, specDigest: canonicalDigest(body) } };
}

/** Painted colours that are not bound to a variable or style and have no documented reason. */
export function bindingCoverageErrors(spec) {
  return Object.entries(spec.coverage).flatMap(([family, { exceptions }]) => exceptions
    .filter(({ status }) => status === 'unbound')
    .map((exception) => ({ family, ...exception })));
}
