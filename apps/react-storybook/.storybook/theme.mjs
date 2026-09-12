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

const PREVIEW_TOKEN_IDS = Object.freeze({
  actionBackground: 'semantic.action.background',
  actionForeground: 'semantic.action.foreground',
  borderSubtle: 'semantic.border.subtle',
  contentStrong: 'semantic.content.strong',
  surfaceCanvas: 'semantic.surface.canvas',
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
  --listbox-item-muted-color: var(--muxui-storybook-content-muted);
  --tree-node-background-hover: var(--muxui-storybook-surface-hover);
  background: var(--muxui-storybook-surface-body-background);
  color: var(--muxui-storybook-content-strong);
  border-color: var(--muxui-storybook-border-subtle);
}

#storybook-sidebar-region .sidebar-item[data-ref-id='storybook_internal'][data-nodetype] {
  color: var(--muxui-storybook-content-strong);
}

#storybook-sidebar-region .sidebar-item[data-ref-id='storybook_internal'][data-nodetype]:hover,
#storybook-sidebar-region .sidebar-item[data-ref-id='storybook_internal'][data-nodetype]:focus-within {
  background: var(--muxui-storybook-surface-hover);
}

#storybook-sidebar-region .sidebar-item[data-ref-id='storybook_internal'][data-nodetype] svg[type] {
  color: var(--muxui-storybook-content-link);
}

#storybook-sidebar-region [data-testid='context-menu'] {
  background: var(--muxui-storybook-surface-hover);
  border-color: var(--muxui-storybook-action-background);
  box-shadow: 0 0 5px 5px var(--muxui-storybook-surface-hover);
  color: var(--muxui-storybook-action-background);
}

#storybook-sidebar-region [data-testid='context-menu']:hover,
#storybook-sidebar-region [data-testid='context-menu']:focus-visible {
  background: var(--muxui-storybook-surface-hover);
  color: var(--muxui-storybook-action-background);
}

#storybook-sidebar-region [data-selected='true'] [data-testid='context-menu'] {
  background: var(--muxui-storybook-action-background);
  border-color: var(--muxui-storybook-action-background);
  box-shadow: 0 0 5px 5px var(--muxui-storybook-action-background);
  color: var(--muxui-storybook-action-foreground);
}

#storybook-sidebar-region [aria-label='Open onboarding guide'] svg path {
  fill: var(--muxui-storybook-content-muted);
}

#storybook-sidebar-region button[role='switch'][aria-label='Settings']::after {
  background: var(--muxui-storybook-status-success);
  border-color: var(--muxui-storybook-border-default);
}

#storybook-sidebar-region .sidebar-item[data-ref-id='storybook_internal'][data-nodetype][data-selected='true'],
#storybook-sidebar-region .sidebar-item[data-ref-id='storybook_internal'][data-nodetype][data-selected='true']:hover,
#storybook-sidebar-region .sidebar-item[data-ref-id='storybook_internal'][data-nodetype][data-selected='true']:focus-within {
  background: var(--muxui-storybook-action-background);
  color: var(--muxui-storybook-action-foreground);
}

#storybook-sidebar-region .sidebar-item[data-ref-id='storybook_internal'][data-nodetype][data-selected='true'] svg[type] {
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

#storybook-sidebar-region input[type='checkbox'],
#storybook-sidebar-region input[type='radio'],
#storybook-sidebar-region input[type='range'],
#storybook-panel-region input[type='checkbox'],
#storybook-panel-region input[type='radio'],
#storybook-panel-region input[type='range'] {
  accent-color: var(--muxui-storybook-action-background);
}

#storybook-sidebar-region [role='combobox'] code,
#storybook-sidebar-region [role='combobox'] code span {
  color: var(--muxui-storybook-content-muted);
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

[data-testid='sb-preview-toolbar'] [aria-label^='Choose the Mux UI light or dark theme.'],
[data-testid='sb-preview-toolbar'] [aria-label^='Choose the document writing direction.'] {
  background: var(--muxui-storybook-surface-hover);
  color: var(--muxui-storybook-action-background);
}

