import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import '@muxui/react/styles.css';
import { ToastProvider } from '@muxui/react';
import descriptor from '../../../../packages/react/generated/descriptor.json' with { type: 'json' };
import { fixtureContractFor, migrationFrame, migrationFixtureSymbol } from '../../src/visual-migration-contract.mjs';
import { renderFamily, stateArgsForBinding } from '../../src/storybook-factory.mjs';
import { lifecycleFactsForOriginalFinite, stateReachedForOriginalFinite, styleFactsForOriginalFinite } from './r1-6-original-finite-facts.mjs';

const h = React.createElement;
const createRoot = ReactDOMClient.createRoot ?? ReactDOMClient.default?.createRoot;
if (!createRoot) throw new Error('Mux finite bootstrap could not resolve ReactDOM.createRoot');

function bindReducedMotionPreference() {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const apply = () => {
    document.documentElement.toggleAttribute('data-reduced-motion', preference.matches);
  };
  apply();
  preference.addEventListener('change', apply);
}

function rendererFamily(family) {
  return family === 'Modal' ? 'Dialog' : family;
}

function parseProps(params) {
  const value = params.get('props');
  if (!value) return {};
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('finite Mux props must be a JSON object');
  return parsed;
}

function interactiveTarget(root) {
  return root.querySelector('button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])');
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('case');
  const family = rendererFamily(params.get('family') ?? '');
  const state = params.get('state') ?? 'idle';
  const mode = params.get('mode') === 'dark' ? 'dark' : 'light';
  const rawProps = parseProps(params);
  const baseFixture = fixtureContractFor({ family }, state);
  const fixture = { ...baseFixture, state, frame: family === 'Virtualizer'
    ? { ...baseFixture.frame, virtualizer: { ...baseFixture.frame.virtualizer, height: rawProps.height ?? baseFixture.frame.virtualizer.height } }
    : baseFixture.frame };
  const binding = descriptor.bindings.find((candidate) => candidate.export === family);
  if (!binding) throw new Error(`unknown Mux finite family: ${family}`);
  // PreviewTrigger and Tooltip use the same RAC open/defaultOpen contract as
  // Dialog and Popover. Supplying a lifecycle default here keeps opening
  // cases closed until their declared trigger action and closing cases
  // attached until the real dismiss action.
  const overlayLifecycle = ['Dialog', 'Popover', 'PreviewTrigger', 'Tooltip'].includes(family);
  const lifecycleState = overlayLifecycle && ['open', 'opening', 'closing'].includes(state);
  const sourceArgs = {
    ...(lifecycleState && rawProps.open === undefined && rawProps.defaultOpen === undefined
      ? { defaultOpen: ['open', 'closing'].includes(state) }
      : {}),
    ...rawProps,
    [migrationFixtureSymbol]: fixture,
  };
  const args = { ...stateArgsForBinding(binding, state, family, sourceArgs), [migrationFixtureSymbol]: fixture };
  document.documentElement.dataset.muxuiColorScheme = mode;
  bindReducedMotionPreference();
  document.body.style.background = migrationFrame.background[mode];
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  const viewport = fixture.frame.virtualizer;
  const root = document.getElementById('root');
  const captureViewport = new Set(['Dialog', 'Popover', 'PreviewTrigger', 'Toast', 'Tooltip']).has(family)
    || (state === 'open' && ['DatePicker', 'DateRangePicker', 'ComboBox', 'Select'].includes(family));
  const renderedFamily = renderFamily(family, args);
  const familyContent = family === 'Toast'
    ? h(ToastProvider, null, renderedFamily)
    : renderedFamily;
  const content = h('div', {
    'data-migration-case': id,
    'data-muxui-paired-case': id,
    className: 'migration-component',
    style: {
      boxSizing: 'border-box', display: 'inline-flex', alignItems: 'flex-start', justifyContent: 'flex-start', padding: viewport && family === 'Virtualizer' ? 0 : '12px',
      background: 'var(--muxui-migration-frame-background, transparent)', width: viewport && family === 'Virtualizer' ? `${viewport.width}px` : ['TextField', 'Autocomplete', 'ComboBox', 'Select'].includes(family) ? '340px' : 'max-content',
      height: viewport && family === 'Virtualizer' ? `${viewport.height}px` : undefined,
    },
  }, h('div', { className: 'migration-equivalent-frame', style: viewport && family === 'Virtualizer' ? { boxSizing: 'border-box', width: `${viewport.width}px`, height: `${viewport.height}px` } : { display: 'contents', boxSizing: 'border-box' } }, familyContent));
  createRoot(root).render(content);
  window.__coreMigration = {
    ready: () => Boolean(document.querySelector(`[data-muxui-paired-case="${CSS.escape(id)}"]`)),
    state: () => stateReachedForOriginalFinite(document.querySelector(`[data-muxui-paired-case="${CSS.escape(id)}"]`), state, 'mux', family),
    styleFacts: () => styleFactsForOriginalFinite(document.querySelector(`[data-muxui-paired-case="${CSS.escape(id)}"]`), family, state, 'mux'),
    lifecycle: () => lifecycleFactsForOriginalFinite(document.querySelector(`[data-muxui-paired-case="${CSS.escape(id)}"]`), state, 'mux'),
    captureViewport,
    interactiveTarget: () => interactiveTarget(document.querySelector(`[data-muxui-paired-case="${CSS.escape(id)}"]`)),
  };
  document.documentElement.style.setProperty('--muxui-migration-frame-background', migrationFrame.background[mode]);
}

App();
