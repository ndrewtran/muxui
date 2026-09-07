import { compilePureTokenGraph, cssName } from './core.mjs';

const TOKEN_ID = /^(reference|semantic|component)\.[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/u;

function namespaceFor(id, token) {
  const lowerId = id.toLowerCase();
  if (token.type === 'color') return 'color';
  if (token.type === 'duration') return 'transition-duration';
  if (token.type === 'effect') return 'shadow';
  if (token.type === 'dimension') {
    if (/radius/u.test(lowerId)) return 'radius';
    if (/font-size/u.test(lowerId) || (lowerId.includes('.typography.') && /(?:^|-)size$/u.test(lowerId)) || /\.dimension\.text-/u.test(lowerId)) return 'text';
    if (/line-height/u.test(lowerId)) return 'leading';
    if (/letter-spacing/u.test(lowerId)) return 'tracking';
    return 'spacing';
  }
  if (token.type === 'number') {
    if (/font-weight|(?:^|-)weight$/u.test(lowerId)) return 'font-weight';
    if (/line-height/u.test(lowerId)) return 'leading';
  }
  if (token.type === 'string') {
    if (/font-family|(?:^|-)font$/u.test(lowerId)) return 'font';
    if (/easing/u.test(lowerId)) return 'ease';
    if (/letter-spacing/u.test(lowerId)) return 'tracking';
  }
  return undefined;
}

function variableName(tokenId) {
  return tokenId.replaceAll('.', '-');
}

/**
 * Emit the optional Tailwind consumer layer. Tailwind remains a consumer
 * build dependency: Mux owns the values and this adapter only aliases them.
 */
export function compileTailwindTheme(source, { selector = '@theme inline' } = {}) {
  if (!source || typeof source !== 'object' || !source.tokens || typeof source.tokens !== 'object') throw new TypeError('MUXUI_TAILWIND_SOURCE_INVALID');
  if (selector !== '@theme inline') throw new TypeError('MUXUI_TAILWIND_SELECTOR_INVALID');
  for (const id of Object.keys(source.tokens)) if (!TOKEN_ID.test(id)) throw new TypeError('MUXUI_TAILWIND_TOKEN_ID_INVALID');
  compilePureTokenGraph(source);
  const lines = [];
  for (const [id, token] of Object.entries(source.tokens).sort(([left], [right]) => left.localeCompare(right))) {
    const namespace = namespaceFor(id, token);
    if (!namespace) continue;
    lines.push(`  --${namespace}-muxui-${variableName(id)}: var(${cssName(id)});`);
  }
  return `${selector} {\n${lines.join('\n')}\n}`;
}

export function compileTailwindConsumer(source, { muxuiCss = '' } = {}) {
  if (typeof muxuiCss !== 'string') throw new TypeError('MUXUI_TAILWIND_CSS_INVALID');
  return `${muxuiCss}\n\n${compileTailwindTheme(source)}`;
}
