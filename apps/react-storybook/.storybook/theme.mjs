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
  focusRing: 'semantic.focus.ring',
  surfaceBodyBackground: 'semantic.surface.body-background',
  surfaceCanvas: 'semantic.surface.canvas',
  surfaceHover: 'semantic.surface.hover',
  statusDanger: 'semantic.action.danger-background',
  statusSuccess: 'semantic.status.success',
  statusWarning: 'semantic.status.warning',
  visionRed: 'reference.color.error-60',
  visionOrange: 'reference.color.orange-60',
  visionYellow: 'reference.color.yellow-60',
  visionGreen: 'reference.color.green-60',
  visionBlue: 'reference.color.sky-60',
  visionPurple: 'reference.color.purple-60',
});

const PREVIEW_TOKEN_IDS = Object.freeze({
  actionBackground: 'semantic.action.background',
  actionDangerBackground: 'semantic.action.danger-background',
  actionForeground: 'semantic.action.foreground',
  borderDefault: 'semantic.border.default',
  borderSubtle: 'semantic.border.subtle',
  contentLink: 'semantic.content.link',
  contentLinkHover: 'semantic.content.link-hover',
  contentMuted: 'semantic.content.muted',
  contentStrong: 'semantic.content.strong',
  focusRing: 'semantic.focus.ring',
  surfaceBodyBackground: 'semantic.surface.body-background',
  surfaceCanvas: 'semantic.surface.canvas',
  surfaceHover: 'semantic.surface.hover',
  surfaceStrong: 'semantic.surface.strong',
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

html,
body,
#storybook-sidebar-region,
#storybook-panel-region,
#main-content-wrapper {
  scrollbar-color: var(--muxui-storybook-content-muted) var(--muxui-storybook-surface-body-background);
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

.search-result-item svg[type] {
  color: var(--muxui-storybook-content-link) !important;
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

#storybook-sidebar-region [data-selected='true'] [data-testid='context-menu'] svg path {
  fill: var(--muxui-storybook-action-foreground);
}

#storybook-sidebar-region [aria-label='Open onboarding guide'] svg path {
  fill: var(--muxui-storybook-content-muted);
}

#storybook-sidebar-region svg use,
#storybook-panel-region svg use,
[data-testid='sb-preview-toolbar'] svg use {
  fill: currentColor !important;
}

#storybook-sidebar-region button[role='switch'][aria-label='Settings']::after {
  background: var(--muxui-storybook-status-success);
  border-color: var(--muxui-storybook-border-default);
  box-shadow: none !important;
}

#storybook-sidebar-region button[role='switch'][aria-label='Settings'] {
  background: var(--muxui-storybook-surface-body-background) !important;
  color: var(--muxui-storybook-content-muted) !important;
  box-shadow: none !important;
}

#storybook-sidebar-region button[role='switch'][aria-label='Settings']:hover,
#storybook-sidebar-region button[role='switch'][aria-label='Settings']:focus-visible {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-action-background) !important;
}

#storybook-sidebar-region button[role='switch'][aria-label='Settings'][aria-checked='true'] {
  background: var(--muxui-storybook-action-background) !important;
  color: var(--muxui-storybook-action-foreground) !important;
}

#storybook-sidebar-region button[role='switch'][aria-label='Settings'] svg path,
#storybook-sidebar-region button[role='switch'][aria-label='Settings'] svg use {
  fill: currentColor !important;
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
  outline: 2px solid var(--muxui-storybook-focus-ring);
  outline-offset: 2px;
}

#storybook-sidebar-region #storybook-explorer-searchfield:focus {
  outline: 2px solid var(--muxui-storybook-focus-ring);
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
  color: var(--muxui-storybook-action-background) !important;
  background: var(--muxui-storybook-surface-hover) !important;
}

[data-testid='sb-preview-toolbar'] button[aria-pressed='true'],
[data-testid='sb-preview-toolbar'] button[aria-expanded='true'],
[data-testid='sb-preview-toolbar'] [role='button'][aria-pressed='true'],
[data-testid='sb-preview-toolbar'] [role='button'][aria-expanded='true'],
[data-testid='sb-preview-toolbar'] [role='switch'][aria-checked='true'] {
  color: var(--muxui-storybook-action-foreground) !important;
  background: var(--muxui-storybook-action-background) !important;
}

[data-testid='sb-preview-toolbar'] svg path,
[data-testid='sb-preview-toolbar'] svg use {
  fill: currentColor !important;
}

[data-testid='sb-preview-toolbar'] button:focus-visible,
[data-testid='sb-preview-toolbar'] [role='button']:focus-visible,
[data-testid='sb-preview-toolbar'] [role='switch']:focus-visible {
  outline: 2px solid var(--muxui-storybook-focus-ring);
  outline-offset: 2px;
}

[data-testid='sb-preview-toolbar'] [aria-label^='Choose the Mux UI light or dark theme.'],
[data-testid='sb-preview-toolbar'] [aria-label^='Choose the document writing direction.'] {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-action-background) !important;
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

