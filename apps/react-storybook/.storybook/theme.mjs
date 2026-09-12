import { compilePureTokenGraph } from '@muxui/tokens/core';
import defaultTheme from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { create } from 'storybook/theming';

const COLOR_SCHEMES = Object.freeze(['light', 'dark']);

const MANAGER_TOKEN_IDS = Object.freeze({
  actionBackground: 'semantic.action.background',
  actionForeground: 'semantic.action.foreground',
  borderDefault: 'semantic.border.default',
  borderSubtle: 'semantic.border.subtle',
  contentLink: 'semantic.content.link',
  contentMuted: 'semantic.content.muted',
  contentOnSolid: 'semantic.content.on-solid',
  contentStrong: 'semantic.content.strong',
  surfaceBodyBackground: 'semantic.surface.body-background',
  surfaceCanvas: 'semantic.surface.canvas',
  surfaceHover: 'semantic.surface.hover',
  statusDanger: 'semantic.action.danger-background',
  statusSuccess: 'semantic.status.success',
  statusWarning: 'semantic.status.warning',
});

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

function managerTokensFor(colorScheme) {
  return Object.freeze(Object.fromEntries(
    Object.entries(MANAGER_TOKEN_IDS).map(([name, tokenId]) => [name, tokenValue(colorScheme, tokenId)]),
  ));
}

