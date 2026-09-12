import { compilePureTokenGraph } from '@muxui/tokens/core';
import defaultTheme from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { create } from 'storybook/theming';

const COLOR_SCHEMES = Object.freeze(['light', 'dark']);

const graphs = Object.freeze(Object.fromEntries(
  COLOR_SCHEMES.map((colorScheme) => [
    colorScheme,
    compilePureTokenGraph(defaultTheme, { modes: { colorScheme } }),
  ]),
));

function tokenValue(colorScheme, tokenId) {
  const token = graphs[colorScheme].tokens[tokenId];
  if (!token) throw new Error(`Mux UI Storybook theme token is missing: ${tokenId}`);
  return token.value;
}

function paletteFor(colorScheme) {
  return Object.freeze({
    appBg: tokenValue(colorScheme, 'semantic.surface.body-background'),
    appContentBg: tokenValue(colorScheme, 'semantic.surface.canvas'),
    appPreviewBg: tokenValue(colorScheme, 'semantic.surface.canvas'),
    appBorderColor: tokenValue(colorScheme, 'semantic.border.subtle'),
    appBorderRadius: tokenValue(colorScheme, 'semantic.shape.container-radius'),
    barBg: tokenValue(colorScheme, 'semantic.surface.body-background'),
    barTextColor: tokenValue(colorScheme, 'semantic.content.muted'),
    barHoverColor: tokenValue(colorScheme, 'semantic.action.background'),
    barSelectedColor: tokenValue(colorScheme, 'semantic.action.background'),
    textColor: tokenValue(colorScheme, 'semantic.content.strong'),
    textInverseColor: tokenValue(colorScheme, 'semantic.content.inverse'),
    textMutedColor: tokenValue(colorScheme, 'semantic.content.muted'),
    buttonBg: tokenValue(colorScheme, 'semantic.surface.body-background'),
    buttonBorder: tokenValue(colorScheme, 'semantic.border.default'),
    booleanBg: tokenValue(colorScheme, 'semantic.surface.hover'),
    booleanSelectedBg: tokenValue(colorScheme, 'semantic.surface.canvas'),
    inputBg: tokenValue(colorScheme, 'semantic.surface.canvas'),
    inputBorder: tokenValue(colorScheme, 'semantic.border.default'),
    inputTextColor: tokenValue(colorScheme, 'semantic.content.strong'),
    inputBorderRadius: tokenValue(colorScheme, 'semantic.shape.option-radius'),
    colorPrimary: tokenValue(colorScheme, 'semantic.action.background'),
    colorSecondary: tokenValue(colorScheme, 'semantic.action.background'),
    fontBase: tokenValue(colorScheme, 'reference.typography.text-font-family'),
    fontCode: tokenValue(colorScheme, 'reference.typography.mono-font-family'),
  });
}

export function buildTheme(colorScheme) {
  if (!COLOR_SCHEMES.includes(colorScheme)) {
    throw new TypeError(`Mux UI Storybook color scheme is invalid: ${colorScheme}`);
  }
  return create({
    base: colorScheme,
    ...paletteFor(colorScheme),
    brandTitle: 'Mux UI',
  });
}