#storybook-explorer-tree .sidebar-item:has([data-testid='tree-status-button'][aria-label*='Success']) > a,
#storybook-explorer-tree .sidebar-item:has([data-testid='tree-change-status-button'][aria-label*='Success']) > a {
  color: var(--muxui-storybook-status-success) !important;
  -webkit-text-fill-color: var(--muxui-storybook-status-success) !important;
}

#storybook-explorer-tree .sidebar-item:has([data-testid='tree-status-button'][aria-label*='Error']) > a,
#storybook-explorer-tree .sidebar-item:has([data-testid='tree-status-button'][aria-label*='Fail']) > a,
#storybook-explorer-tree .sidebar-item:has([data-testid='tree-change-status-button'][aria-label*='Error']) > a,
#storybook-explorer-tree .sidebar-item:has([data-testid='tree-change-status-button'][aria-label*='Fail']) > a {
  color: var(--muxui-storybook-status-danger) !important;
  -webkit-text-fill-color: var(--muxui-storybook-status-danger) !important;
}

#storybook-explorer-tree .sidebar-item:has([data-testid='tree-status-button'][aria-label*='Warning']) > a,
#storybook-explorer-tree .sidebar-item:has([data-testid='tree-change-status-button'][aria-label*='Warning']) > a {
  color: var(--muxui-storybook-status-warning) !important;
  -webkit-text-fill-color: var(--muxui-storybook-status-warning) !important;
}

#storybook-explorer-tree .sidebar-item:has([data-testid='tree-status-button'][aria-label*='New']) > a,
#storybook-explorer-tree .sidebar-item:has([data-testid='tree-status-button'][aria-label*='Modified']) > a,
#storybook-explorer-tree .sidebar-item:has([data-testid='tree-status-button'][aria-label*='Affected']) > a,
#storybook-explorer-tree .sidebar-item:has([data-testid='tree-change-status-button'][aria-label*='New']) > a,
#storybook-explorer-tree .sidebar-item:has([data-testid='tree-change-status-button'][aria-label*='Modified']) > a,
#storybook-explorer-tree .sidebar-item:has([data-testid='tree-change-status-button'][aria-label*='Affected']) > a {
  color: var(--muxui-storybook-action-background) !important;
  -webkit-text-fill-color: var(--muxui-storybook-action-background) !important;
}

#storybook-explorer-tree [data-testid='tree-status-button'],
#storybook-explorer-tree [data-testid='tree-change-status-button'] {
  background: transparent !important;
  box-shadow: none !important;
}

#storybook-explorer-tree [data-testid='tree-status-button']:hover,
#storybook-explorer-tree [data-testid='tree-status-button']:focus-visible,
#storybook-explorer-tree [data-testid='tree-change-status-button']:hover,
#storybook-explorer-tree [data-testid='tree-change-status-button']:focus-visible {
  background: var(--muxui-storybook-surface-hover) !important;
  box-shadow: none !important;
}

#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='Success'],
#storybook-explorer-tree [data-testid='tree-change-status-button'][aria-label*='Success'] {
  color: var(--muxui-storybook-status-success) !important;
}

#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='Error'],
#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='Fail'],
#storybook-explorer-tree [data-testid='tree-change-status-button'][aria-label*='Error'],
#storybook-explorer-tree [data-testid='tree-change-status-button'][aria-label*='Fail'] {
  color: var(--muxui-storybook-status-danger) !important;
}

#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='Warning'],
#storybook-explorer-tree [data-testid='tree-change-status-button'][aria-label*='Warning'] {
  color: var(--muxui-storybook-status-warning) !important;
}

#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='New'],
#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='Modified'],
#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='Affected'],
#storybook-explorer-tree [data-testid='tree-change-status-button'][aria-label*='New'],
#storybook-explorer-tree [data-testid='tree-change-status-button'][aria-label*='Modified'],
#storybook-explorer-tree [data-testid='tree-change-status-button'][aria-label*='Affected'] {
  color: var(--muxui-storybook-action-background) !important;
}

#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='Success'] svg path,
#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='Success'] svg use,
#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='Error'] svg path,
#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='Error'] svg use,
#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='Warning'] svg path,
#storybook-explorer-tree [data-testid='tree-status-button'][aria-label*='Warning'] svg use,
#storybook-explorer-tree [data-testid='tree-change-status-button'] svg path,
#storybook-explorer-tree [data-testid='tree-change-status-button'] svg use {
  fill: currentColor !important;
}

#storybook-testing-module {
  background: var(--muxui-storybook-surface-body-background) !important;
  border-color: var(--muxui-storybook-border-subtle) !important;
  box-shadow: none !important;
  color: var(--muxui-storybook-content-strong) !important;
  outline-color: var(--muxui-storybook-focus-ring) !important;
}