export function managerThemeCss() {
  const declarations = COLOR_SCHEMES.map((colorScheme) => {
    const selector = colorScheme === 'light' ? ':root' : ":root[data-muxui-color-scheme='dark']";
    const tokens = managerTokensFor(colorScheme);
    const variables = Object.entries(tokens)
      .map(([name, value]) => `  --muxui-storybook-${name.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}: ${value};`)
      .join('\n');
    return `${selector} {\n${variables}\n}`;
  }).join('\n');

  return `${declarations}

/* Storybook's manager palette is not exposed through ThemeVars. Keep its
   internal chrome on the same canonical Mux UI surfaces as the public theme. */
#storybook-sidebar-region,
#storybook-sidebar-region #storybook-explorer-tree,
#storybook-panel-region,
[data-testid='sb-preview-toolbar'] {
  background: var(--muxui-storybook-surface-body-background);
  color: var(--muxui-storybook-content-strong);
  border-color: var(--muxui-storybook-border-subtle);
}

#storybook-sidebar-region [data-ref-id='storybook_internal'] .sidebar-item[data-nodetype] {
  color: var(--muxui-storybook-content-strong);
}

#storybook-sidebar-region [data-ref-id='storybook_internal'] .sidebar-item[data-nodetype]:hover,
#storybook-sidebar-region [data-ref-id='storybook_internal'] .sidebar-item[data-nodetype]:focus-within {
  background: var(--muxui-storybook-surface-hover);
}

#storybook-sidebar-region [data-ref-id='storybook_internal'] .sidebar-item[data-nodetype] svg[type] {
  color: var(--muxui-storybook-content-link);
}

#storybook-sidebar-region [data-ref-id='storybook_internal'] .sidebar-item[data-nodetype][data-selected='true'],
#storybook-sidebar-region [data-ref-id='storybook_internal'] .sidebar-item[data-nodetype][data-selected='true']:hover,
#storybook-sidebar-region [data-ref-id='storybook_internal'] .sidebar-item[data-nodetype][data-selected='true']:focus-within {
  background: var(--muxui-storybook-action-background);
  color: var(--muxui-storybook-action-foreground);
}

#storybook-sidebar-region [data-ref-id='storybook_internal'] .sidebar-item[data-nodetype][data-selected='true'] svg[type] {
  color: var(--muxui-storybook-action-foreground);
}

#storybook-sidebar-region #storybook-explorer-searchfield {
  background: var(--muxui-storybook-surface-canvas);
  color: var(--muxui-storybook-content-strong);
  border-color: var(--muxui-storybook-border-default);
}

#storybook-sidebar-region #storybook-explorer-searchfield::placeholder {
  color: var(--muxui-storybook-content-muted);
}

#storybook-sidebar-region #storybook-explorer-searchfield:focus-visible {
  outline: 2px solid var(--muxui-storybook-action-background);
  outline-offset: 2px;
}

#storybook-sidebar-region [role='search'],
#storybook-sidebar-region [role='combobox'] {
  border-color: var(--muxui-storybook-border-default);
}

[data-testid='sb-preview-toolbar'] button,
[data-testid='sb-preview-toolbar'] [role='button'],
[data-testid='sb-preview-toolbar'] [role='switch'] {
  color: var(--muxui-storybook-content-muted);
}

[data-testid='sb-preview-toolbar'] button:hover,
[data-testid='sb-preview-toolbar'] [role='button']:hover,
[data-testid='sb-preview-toolbar'] [role='switch']:hover {
  color: var(--muxui-storybook-action-background);
  background: var(--muxui-storybook-surface-hover);
}

[data-testid='sb-preview-toolbar'] button:focus-visible,
[data-testid='sb-preview-toolbar'] [role='button']:focus-visible,
[data-testid='sb-preview-toolbar'] [role='switch']:focus-visible {
  outline: 2px solid var(--muxui-storybook-action-background);
  outline-offset: 2px;
}

#storybook-sidebar-region [aria-label='Story status: Pass'],
#storybook-panel-region [aria-label='Story status: Pass'] {
  background: var(--muxui-storybook-status-success);
  color: var(--muxui-storybook-content-on-solid);
}

#storybook-sidebar-region [aria-label='Story status: Fail'],
#storybook-sidebar-region [aria-label='Story status: Bail'],
#storybook-panel-region [aria-label='Story status: Fail'],
#storybook-panel-region [aria-label='Story status: Bail'] {
  background: var(--muxui-storybook-status-danger);
  color: var(--muxui-storybook-content-on-solid);
}

#storybook-sidebar-region [aria-label='Story status: Wait'],
#storybook-sidebar-region [aria-label='Story status: Runs'],
#storybook-panel-region [aria-label='Story status: Wait'],
#storybook-panel-region [aria-label='Story status: Runs'] {
  background: var(--muxui-storybook-status-warning);
  color: var(--muxui-storybook-content-on-solid);
}

#storybook-sidebar-region [role='menu'],
#storybook-sidebar-region [role='listbox'],
#storybook-sidebar-region [role='dialog'],
#storybook-panel-region [role='menu'],
#storybook-panel-region [role='listbox'],
#storybook-panel-region [role='dialog'] {
  background: var(--muxui-storybook-surface-canvas);
  color: var(--muxui-storybook-content-strong);
  border-color: var(--muxui-storybook-border-default);
}

#storybook-sidebar-region [role='menuitem']:hover,
#storybook-sidebar-region [role='option']:hover,
#storybook-sidebar-region [role='menuitemcheckbox']:hover,
#storybook-panel-region [role='menuitem']:hover,
#storybook-panel-region [role='option']:hover,
#storybook-panel-region [role='menuitemcheckbox']:hover {
  background: var(--muxui-storybook-surface-hover);
  color: var(--muxui-storybook-content-strong);
}

#storybook-sidebar-region [role='menuitem']:focus-visible,
#storybook-sidebar-region [role='option']:focus-visible,
#storybook-panel-region [role='menuitem']:focus-visible,
#storybook-panel-region [role='option']:focus-visible {
  outline: 2px solid var(--muxui-storybook-action-background);
  outline-offset: -2px;
}

#storybook-panel-region [role='tablist'],
#storybook-panel-region [role='tabpanel'] {
  background: var(--muxui-storybook-surface-canvas);
  color: var(--muxui-storybook-content-strong);
  border-color: var(--muxui-storybook-border-subtle);
}

#storybook-panel-region [role='tab'] {
  color: var(--muxui-storybook-content-muted);
}

#storybook-panel-region [role='tab']:hover,
#storybook-panel-region [role='tab'][aria-selected='true'] {
  color: var(--muxui-storybook-action-background);
}

#storybook-panel-region [role='tab']:focus-visible {
  outline: 2px solid var(--muxui-storybook-action-background);
  outline-offset: -2px;
}

/* The manager owns the docs wrapper; iframe content keeps its own scoped CSS. */
#storybook-preview-iframe {
  background: var(--muxui-storybook-surface-canvas);
}
`;
}

function paletteFor(colorScheme) {
  return Object.freeze({
    appBg: tokenValue(colorScheme, 'semantic.surface.body-background'),
    appContentBg: tokenValue(colorScheme, 'semantic.surface.canvas'),
    appHoverBg: tokenValue(colorScheme, 'semantic.surface.hover'),
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
