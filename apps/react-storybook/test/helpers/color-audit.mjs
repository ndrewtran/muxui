/** Runs in the browser. Audits authored paint values, not antialiased pixels. */
export function collectStorybookPaints({ tokens, scope = 'manager', canvasPaints = [] }) {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none';
  document.body.append(probe);
  const problems = [];
  const paints = new Map();
  const media = new Set();
  const canonical = new Map();
  const effects = new Map();
  const tokensById = new Map(Object.values(tokens).map((token) => [token.id, token]));
  // These exact Mux parts paint user-selected colors. Only their listed paint
  // properties may be dynamic; descendants and ordinary component chrome stay audited.
  const dynamicColorParts = [
    ['.muxui-color-area[data-muxui-color-paint="area"]', ['background-color', 'background-image']],
    ['.muxui-color-area-thumb[data-muxui-color-paint="sample"]', ['background-color']],
    ['.muxui-color-slider-track[data-muxui-color-paint="track"]', ['background-image']],
    ['.muxui-color-slider-thumb-face[data-muxui-color-paint="sample"]', ['background-color']],
    ['.muxui-color-wheel-track[data-muxui-color-paint="track"]', ['background-image']],
    ['.muxui-color-wheel-thumb-face[data-muxui-color-paint="sample"]', ['background-color']],
    ['.muxui-color-swatch[data-muxui-color-paint="sample"]', ['background-color', 'background-image']],
  ];

  function ownsDynamicColorPaint(element, pseudo, property) {
    return !pseudo && dynamicColorParts.some(([selector, properties]) => (
      properties.includes(property) && element.matches(selector)
    ));
  }

  function ownsColorAreaBlend(element, pseudo, value) {
    return !pseudo
      && element.matches('.muxui-color-area[data-muxui-color-paint="area"]')
      && value.split(',').every((mode) => mode.trim() === 'screen');
  }

  function normalize(value) {
    if (!CSS.supports('color', value)) throw new Error(`Invalid colour: ${value}`);
    probe.style.setProperty('color', value, 'important');
    let computed = getComputedStyle(probe).color;
    if (!/^rgba?\(/u.test(computed) && !/^color\(srgb /u.test(computed)) {
      probe.style.setProperty('color', `rgb(from ${value} r g b / alpha)`, 'important');
      computed = getComputedStyle(probe).color;
    }
    const rgb = computed.match(/^rgba?\(([^)]+)\)$/u);
    const srgb = computed.match(/^color\(srgb ([^)]+)\)$/u);
    if (!rgb && !srgb) throw new Error(`Unsupported computed colour: ${computed}`);
    const channels = (rgb ?? srgb)[1].split(/[\s,/]+/u).filter(Boolean).map(Number);
    if (channels.some((channel) => !Number.isFinite(channel))) throw new Error(`Invalid colour channels: ${computed}`);
    const [r, g, b, alpha = 1] = channels;
    return [r, g, b].map((channel) => Math.round(channel * (srgb ? 255 : 1) * 10000) / 10000)
      .concat(Math.round(alpha * 10000) / 10000).join(',');
  }

  function tokenColorExpression(token, seen = new Set()) {
    if (!token.mix) return token.value;
    if (seen.has(token.id)) throw new Error(`Cyclic token colour mix: ${token.id}`);
    const source = tokensById.get(token.mix.token);
    if (!source) throw new Error(`Missing token colour mix source: ${token.mix.token}`);
    const next = new Set(seen).add(token.id);
    return `color-mix(in ${token.mix.space}, ${tokenColorExpression(source, next)} ${token.mix.weight * 100}%, ${token.mix.color})`;
  }

  function applyAlpha(key, alpha) {
    if (alpha === 1) return key;
    const channels = key.split(',').map(Number);
    const combinedAlpha = channels[3] * alpha;
    // Match CSSOM's computed-color serialization, including its alpha quantization.
    return normalize(`rgba(${channels.slice(0, 3).join(' ')} / ${combinedAlpha})`);
  }

  for (const token of Object.values(tokens)) {
    if (token.type === 'color') {
      canonical.set(normalize(token.value), token.id);
      // The token CSS generator emits mix tokens as color-mix(), which keeps
      // fractional channels that the compiled hex token value rounds away.
      if (token.mix) canonical.set(normalize(tokenColorExpression(token)), token.id);
    }
    if (token.type === 'effect' && token.value?.kind === 'shadow') {
      for (const layer of token.value.layers) {
        effects.set(applyAlpha(normalize(layer.color.value), layer.color.alpha ?? 1), token.id);
      }
    }
  }

  // The authored 30% neutral focus glow is a canonical shadow effect, not a palette color.
  for (const tokenId of ['semantic.focus.neutral-glow', 'semantic.color.neutral-60']) {
    const token = tokens[tokenId];
    if (token?.type === 'color') {
      effects.set(normalize(`color-mix(in srgb, ${token.value} 30%, transparent)`), token.id);
    }
  }

  function describe(element, pseudo) {
    const owner = element.parentElement?.closest('[aria-label],[data-testid],[role], [id]');
    return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`
      + `${element.localName === 'use' ? `[href="${element.getAttribute('href') ?? element.getAttribute('xlink:href')}"]` : ''}`
      + `${element.getAttribute('data-testid') ? `[data-testid="${element.getAttribute('data-testid')}"]` : ''}`
      + `${element.getAttribute('aria-label') ? `[aria-label="${element.getAttribute('aria-label')}"]` : ''}`
      + `${pseudo} ${element.textContent?.trim().replace(/\s+/gu, ' ').slice(0,60) ?? ''}`
      + `${owner ? ` (in ${owner.tagName.toLowerCase()}#${owner.id} ${owner.getAttribute('aria-label') ?? owner.getAttribute('role') ?? owner.getAttribute('data-testid') ?? ''})` : ''}`;
  }

  function add(element, pseudo, property, value, alpha = 1) {
    if (value === 'none' || value === 'auto') return;
    if (ownsDynamicColorPaint(element, pseudo, property)) return;
    let key;
    try {
      key = applyAlpha(normalize(value), alpha);
    }
    catch (error) {
      problems.push({ element: describe(element, pseudo), property, value, reason: error.message });
      return;
    }
    if (key.endsWith(',0')) return;
    const token = canonical.get(key) ?? (/shadow/iu.test(property) ? effects.get(key) : undefined);
    const id = `${property}|${key}`;
    const paint = paints.get(id) ?? { property, value, rgba: key, token, count: 0, examples: [] };
    paint.count += 1;
    if (paint.examples.length < 3) paint.examples.push(describe(element, pseudo));
    paints.set(id, paint);
  }

  function compound(element, pseudo, property, value, alpha = 1) {
    if (value === 'none') return;
    // Computed gradients and shadows serialize their colour stops as functions.
    const start = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/gu;
    let found = 0;
    for (let match; (match = start.exec(value));) {
      let depth = 1;
      let end = start.lastIndex;
      while (end < value.length && depth > 0) {
        if (value[end] === '(') depth += 1;
        if (value[end] === ')') depth -= 1;
        end += 1;
      }
      add(element, pseudo, property, value.slice(match.index, end), alpha);
      found += 1;
      start.lastIndex = end;
    }
    if (/url\(/u.test(value)) media.add(value);
    if (!found && !/url\(/u.test(value)) {
      problems.push({ element: describe(element, pseudo), property, value, reason: 'Unparsed paint expression' });
    }
  }

  function filter(element, pseudo, property, value) {
    if (value === 'none') return;
    if (/drop-shadow\(/u.test(value)) compound(element, pseudo, `${property}-shadow`, value);
    // Blur moves existing paint; other filters manufacture new colours.
    if (/\b(?:brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia|url)\(/u.test(value)) {
      problems.push({ element: describe(element, pseudo), property, value, reason: 'Colour-transforming filter requires a token-owned effect' });
    }
  }

  function svgPaint(element, property, value, alpha = 1, seen = new Set()) {
    const reference = value.match(/^url\(["']?([^"')]+)["']?\)/u);
    if (!reference) { add(element, '', property, value, alpha); return; }
    const id = reference[1].split('#')[1];
    const server = id && document.getElementById(id);
    if (!server || seen.has(server)) {
      problems.push({ element: describe(element, ''), property, value, reason: 'Unresolved or cyclic SVG paint server' });
      return;
    }
    seen.add(server);
    if (server.matches('linearGradient,radialGradient')) {
      const stops = server.querySelectorAll('stop');
      if (!stops.length) {
        const href = server.getAttribute('href') ?? server.getAttribute('xlink:href');
        if (href) svgPaint(element, property, `url(${href})`, alpha, seen);
        else problems.push({ element: describe(element, ''), property, value, reason: 'SVG gradient has no resolvable stops' });
      }
      for (const stop of stops) {
        const style = getComputedStyle(stop);
        add(element, '', `${property}-stop-color`, style.stopColor, alpha * Number(style.stopOpacity));
      }
    } else {
      problems.push({ element: describe(element, ''), property, value, reason: `Unsupported SVG paint server: ${server.localName}` });
    }
  }

  function visible(element) {
    if (element === probe || element.closest('script,style,template,defs,symbol,clipPath,mask')) return false;
    if (scope === 'docs' && element.closest('.muxui-storybook-surface')) return false;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      if (style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)') return false;
    }
    return true;
  }

  function hasVerifiedTransparentPixel(element) {
    if (element.localName !== 'img' || !element.complete || element.naturalWidth !== 1 || element.naturalHeight !== 1) return false;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return false;
      context.drawImage(element, 0, 0);
      return context.getImageData(0, 0, 1, 1).data[3] === 0;
    } catch {
      return false;
    }
  }

  let elements = 0;
  function inspect(element, pseudo = '') {
    const style = getComputedStyle(element, pseudo);
    if (pseudo && (style.content === 'none' || style.content === 'normal' || style.display === 'none')) return;
    const text = pseudo ? style.content.replace(/^["']|["']$/gu, '').trim() && !style.content.startsWith('url(')
      : [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
    if (text || element.matches('input,textarea,select')) {
      add(element, pseudo, 'color', style.color);
      if (style.textDecorationLine !== 'none') add(element, pseudo, 'text-decoration-color', style.textDecorationColor);
      compound(element, pseudo, 'text-shadow', style.textShadow);
      add(element, pseudo, '-webkit-text-fill-color', style.webkitTextFillColor);
      if (parseFloat(style.webkitTextStrokeWidth)) add(element, pseudo, '-webkit-text-stroke-color', style.webkitTextStrokeColor);
    }
    add(element, pseudo, 'background-color', style.backgroundColor);
    compound(element, pseudo, 'background-image', style.backgroundImage);
    if (style.borderImageSource !== 'none') compound(element, pseudo, 'border-image-source', style.borderImageSource);
    if (style.listStyleImage !== 'none') media.add(style.listStyleImage);
    compound(element, pseudo, 'box-shadow', style.boxShadow);
    if (!pseudo && style.scrollbarColor !== 'auto'
      && (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)) {
      compound(element, '', 'scrollbar-color', style.scrollbarColor);
    }
    filter(element, pseudo, 'filter', style.filter);
    filter(element, pseudo, 'backdrop-filter', style.backdropFilter);
    for (const property of ['mix-blend-mode', 'background-blend-mode']) {
      const value = style.getPropertyValue(property);
      if (value.split(',').some((mode) => mode.trim() !== 'normal')
        && !(property === 'background-blend-mode' && ownsColorAreaBlend(element, pseudo, value))) {
        problems.push({ element: describe(element, pseudo), property, value, reason: 'Blending manufactures colours outside token paint values' });
      }
    }
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parseFloat(style[`border${side}Width`]) > 0 && !['none', 'hidden'].includes(style[`border${side}Style`])) {
        add(element, pseudo, `border-${side.toLowerCase()}-color`, style[`border${side}Color`]);
      }
    }
    if (parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== 'none') add(element, pseudo, 'outline-color', style.outlineColor);
    if (element.matches('input,textarea') && element === document.activeElement) add(element, pseudo, 'caret-color', style.caretColor);
    if (element.matches('input[type=checkbox],input[type=radio],input[type=range]') && style.appearance !== 'none') {
      if (style.accentColor === 'auto') problems.push({ element: describe(element, pseudo), property: 'accent-color', value: 'auto', reason: 'Native control has no authored accent colour' });
      else add(element, pseudo, 'accent-color', style.accentColor);
    }
    // SVG wrappers have unused default black fills. Only geometry paints them.
    if (!pseudo && element.matches('path,circle,ellipse,rect,line,polyline,polygon,text')) {
      if (style.fill !== 'none' && style.fillOpacity !== '0') svgPaint(element, 'fill', style.fill, Number(style.fillOpacity));
      if (style.stroke !== 'none' && style.strokeOpacity !== '0' && parseFloat(style.strokeWidth)) svgPaint(element, 'stroke', style.stroke, Number(style.strokeOpacity));
    }
    if (!pseudo && element.localName === 'use') {
      const href = element.getAttribute('href') ?? element.getAttribute('xlink:href');
      const target = href?.startsWith('#') ? document.getElementById(href.slice(1)) : null;
      if (!target) problems.push({ element: describe(element, ''), property: 'svg-use', value: href, reason: 'Unresolved SVG paint source' });
      else for (const shape of [target, ...target.querySelectorAll('path,circle,ellipse,rect,line,polyline,polygon,text')].filter((node) => node.matches('path,circle,ellipse,rect,line,polyline,polygon,text'))) {
        function inherited(property) {
          for (let ancestor = shape; ancestor; ancestor = ancestor.parentElement) {
            const value = ancestor.style.getPropertyValue(property) || ancestor.getAttribute(property);
            if (value) return value;
            if (ancestor === target) break;
          }
          return style.getPropertyValue(property);
        }
        for (const property of ['fill', 'stroke']) {
          const value = inherited(property);
          const opacity = Number(inherited(`${property}-opacity`));
          if (value === 'none' || opacity === 0 || (property === 'stroke' && !parseFloat(inherited('stroke-width')))) continue;
          svgPaint(element, property, value === 'currentColor' ? style.color : value, opacity);
        }
      }
    }
  }

  for (const element of [document.documentElement, document.body, ...document.body.querySelectorAll('*')]) {
    if (!visible(element)) continue;
    elements += 1;
    inspect(element);
    if (element.matches('img,video,object,embed,input[type="image"],svg image')) {
      if (!hasVerifiedTransparentPixel(element)) {
        media.add(`${element.localName}: ${element.currentSrc || element.src || element.data || element.getAttribute('href') || element.getAttribute('xlink:href') || '(unresolved source)'}`);
      }
    }
    if (element.localName === 'canvas') {
      const recorded = canvasPaints.filter((paint) => paint.id === element.id);
      if (!recorded.length) problems.push({ element: describe(element, ''), property: 'canvas', reason: 'Canvas drawing colours were not recorded' });
      for (const paint of recorded) {
        add(element, '', `canvas-${paint.property}`, paint.value, paint.alpha);
        if (paint.composite !== 'source-over') problems.push({ element: describe(element, ''), property: 'canvas-composite', value: paint.composite });
      }
    }
    inspect(element, '::before');
    inspect(element, '::after');
    if (element.matches('input[placeholder],textarea[placeholder]') && !element.value) {
      add(element, '::placeholder', 'color', getComputedStyle(element, '::placeholder').color);
    }
    if (getComputedStyle(element).display === 'list-item' && getComputedStyle(element).listStyleType !== 'none') {
      add(element, '::marker', 'color', getComputedStyle(element, '::marker').color);
    }
    const selection = document.getSelection();
    if (selection?.rangeCount && !selection.isCollapsed && selection.containsNode(element, true)
      && [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim())) {
      const style = getComputedStyle(element, '::selection');
      add(element, '::selection', 'color', style.color);
      add(element, '::selection', 'background-color', style.backgroundColor);
      compound(element, '::selection', 'text-shadow', style.textShadow);
    }
  }
  probe.remove();
  const values = [...paints.values()];
  return { elements, paintValues: values.length, paintOccurrences: values.reduce((sum, paint) => sum + paint.count, 0),
    nonToken: values.filter((paint) => !paint.token), problems, media: [...media], paints: values };
}