#storybook-testing-module #errors-found-filter,
#storybook-testing-module #errors-found-filter:hover,
#storybook-testing-module #errors-found-filter:focus-visible {
  background: var(--muxui-storybook-surface-hover) !important;
  box-shadow: none !important;
  color: var(--muxui-storybook-status-danger) !important;
  -webkit-text-fill-color: var(--muxui-storybook-status-danger) !important;
}

#storybook-testing-module #warnings-found-filter,
#storybook-testing-module #warnings-found-filter:hover,
#storybook-testing-module #warnings-found-filter:focus-visible {
  background: var(--muxui-storybook-surface-hover) !important;
  box-shadow: none !important;
  color: var(--muxui-storybook-status-warning) !important;
  -webkit-text-fill-color: var(--muxui-storybook-status-warning) !important;
}

#storybook-testing-module button svg path,
#storybook-testing-module button svg use {
  fill: currentColor !important;
}

#storybook-testing-module button:is(:hover, :focus-visible) {
  background: var(--muxui-storybook-surface-hover) !important;
  outline-color: var(--muxui-storybook-focus-ring) !important;
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
  outline: 2px solid var(--muxui-storybook-focus-ring);
  outline-offset: -2px;
}

/* React Aria portals context menus outside the sidebar and panel regions. */
.react-aria-Popover[role='dialog'] {
  filter: none !important;
}

[aria-label='Storybook menu'],
[role='menu'],
[role='listbox'],
body > div:has(> [role='menu']),
body > div:has(> [role='listbox']) {
  filter: none !important;
}

[aria-label='Storybook menu'] a:hover,
[aria-label='Storybook menu'] [role='menuitem']:hover {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-content-strong) !important;
  box-shadow: none !important;
}

.react-aria-Popover[role='dialog'] div:has(> input[data-tag]):hover {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-content-strong) !important;
  box-shadow: none !important;
}

.react-aria-Popover[role='dialog'] div:has(> input[data-tag]):hover * {
  color: var(--muxui-storybook-content-strong) !important;
  -webkit-text-fill-color: var(--muxui-storybook-content-strong) !important;
}

.react-aria-Popover[role='dialog'],
.react-aria-Popover[role='dialog'] .sb-list,
[role='menu'],
[role='listbox'] {
  background: var(--muxui-storybook-surface-canvas);
  color: var(--muxui-storybook-content-strong);
  border-color: var(--muxui-storybook-border-default);
}

.react-aria-Popover[role='dialog'] .sb-list button,
[role='menu'] [role='menuitem'],
[role='listbox'] [role='option'] {
  color: var(--muxui-storybook-content-strong);
}

.react-aria-Popover[role='dialog'] .sb-list button:hover,
.react-aria-Popover[role='dialog'] .sb-list button:focus-visible,
[role='menu'] [role='menuitem']:hover,
[role='listbox'] [role='option']:hover {
  background: var(--muxui-storybook-surface-hover);
  color: var(--muxui-storybook-content-strong);
}

.react-aria-Popover[role='dialog'] .sb-list button:focus-visible,
[role='menu'] [role='menuitem']:focus-visible,
[role='listbox'] [role='option']:focus-visible {
  outline: 2px solid var(--muxui-storybook-focus-ring);
  outline-offset: -2px;
}

.react-aria-Popover[role='dialog'] > div:not([style]),
[role='menu'] > div:not([style]),
[role='listbox'] > div:not([style]),
body > div:has(> [role='menu']),
body > div:has(> [role='listbox']) {
  background: var(--muxui-storybook-surface-canvas);
  border-color: var(--muxui-storybook-border-default);
  color: var(--muxui-storybook-content-strong);
}

.react-aria-Popover[role='dialog'] .sb-list button kbd,
[role='menu'] kbd,
[role='listbox'] kbd {
  background: var(--muxui-storybook-surface-hover);
  border-color: var(--muxui-storybook-border-subtle);
  color: var(--muxui-storybook-content-muted);
}

.react-aria-Popover[role='dialog'] span:has(> kbd) {
  background: var(--muxui-storybook-surface-hover) !important;
  border-color: var(--muxui-storybook-border-subtle) !important;
  color: var(--muxui-storybook-content-muted) !important;
}

.react-aria-Popover[role='dialog'] button:hover,
.react-aria-Popover[role='dialog'] button:focus-visible,
.react-aria-Popover[role='dialog'] button[data-hovered='true'],
.react-aria-Popover[role='dialog'] button[aria-selected='true'],
.react-aria-Popover[role='dialog'] button[data-selected='true'] {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-content-strong) !important;
}

.react-aria-Popover[role='dialog'] button[aria-pressed='true'],
.react-aria-Popover[role='dialog'] button[aria-checked='true'] {
  background: var(--muxui-storybook-action-background) !important;
  color: var(--muxui-storybook-action-foreground) !important;
}

.react-aria-Popover[role='dialog'] button,
.react-aria-Popover[role='dialog'] li {
  color: var(--muxui-storybook-content-strong) !important;
}

.react-aria-Popover[role='dialog'] input[type='checkbox'],
.react-aria-Popover[role='dialog'] input[type='radio'] {
  accent-color: var(--muxui-storybook-action-background);
  border-color: var(--muxui-storybook-border-default);
}