#storybook-sidebar-region ::selection,
#storybook-panel-region ::selection,
[data-testid='sb-preview-toolbar'] ::selection {
  background: var(--muxui-storybook-action-background);
  color: var(--muxui-storybook-action-foreground);
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

/* React Aria portals context menus outside the sidebar and panel regions. */
.react-aria-Popover[role='dialog'],
.react-aria-Popover[role='dialog'] .sb-list,
body > [role='menu'],
body > [role='listbox'] {
  background: var(--muxui-storybook-surface-canvas);
  color: var(--muxui-storybook-content-strong);
  border-color: var(--muxui-storybook-border-default);
}

.react-aria-Popover[role='dialog'] .sb-list button,
body > [role='menu'] [role='menuitem'],
body > [role='listbox'] [role='option'] {
  color: var(--muxui-storybook-content-strong);
}

.react-aria-Popover[role='dialog'] .sb-list button:hover,
.react-aria-Popover[role='dialog'] .sb-list button:focus-visible,
body > [role='menu'] [role='menuitem']:hover,
body > [role='listbox'] [role='option']:hover {
  background: var(--muxui-storybook-surface-hover);
  color: var(--muxui-storybook-content-strong);
}

.react-aria-Popover[role='dialog'] .sb-list button:focus-visible,
body > [role='menu'] [role='menuitem']:focus-visible,
body > [role='listbox'] [role='option']:focus-visible {
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

#storybook-panel-region [role='tab'][data-key='addon-controls'] > div > div,
#storybook-panel-region [role='tab'][data-key='violations'] > div > div {
  background: var(--muxui-storybook-surface-hover);
  border: 1px solid var(--muxui-storybook-action-background);
  box-shadow: none;
  color: var(--muxui-storybook-action-background);
}

#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] input,
#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] select,
#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] textarea {
  background: var(--muxui-storybook-surface-canvas);
  border-color: var(--muxui-storybook-border-default);
  color: var(--muxui-storybook-content-strong);
}

#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] input:hover,
#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] select:hover,
#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] textarea:hover {
  border-color: var(--muxui-storybook-action-background);
}

#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] input:focus-visible,
#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] select:focus-visible,
#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] textarea:focus-visible {
  outline: 2px solid var(--muxui-storybook-action-background);
  outline-offset: 1px;
}

#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] input:disabled,
#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] select:disabled,
#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] textarea:disabled {
  background: var(--muxui-storybook-surface-body-background);
  border-color: var(--muxui-storybook-border-subtle);
  color: var(--muxui-storybook-content-muted);
}

#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] label[aria-disabled='false'] > span[aria-hidden='true'] {
  color: var(--muxui-storybook-content-strong);
}

#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] label[aria-disabled='true'] > span[aria-hidden='true'] {
  color: var(--muxui-storybook-content-muted);
}

#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] tr > td:nth-child(2) > div:nth-child(2) > div > span,
#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] tr > td:nth-child(3) > div > span {
  background: var(--muxui-storybook-surface-hover);
  border: 1px solid var(--muxui-storybook-border-subtle);
  color: var(--muxui-storybook-content-strong);
}

[data-testid='tooltip'].react-aria-Tooltip,
[data-testid='tooltip'].react-aria-Tooltip > * {
  background: var(--muxui-storybook-surface-canvas);
  border: 1px solid var(--muxui-storybook-border-default);
  box-shadow: 0 0 0 1px var(--muxui-storybook-border-subtle);
  color: var(--muxui-storybook-content-strong);
}

/* The manager owns the docs wrapper; iframe content keeps its own scoped CSS. */
#storybook-preview-iframe {
  background: var(--muxui-storybook-surface-canvas);
}
`;
}

export function previewThemeCss() {
  const tokens = COLOR_SCHEMES.map((colorScheme) => {
    const selector = colorScheme === 'light' ? ':root' : ":root[data-muxui-color-scheme='dark']";
    const declarations = Object.entries(PREVIEW_TOKEN_IDS)
      .map(([name, tokenId]) => `  --muxui-semantic-${name.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}: ${tokenValue(colorScheme, tokenId)};`)
      .join('\n');
    return `${selector} {\n${declarations}\n}`;
  }).join('\n');
  return `${tokens}

.sb-preparing-story,
.sb-preparing-docs {
  background-color: var(--muxui-semantic-surface-canvas);
  color: var(--muxui-semantic-content-strong);
}

.sb-loader {
  border-color: var(--muxui-semantic-border-subtle);
  border-top-color: var(--muxui-semantic-action-background);
}`;
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
