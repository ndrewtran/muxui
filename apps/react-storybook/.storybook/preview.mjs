import React from 'react';
import * as MuxUI from '@muxui/react';
import { isMigrationFixtureRequest } from '../src/visual-migration-contract.mjs';
import { MigrationFixture } from '../src/migration-visual.fixture.mjs';
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
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-muxui-color-scheme', scheme);
    document.documentElement.style.setProperty('--muxui-migration-frame-background', scheme === 'dark' ? '#000000' : '#ffffff');
  }
}

function applyDirection(direction) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-muxui-direction', direction);
  document.documentElement.dir = direction;
}

function applyMigrationHost(migration) {
  if (typeof document === 'undefined' || !document.body) return;
  if (migration) document.body.setAttribute('data-muxui-migration-host', 'true');
  else document.body.removeAttribute('data-muxui-migration-host');
}

function StorySurface({ children, scheme, direction, viewMode, migration }) {
  const surfaceRef = React.useRef(null);

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
        if (!originalLabel && !child.hasAttribute('aria-labelledby')) {
          child.setAttribute('aria-label', 'Mux UI overlay');
        }
        managed.set(child, { originalRole, originalLabel });
      }
    };
    const observer = new MutationObserver(annotateOverlayHosts);
    observer.observe(document.body, { childList: true });
    annotateOverlayHosts();
    return () => {
      observer.disconnect();
      for (const [element, { originalRole, originalLabel }] of managed) {
        if (originalRole === null) {
          if (element.getAttribute('role') === 'region') element.removeAttribute('role');
        } else if (element.getAttribute('role') === 'region') {
          element.setAttribute('role', originalRole);
        }
        if (originalLabel === null) {
          if (element.getAttribute('aria-label') === 'Mux UI overlay') element.removeAttribute('aria-label');
        } else if (element.getAttribute('aria-label') === 'Mux UI overlay') {
          element.setAttribute('aria-label', originalLabel);
        }
      }
    };
  }, [viewMode]);

  const surfaceElement = viewMode === 'story' ? 'main' : 'div';
  return React.createElement(
    surfaceElement,
    {
      ref: surfaceRef,
      className: 'muxui-storybook-surface',
      'data-muxui-color-scheme': scheme,
      'data-muxui-direction': direction,
      'data-muxui-migration-host': migration ? 'true' : undefined,
    },
    children,
  );
}

/** Keep every story inside the MuxUI toast context so the Toast family is interactive. */
export default {
  globalTypes: {
    colorScheme: {
      name: 'Color scheme',
      description: 'Choose the MuxUI light or dark theme.',
      defaultValue: 'light',
      toolbar: {
        icon: 'contrast',
        items: colorSchemeItems,
        dynamicTitle: true,
      },
    },
    direction: {
      name: 'Direction',
      description: 'Choose the document writing direction.',
      defaultValue: 'ltr',
      toolbar: {
        icon: 'transfer',
        items: directionItems,
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const scheme = context.globals?.colorScheme === 'dark' ? 'dark' : 'light';
      const direction = context.globals?.direction === 'rtl' ? 'rtl' : 'ltr';
      const migration = isMigrationFixtureRequest(context.id, window.location.search);
      applyColorScheme(scheme);
      applyDirection(direction);
      applyMigrationHost(migration);
      const story = migration
        ? React.createElement(MigrationFixture, {
          runToken: import.meta.env.VITE_MUXUI_MIGRATION_RUN_TOKEN,
        })
        : React.createElement(Story);
      return React.createElement(
        StorySurface,
        { scheme, direction, viewMode: context.viewMode, migration },
        React.createElement(MuxUI.ToastProvider, { placement: migration ? 'bottom-end' : undefined }, story),
      );
    },
  ],
  parameters: {
    controls: {
      expanded: true,
    },
    a11y: {
      test: 'error',
    },
  },
};