.react-aria-Popover[role='dialog'] svg path,
.react-aria-Popover[role='dialog'] svg use {
  fill: var(--muxui-storybook-content-muted) !important;
}

.react-aria-Popover[role='dialog'] svg {
  color: var(--muxui-storybook-content-muted) !important;
}

.react-aria-Popover[role='dialog'] div:has(> input[data-tag='Documentation']) svg path,
.react-aria-Popover[role='dialog'] div:has(> input[data-tag='Documentation']) svg use {
  fill: var(--muxui-storybook-status-warning) !important;
}

.react-aria-Popover[role='dialog'] div:has(> input[data-tag='New']) svg path,
.react-aria-Popover[role='dialog'] div:has(> input[data-tag='New']) svg use,
.react-aria-Popover[role='dialog'] div:has(> input[data-tag='Modified']) svg path,
.react-aria-Popover[role='dialog'] div:has(> input[data-tag='Modified']) svg use {
  fill: var(--muxui-storybook-action-background) !important;
}

.react-aria-Popover[role='dialog'] .sb-list button svg path,
[role='menu'] svg path,
[role='listbox'] svg path {
  fill: var(--muxui-storybook-content-muted);
}

[role='menu'] [role='menuitem'][aria-selected='true'],
[role='listbox'] [role='option'][aria-selected='true'],
[role='menu'] [role='menuitem'][data-selected='true'],
[role='listbox'] [role='option'][data-selected='true'] {
  background: var(--muxui-storybook-action-background);
  color: var(--muxui-storybook-action-foreground);
}

[role='menu'] [role='menuitem'][aria-selected='true'] *,
[role='listbox'] [role='option'][aria-selected='true'] *,
[role='menu'] [role='menuitem'][data-selected='true'] *,
[role='listbox'] [role='option'][data-selected='true'] * {
  color: var(--muxui-storybook-action-foreground);
  -webkit-text-fill-color: var(--muxui-storybook-action-foreground);
}

[role='menu'] [role='menuitem']:hover,
[role='listbox'] [role='option']:hover,
[role='menu'] [role='menuitem']:focus-visible,
[role='listbox'] [role='option']:focus-visible,
[role='menu'] [role='menuitem'][data-hovered='true'],
[role='listbox'] [role='option'][data-hovered='true'] {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-content-strong) !important;
}

[role='menu'] [role='menuitem']:hover *,
[role='listbox'] [role='option']:hover *,
[role='menu'] [role='menuitem']:focus-visible *,
[role='listbox'] [role='option']:focus-visible *,
[role='menu'] [role='menuitem'][data-hovered='true'] *,
[role='listbox'] [role='option'][data-hovered='true'] * {
  color: var(--muxui-storybook-content-strong) !important;
  -webkit-text-fill-color: var(--muxui-storybook-content-strong) !important;
}

[role='menu'] [role='menuitem'][aria-selected='true'],
[role='listbox'] [role='option'][aria-selected='true'],
[role='menu'] [role='menuitem'][data-selected='true'],
[role='listbox'] [role='option'][data-selected='true'] {
  background: var(--muxui-storybook-action-background) !important;
  color: var(--muxui-storybook-action-foreground) !important;
}

[role='menu'] [role='menuitem'][aria-selected='true'] *,
[role='listbox'] [role='option'][aria-selected='true'] *,
[role='menu'] [role='menuitem'][data-selected='true'] *,
[role='listbox'] [role='option'][data-selected='true'] * {
  color: var(--muxui-storybook-action-foreground) !important;
  -webkit-text-fill-color: var(--muxui-storybook-action-foreground) !important;
}

[role='menu'],
[role='listbox'] {
  outline-color: var(--muxui-storybook-focus-ring);
}

[role='listbox'][aria-label='Vision filter'] span {
  background-image: linear-gradient(
    to right,
    var(--muxui-storybook-vision-red),
    var(--muxui-storybook-vision-orange),
    var(--muxui-storybook-vision-yellow),
    var(--muxui-storybook-vision-green),
    var(--muxui-storybook-vision-blue),
    var(--muxui-storybook-vision-purple)
  );
}

[role='listbox'][aria-label='Vision filter'] * {
  filter: none !important;
}

[role='listbox'] svg use {
  fill: var(--muxui-storybook-content-muted) !important;
}

#storybook-sidebar-region *,
#storybook-panel-region *,
[data-testid='sb-preview-toolbar'] *,
.react-aria-Popover[role='dialog'] *,
[role='menu'] *,
[role='listbox'] *,
[data-testid='tooltip'].react-aria-Tooltip * {
  transition-property: transform, opacity !important;
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
  outline: 2px solid var(--muxui-storybook-focus-ring);
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
  outline: 2px solid var(--muxui-storybook-focus-ring);
  outline-offset: 1px;
}

