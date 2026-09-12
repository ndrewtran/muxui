import React from 'react';
import { useGlobals } from 'storybook/preview-api';
import { GLOBALS_UPDATED, SET_GLOBALS } from 'storybook/internal/core-events';
import { DocsContainer } from '@storybook/addon-docs/blocks';
import { StorybookThemeContext } from '../src/storybook-theme.mjs';
import * as MuxUI from '@muxui/react';
import { backgroundOptions, buildTheme } from './theme.mjs';
import '@muxui/react/styles.css';
import './preview.css';

const colorSchemeItems = [
  { value: 'light', title: 'Light' },
  { value: 'dark', title: 'Dark' },
];

const directionItems = [
  { value: 'ltr', title: 'LTR' },
  { value: 'rtl', title: 'RTL' },
];

function applyColorScheme(scheme) {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-muxui-color-scheme', scheme);
}

function applyDirection(direction) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-muxui-direction', direction);
  document.documentElement.dir = direction;
}

function colorSchemeFromQuery() {
  const globals = new URLSearchParams(window.location.search).get('globals') ?? '';
  return /(?:^|;)colorScheme:dark(?:;|$)/u.test(globals) ? 'dark' : 'light';
}

function colorSchemeFromContext(context) {
  const story = context.componentStories()[0];
  if (story) return context.getStoryContext(story).globals?.colorScheme === 'dark' ? 'dark' : 'light';
  const rootScheme = document.documentElement.getAttribute('data-muxui-color-scheme');
  return rootScheme === 'dark' || colorSchemeFromQuery() === 'dark' ? 'dark' : 'light';
}

function MuxUIDocsContainer({ context, children }) {
  const [scheme, setScheme] = React.useState(() => colorSchemeFromContext(context));

  React.useEffect(() => {
    const updateScheme = ({ globals }) => {
      setScheme(globals?.colorScheme === 'dark' ? 'dark' : 'light');
    };
    context.channel.on(GLOBALS_UPDATED, updateScheme);
    context.channel.on(SET_GLOBALS, updateScheme);
    return () => {
      context.channel.removeListener(GLOBALS_UPDATED, updateScheme);
      context.channel.removeListener(SET_GLOBALS, updateScheme);
    };
  }, [context.channel]);

  return React.createElement(DocsContainer, { context, theme: buildTheme(scheme) }, children);
}

function StorySurface({ children, scheme, direction, viewMode }) {
  React.useEffect(() => {
    if (viewMode !== 'story') return undefined;
    const managed = new Map();
    const isOverlayHost = (element) => element instanceof HTMLElement
      && (element.style.display === 'contents'
        || element.hasAttribute('data-overlay-container')
        || element.classList.contains('muxui-dialog-backdrop')
        || element.classList.contains('muxui-toast-region'));
    const annotateOverlayHosts = () => {
      for (const child of document.body.children) {
        if (!isOverlayHost(child) || managed.has(child)) continue;
        const originalRole = child.getAttribute('role');
        const originalLabel = child.getAttribute('aria-label');
        if (!originalRole) child.setAttribute('role', 'region');
        if (!originalLabel && !child.hasAttribute('aria-labelledby')) child.setAttribute('aria-label', 'Mux UI overlay');
        managed.set(child, { originalRole, originalLabel });
      }
    };
    const observer = new MutationObserver(annotateOverlayHosts);
    observer.observe(document.body, { childList: true });
    annotateOverlayHosts();
    return () => {
      observer.disconnect();
      for (const [element, { originalRole, originalLabel }] of managed) {
        if (originalRole === null && element.getAttribute('role') === 'region') element.removeAttribute('role');
        else if (originalRole !== null && element.getAttribute('role') === 'region') element.setAttribute('role', originalRole);
        if (originalLabel === null && element.getAttribute('aria-label') === 'Mux UI overlay') element.removeAttribute('aria-label');
        else if (originalLabel !== null && element.getAttribute('aria-label') === 'Mux UI overlay') element.setAttribute('aria-label', originalLabel);
      }
    };
  }, [viewMode]);

  return React.createElement(
    viewMode === 'story' ? 'main' : 'div',
    {
      className: 'muxui-storybook-surface',
      'data-muxui-color-scheme': scheme,
      'data-muxui-direction': direction,
    },
    children,
  );
}

/** Keep every story inside the Mux UI toast context so the Toast family is interactive. */
export default {
  globalTypes: {
    colorScheme: {
      name: 'Color scheme',
      description: 'Choose the Mux UI light or dark theme.',
      defaultValue: 'light',
      toolbar: { icon: 'contrast', items: colorSchemeItems, dynamicTitle: true },
    },
    direction: {
      name: 'Direction',
      description: 'Choose the document writing direction.',
      defaultValue: 'ltr',
      toolbar: { icon: 'transfer', items: directionItems, dynamicTitle: true },
    },
  },
  decorators: [
    (Story, context) => {
      const [, updateGlobals] = useGlobals();
      const scheme = context.globals?.colorScheme === 'dark' ? 'dark' : 'light';
      const direction = context.globals?.direction === 'rtl' ? 'rtl' : 'ltr';
      applyColorScheme(scheme);
      applyDirection(direction);
      return React.createElement(
        StorySurface,
        { scheme, direction, viewMode: context.viewMode },
        React.createElement(
          StorybookThemeContext.Provider,
          { value: { scheme, setScheme: (colorScheme) => updateGlobals({ colorScheme }) } },
          React.createElement(MuxUI.ToastProvider, null, React.createElement(Story)),
        ),
      );
    },
  ],
  parameters: {
    options: { storySort: { method: 'alphabetical', order: ['Foundations', '*'] } },
    controls: { expanded: true },
    backgrounds: { options: backgroundOptions() },
    a11y: { test: 'error' },
    docs: {
      theme: buildTheme('light'),
      container: MuxUIDocsContainer,
    },
  },
};
