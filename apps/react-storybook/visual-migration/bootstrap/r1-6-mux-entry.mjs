import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import * as Mux from '@muxui/react';
import { Markdown } from '@muxui/react/markdown';
import { TextEditor } from '@muxui/react/text-editor';
import '@muxui/react/styles.css';
import { migrationFrame } from '../../src/visual-migration-contract.mjs';
import { actionForCurrentEntry, currentEntryForLocation, currentSceneFor, currentStyleFactsFor, initialOverlayReadyForCurrentEntry, lifecycleForCurrentEntry, stateReachedForCurrent } from './r1-6-current-scene.mjs';
import { renderR16MuxPlan } from './r1-6-mux-render-plan.mjs';

const h = React.createElement;
const createRoot = ReactDOMClient.createRoot ?? ReactDOMClient.default?.createRoot;
if (!createRoot) throw new Error('R1.6 Mux bootstrap could not resolve ReactDOM.createRoot');

function bindReducedMotionPreference() {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const apply = () => document.documentElement.toggleAttribute('data-reduced-motion', preference.matches);
  apply();
  preference.addEventListener?.('change', apply);
}

const packages = {
  AlertDialog: Mux.AlertDialog, Button: Mux.Button, ButtonGroup: Mux.ButtonGroup, Card: Mux.Card, CheckboxField: Mux.CheckboxField,
  ColorModeToggle: Mux.ColorModeToggle, CommandPalette: Mux.CommandPalette, HeaderNav: Mux.HeaderNav, InputTags: Mux.InputTags,
  Input: Mux.Input, Lightbox: { Root: Mux.Lightbox, Trigger: Mux.LightboxTrigger, Backdrop: Mux.LightboxBackdrop, Popup: Mux.LightboxPopup, Content: Mux.LightboxContent, Caption: Mux.LightboxCaption, Previous: Mux.LightboxPrevious, Next: Mux.LightboxNext, Close: Mux.LightboxClose },
  Markdown, MultiSelect: Mux.MultiSelect, PaymentInput: Mux.PaymentInput, ProgressCircle: Mux.ProgressCircle, RadioField: Mux.RadioField,
  RadioGroup: Mux.RadioGroup, Resizable: { Root: Mux.Resizable, Panel: Mux.ResizablePanel, Handle: Mux.ResizableHandle }, Sidebar: Mux.Sidebar,
  SwitchField: Mux.SwitchField, TagSelect: Mux.TagSelect, TextArea: Mux.TextArea, TextEditor,
};

function applyAction(entry, retry = 0) {
  const root = document.querySelector(`[data-muxui-paired-case="${CSS.escape(entry.id)}"]`);
  if (!root) return;
  const hasItemAction = typeof entry.action === 'object' && /__item\[data-key=/u.test(entry.action.selector ?? '');
  if (entry.component === 'MultiSelect' && (['open', 'filtered', 'empty', 'closing'].includes(entry.state) || hasItemAction)) {
    const trigger = root.querySelector('button');
    if (!trigger && hasItemAction && retry < 120) {
      requestAnimationFrame(() => applyAction(entry, retry + 1));
      return;
    }
    trigger?.click();
  }
  if (entry.component === 'TagSelect' && (['open', 'filtered', 'empty', 'closing'].includes(entry.state) || hasItemAction)) {
    const input = root.querySelector('input');
    if (!input && hasItemAction && retry < 120) {
      requestAnimationFrame(() => applyAction(entry, retry + 1));
      return;
    }
    if (input && hasItemAction) input.click();
    input?.focus();
  }
  if (entry.component === 'HeaderNav' && entry.state === 'mobile') root.querySelector('.muxui-header-nav__mobile-trigger')?.click();
  if (entry.component === 'Sidebar' && entry.state === 'mobile') root.querySelector('.muxui-sidebar__mobile-menu-btn')?.click();
}

function styleFacts(root, family, state, entry) {
  return currentStyleFactsFor(root, family, state, 'mux', entry);
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const entry = currentEntryForLocation(params);
  const mode = params.get('mode') === 'dark' ? 'dark' : 'light';
  if (entry.component === 'ColorModeToggle') {
    localStorage.setItem('muxui-color-mode', entry.state === 'dark' ? 'dark' : entry.state === 'light' ? 'light' : mode);
  }
  document.documentElement.dataset.muxuiColorScheme = mode;
  bindReducedMotionPreference();
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.background = migrationFrame.background[mode];
  const root = document.getElementById('root');
  if (!root) throw new Error('R1.6 Mux bootstrap is missing #root');
  root.style.width = `${migrationFrame.viewport.width}px`;
  root.style.boxSizing = 'content-box';
  root.style.padding = '0';
  const content = renderR16MuxPlan(entry, currentSceneFor(entry), { h, packages });
  createRoot(root).render(content);
  const selector = `[data-muxui-paired-case="${CSS.escape(entry.id)}"]`;
  window.__muxuiR16 = {
    entry,
    ready: () => Boolean(document.querySelector(selector)) && initialOverlayReadyForCurrentEntry(entry, 'mux'),
    state: () => stateReachedForCurrent(document.querySelector(selector), entry.state, entry, 'mux'),
    lifecycle: () => lifecycleForCurrentEntry(entry, 'mux'),
    styleFacts: () => styleFacts(document.querySelector(selector), entry.component, entry.state, entry),
    interactiveTarget: () => document.querySelector(`${selector} [data-muxui-action-target="true"], ${selector} button, ${selector} a[href], ${selector} input, ${selector} textarea, ${selector} [tabindex]:not([tabindex="-1"])`),
  };
  window.__coreMigration = window.__muxuiR16;
  requestAnimationFrame(() => requestAnimationFrame(() => applyAction(entry)));
}

App();

export { packages, renderR16MuxPlan };