#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] input:disabled,
#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] select:disabled,
#storybook-panel-region [role='tabpanel'][id$='tabpanel-addon-controls'] textarea:disabled {
  background: var(--muxui-storybook-surface-body-background);
  border-color: var(--muxui-storybook-border-subtle);
  color: var(--muxui-storybook-content-muted);
}

/* Storybook's settings pages render in the manager main region. Their stock
   palette is separate from the sidebar and addon panel theme variables. */
#main-content-wrapper [role='tablist'] {
  background: var(--muxui-storybook-surface-body-background) !important;
  border-color: var(--muxui-storybook-border-subtle) !important;
  transition-property: transform, opacity !important;
}

#main-content-wrapper [role='tablist'] * {
  transition-property: transform, opacity !important;
}

#main-content-wrapper [role='tab'] {
  color: var(--muxui-storybook-content-muted) !important;
  border-color: transparent !important;
}

#main-content-wrapper [role='tab'][aria-selected='true'] {
  color: var(--muxui-storybook-action-background) !important;
  border-color: var(--muxui-storybook-action-background) !important;
}

#main-content-wrapper [role='tab']:focus-visible {
  outline: 2px solid var(--muxui-storybook-focus-ring) !important;
  outline-offset: -2px;
}

#main-content-wrapper [role='tabpanel'] {
  background: var(--muxui-storybook-surface-canvas) !important;
  color: var(--muxui-storybook-content-strong) !important;
  border-color: var(--muxui-storybook-border-subtle) !important;
}

#main-content-wrapper [role='tabpanel'] * {
  color: var(--muxui-storybook-content-strong) !important;
  -webkit-text-fill-color: var(--muxui-storybook-content-strong) !important;
  border-color: var(--muxui-storybook-border-subtle) !important;
  outline-color: var(--muxui-storybook-focus-ring) !important;
  transition-property: transform, opacity !important;
}

#main-content-wrapper [role='tabpanel'] a {
  color: var(--muxui-storybook-content-link) !important;
}

#main-content-wrapper [role='tabpanel'] pre,
#main-content-wrapper [role='tabpanel'] code {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-content-strong) !important;
}

#main-content-wrapper [role='tabpanel'] li {
  box-shadow: none !important;
  border-bottom: 1px solid var(--muxui-storybook-border-subtle) !important;
}

#main-content-wrapper [role='tabpanel'] div:has(> h2)::after {
  border-color: var(--muxui-storybook-status-success) !important;
}

#main-content-wrapper [role='tabpanel'] input[readonly] {
  background: var(--muxui-storybook-surface-canvas) !important;
  border-color: var(--muxui-storybook-border-default) !important;
  box-shadow: 0 0 0 1px var(--muxui-storybook-border-subtle) inset !important;
  color: var(--muxui-storybook-content-strong) !important;
}

#main-content-wrapper [role='tabpanel'] [aria-checked='true'],
#main-content-wrapper [role='tabpanel'] [aria-selected='true'],
#main-content-wrapper [role='tabpanel'] [data-selected='true'] {
  background: var(--muxui-storybook-action-background) !important;
  color: var(--muxui-storybook-action-foreground) !important;
  box-shadow: none !important;
}

#main-content-wrapper [role='tabpanel'] [aria-checked='true'] *,
#main-content-wrapper [role='tabpanel'] [aria-selected='true'] *,
#main-content-wrapper [role='tabpanel'] [data-selected='true'] * {
  color: var(--muxui-storybook-action-foreground) !important;
  -webkit-text-fill-color: var(--muxui-storybook-action-foreground) !important;
}

#main-content-wrapper [role='tabpanel'] svg path,
#main-content-wrapper [role='tabpanel'] svg use {
  fill: currentColor !important;
}

#main-content-wrapper [role='tabpanel'] svg[data-visible='true'],
#main-content-wrapper [role='tabpanel'] svg[data-visible='false'] {
  background: var(--muxui-storybook-status-success) !important;
  color: var(--muxui-storybook-status-success) !important;
}

#main-content-wrapper [role='tabpanel'] svg[role='img'] use {
  fill: var(--muxui-storybook-action-background) !important;
}

#main-content-wrapper [role='tabpanel'] svg[role='img'] path {
  fill: var(--muxui-storybook-action-foreground) !important;
}

#storybook-panel-region [role='treeitem'] {
  color: var(--muxui-storybook-content-strong) !important;
  box-shadow: none !important;
  text-shadow: none !important;
}

#storybook-panel-region [role='treeitem'] * {
  color: var(--muxui-storybook-content-strong) !important;
  -webkit-text-fill-color: var(--muxui-storybook-content-strong) !important;
  text-shadow: none !important;
}

#storybook-panel-region [role='tablist'][id] [role='tab'] > div > div {
  box-shadow: none !important;
  color: var(--muxui-storybook-content-muted) !important;
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

#storybook-panel-region [id$='tabpanel-addon-controls'] td > span,
#storybook-panel-region [id$='tabpanel-addon-controls'] td > div > span {
  color: var(--muxui-storybook-content-muted) !important;
}

#storybook-panel-region [id$='tabpanel-addon-controls'] button[aria-label$=' as JSON'] {
  background: transparent !important;
  color: var(--muxui-storybook-content-muted) !important;
}

#storybook-panel-region [id$='tabpanel-addon-controls'] button[aria-label$=' as JSON']:is(:hover, :focus-visible, [aria-checked='true']) {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-content-link) !important;
}

#storybook-panel-region [id$='tabpanel-addon-controls'] button[id^='set-']:is(:hover, :focus-visible) {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-content-strong) !important;
}

#storybook-panel-region textarea[placeholder='Edit JSON string...'] {
  box-shadow: none !important;
}

#storybook-panel-region textarea[placeholder='Edit JSON string...'][aria-invalid='true'] {
  border-color: var(--muxui-storybook-status-danger) !important;
  box-shadow: inset 0 0 0 1px var(--muxui-storybook-status-danger) !important;
}

#storybook-panel-region .rejt-tree,
#storybook-panel-region .rejt-tree * {
  color: var(--muxui-storybook-content-strong) !important;
  border-color: var(--muxui-storybook-border-default) !important;
}

#storybook-panel-region .rejt-tree button::before {
  border-top-color: var(--muxui-storybook-content-muted) !important;
}

#storybook-panel-region .rejt-tree button::after,
#storybook-panel-region .rejt-tree .rejt-value-node:hover > .rejt-value {
  background: var(--muxui-storybook-surface-hover) !important;
}

#storybook-panel-region .rejt-tree :is(.rejt-name, .rejt-not-collapsed-delimiter) {
  color: var(--muxui-storybook-content-muted) !important;
}

#storybook-panel-region .rejt-tree .rejt-value {
  color: var(--muxui-storybook-content-link) !important;
}

#storybook-panel-region .rejt-tree button:is(:hover, :focus-visible) {
  color: var(--muxui-storybook-content-link) !important;
}

#storybook-panel-region .rejt-tree .rejt-minus-menu:is(:hover, :focus-visible) {
  color: var(--muxui-storybook-status-danger) !important;
}

#save-from-controls,
#save-from-controls > div {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-content-strong) !important;
}

#save-from-controls,
#save-from-controls * {
  animation: none !important;
  transition-property: transform, opacity !important;
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

/* These controls are rendered outside the ordinary sidebar rows and menus. */
#storybook-sidebar-region [aria-label='Tag filters']:hover,
#storybook-sidebar-region [aria-label='Tag filters']:focus-visible,
#storybook-sidebar-region [aria-label='Tag filters'][aria-expanded='true'] {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-action-background) !important;
}

.react-aria-Popover[role='dialog'] * {
  filter: none !important;
}

[role='dialog'] a:is(:hover, :focus-visible) {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-content-link) !important;
}

#storybook-explorer-tree [aria-label^='Test status:'] {
  color: var(--muxui-storybook-content-muted) !important;
}

#storybook-explorer-tree [aria-label='Test status: Success'] {
  color: var(--muxui-storybook-status-success) !important;
}

#storybook-explorer-tree [aria-label='Test status: Warning'] {
  color: var(--muxui-storybook-status-warning) !important;
}

#storybook-explorer-tree [aria-label='Test status: Error'] {
  color: var(--muxui-storybook-status-danger) !important;
}

#storybook-explorer-tree :is([aria-label='Test status: New'], [aria-label='Test status: Modified'], [aria-label='Test status: Affected'], [aria-label='Test status: Reviewing']) {
  color: var(--muxui-storybook-content-link) !important;
}

#storybook-explorer-tree [aria-label^='Test status:'] svg {
  color: inherit !important;
  animation: none !important;
}

#storybook-explorer-tree [aria-label^='Test status:'] :is(path, use) {
  fill: currentColor !important;
}

#storybook-explorer-tree .sidebar-item:not([data-selected='true']):has([aria-label='Test status: Error']) > :is(a, button) {
  color: var(--muxui-storybook-status-danger) !important;
}

#storybook-explorer-tree .sidebar-item:not([data-selected='true']):has([aria-label='Test status: Warning']) > :is(a, button) {
  color: var(--muxui-storybook-status-warning) !important;
}

#sidebar-bottom-wrapper > div {
  box-shadow: none !important;
}

#sidebar-bottom-wrapper :is(div, a):has(> button[aria-label='Dismiss notification']) {
  background: var(--muxui-storybook-surface-canvas) !important;
  border-color: var(--muxui-storybook-border-default) !important;
  color: var(--muxui-storybook-content-strong) !important;
  box-shadow: 0 0 0 1px var(--muxui-storybook-border-subtle) !important;
}

#sidebar-bottom-wrapper :is(div, a):has(> button[aria-label='Dismiss notification']) * {
  color: var(--muxui-storybook-content-strong) !important;
  transition-property: transform, opacity !important;
}

#sidebar-bottom-wrapper :is(div, a):has(> button[aria-label='Dismiss notification']) [title] + div {
  color: var(--muxui-storybook-content-muted) !important;
}

#sidebar-bottom-wrapper :is(div, a):has(> button[aria-label='Dismiss notification']) > div svg path {
  fill: var(--muxui-storybook-status-danger) !important;
}

#sidebar-bottom-wrapper button[aria-label='Dismiss notification'] {
  background: transparent !important;
  outline-color: var(--muxui-storybook-focus-ring) !important;
}

#sidebar-bottom-wrapper button[aria-label='Dismiss notification']:hover {
  background: var(--muxui-storybook-surface-hover) !important;
}

#sidebar-bottom-wrapper button[aria-label='Dismiss notification'] path {
  fill: currentColor !important;
}

svg:has(use[*|href='#icon--warning']),
use[*|href='#icon--warning'] {
  color: var(--muxui-storybook-status-warning) !important;
}

svg:has(use[*|href='#icon--error']),
use[*|href='#icon--error'] {
  color: var(--muxui-storybook-status-danger) !important;
}

svg:has(use[*|href='#icon--success']),
use[*|href='#icon--success'] {
  color: var(--muxui-storybook-status-success) !important;
}

#main-content-wrapper [role='tabpanel'] div:empty {
  background-color: var(--muxui-storybook-surface-hover) !important;
}

#main-content-wrapper [role='tabpanel'] div:has(> svg[data-visible]) {
  background-color: var(--muxui-storybook-surface-hover) !important;
}

/* The accessibility addon embeds a separate syntax palette in its results. */
#storybook-panel-region [id$='tabpanel-storybook/a11y/panel'] * {
  color: var(--muxui-storybook-content-strong) !important;
  -webkit-text-fill-color: currentColor !important;
  border-color: var(--muxui-storybook-border-subtle) !important;
  outline-color: var(--muxui-storybook-focus-ring) !important;
  box-shadow: none !important;
  text-shadow: none !important;
}

#storybook-panel-region [id$='tabpanel-storybook/a11y/panel'] button:is(:hover, :focus-visible, [aria-pressed='true']) {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-action-background) !important;
}

#storybook-panel-region [id$='tabpanel-storybook/a11y/panel'] .token:is(.tag, .selector, .attr-name) {
  color: var(--muxui-storybook-content-link) !important;
}

#storybook-panel-region [id$='tabpanel-storybook/a11y/panel'] .token.attr-value {
  color: var(--muxui-storybook-action-background) !important;
}

#storybook-panel-region [id$='tabpanel-storybook/a11y/panel'] .token.comment {
  color: var(--muxui-storybook-content-muted) !important;
}

#storybook-panel-region [id$='tabpanel-storybook/a11y/panel'] [data-active] > div:not(:first-child) {
  background: var(--muxui-storybook-surface-hover) !important;
}

#storybook-panel-region [id$='tabpanel-violations'] [data-active] > div:nth-child(2) {
  color: var(--muxui-storybook-status-danger) !important;
}

#storybook-panel-region [id$='tabpanel-passes'] [data-active] > div:nth-child(2) {
  color: var(--muxui-storybook-status-success) !important;
}

#storybook-panel-region [id$='tabpanel-incomplete'] [data-active] > div:nth-child(2) {
  color: var(--muxui-storybook-status-warning) !important;
}

/* Interaction calls and matcher results ship an independent inline palette. */
#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] * {
  color: var(--muxui-storybook-content-strong) !important;
  -webkit-text-fill-color: currentColor !important;
  border-color: var(--muxui-storybook-border-subtle) !important;
  box-shadow: none !important;
  text-shadow: none !important;
}

#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] li,
#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] li > div {
  background: var(--muxui-storybook-surface-canvas) !important;
}

#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] li:has([aria-label*='Status: failed.']) {
  background: var(--muxui-storybook-surface-hover) !important;
}

#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] button:is(:hover, :focus-visible) {
  background: var(--muxui-storybook-surface-hover) !important;
  color: var(--muxui-storybook-content-link) !important;
}

#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] button:focus-visible {
  outline: 2px solid var(--muxui-storybook-focus-ring) !important;
  outline-offset: -2px;
}

#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] button[aria-label*='interaction row'] > div > span:nth-of-type(2) {
  color: var(--muxui-storybook-content-link) !important;
}

#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] [data-testid='icon-done'],
#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] [data-testid='icon-done'] * {
  color: var(--muxui-storybook-status-success) !important;
  fill: var(--muxui-storybook-status-success) !important;
}

#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] [data-testid='icon-error'],
#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] [data-testid='icon-error'] * {
  color: var(--muxui-storybook-status-danger) !important;
  fill: var(--muxui-storybook-status-danger) !important;
}

#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] li::before {
  border-left-color: var(--muxui-storybook-status-warning) !important;
}

#storybook-panel-region [id$='tabpanel-storybook/interactions/panel'] li::after {
  border-top-color: var(--muxui-storybook-status-warning) !important;
}
`;
}

export function previewThemeCss() {
  const tokens = COLOR_SCHEMES.map((colorScheme) => {
    const selector = colorScheme === 'light' ? ':root' : ":root[data-muxui-color-scheme='dark']";
    const measureStep = colorScheme === 'dark' ? 90 : 20;
    const declarations = Object.entries({
      ...PREVIEW_TOKEN_IDS,
      measureMargin: `reference.color.orange-${measureStep}`,
      measureBorder: `reference.color.yellow-${measureStep}`,
      measurePadding: `reference.color.green-${measureStep}`,
      measureContent: `reference.color.sky-${measureStep}`,
    })
      .map(([name, tokenId]) => `  --muxui-semantic-${name.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}: ${tokenValue(colorScheme, tokenId)};`)
      .join('\n');
    return `${selector} {\n${declarations}\n}`;
  }).join('\n');
  return `${tokens}

/* Core diagnostic overlays inject their own late styles. Only override them
   while their corresponding tool is active; story colours remain independent. */
html:has(#addon-backgrounds-grid) .sb-show-main,
html:has(style[id^='addon-backgrounds-grid-docs-']) #storybook-docs .docs-story {
  background-blend-mode: normal !important;
  background-image: linear-gradient(var(--muxui-semantic-border-default) 1px, transparent 1px),
    linear-gradient(90deg, var(--muxui-semantic-border-default) 1px, transparent 1px),
    linear-gradient(var(--muxui-semantic-border-subtle) 1px, transparent 1px),
    linear-gradient(90deg, var(--muxui-semantic-border-subtle) 1px, transparent 1px) !important;
}

html:has(#addon-outline) .sb-show-main *,
html:has(style[id^='addon-outline-docs-']) [data-story-block='true'] * {
  outline-color: var(--muxui-semantic-focus-ring) !important;
  transition-property: transform, opacity !important;
}

html:has(style[id^='addon-backgrounds']) .sb-show-main,
html:has(style[id^='addon-backgrounds']) .docs-story {
  transition-property: transform, opacity !important;
}

.sb-preparing-story,
.sb-preparing-docs {
  background-color: var(--muxui-semantic-surface-canvas);
  color: var(--muxui-semantic-content-strong);
}

.sb-loader {
  border-color: var(--muxui-semantic-border-subtle);
  border-top-color: var(--muxui-semantic-action-background);
  mix-blend-mode: normal;
  transition-property: transform, opacity;
}

.sb-nopreview,
.sb-nopreview_main,
.sb-nopreview_main *,
.sb-errordisplay,
.sb-errordisplay_main,
.sb-errordisplay_main * {
  background: var(--muxui-semantic-surface-canvas) !important;
  color: var(--muxui-semantic-content-strong) !important;
}

.sb-errordisplay_main {
  border-color: var(--muxui-semantic-action-danger-background) !important;
  box-shadow: none !important;
}

.sb-errordisplay_main h1::before {
  background: var(--muxui-semantic-action-danger-background) !important;
}

.sb-errordisplay_main .sb-errordisplay_code,
.sb-errordisplay_main .sb-errordisplay_code * {
  background: var(--muxui-semantic-surface-hover) !important;
  color: var(--muxui-semantic-content-strong) !important;
}

.sb-previewBlock,
.sb-previewBlock_header,
.sb-previewBlock_body,
.sb-previewBlock_icon,
.sb-argstableBlock,
.sb-argstableBlock-body,
.sb-argstableBlock-body td,
.sb-argstableBlock-body button,
.sb-argstableBlock th span,
.sb-argstableBlock td span {
  animation: none !important;
  transition-property: transform, opacity !important;
}

.sb-previewBlock {
  background: var(--muxui-semantic-surface-canvas) !important;
  border-color: var(--muxui-semantic-border-subtle) !important;
  box-shadow: none !important;
}

.sb-previewBlock_header {
  box-shadow: inset 0 -1px 0 var(--muxui-semantic-border-subtle) !important;
}

.sb-previewBlock_icon,
.sb-previewBlock_body {
  background: var(--muxui-semantic-surface-hover) !important;
}

.sb-argstableBlock th span,
.sb-argstableBlock td span,
.sb-argstableBlock-body button {
  background: var(--muxui-semantic-surface-hover) !important;
  border-color: var(--muxui-semantic-border-subtle) !important;
  color: var(--muxui-semantic-content-muted) !important;
}

.sb-argstableBlock-body {
  box-shadow: none !important;
}

.sb-argstableBlock-body tr:not(:first-child) {
  border-top-color: var(--muxui-semantic-border-subtle) !important;
}

.sb-argstableBlock-body td {
  background: var(--muxui-semantic-surface-canvas) !important;
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

export function backgroundOptions() {
  return Object.fromEntries(COLOR_SCHEMES.map((colorScheme) => [colorScheme, {
    name: colorScheme === 'light' ? 'Light' : 'Dark',
    value: tokenValue(colorScheme, 'semantic.surface.canvas'),
  }]));
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
