// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:7228474d3f85ca6eec4e4e1e73e802e39c785736e5f8fe334e3df3d92504bb74
import * as MuxUI from '@muxui/react';
import {
  argTypesForBinding,
  controlledDefaultPairsForBinding,
  createAnatomyStory,
  createBrowserProofStory,
  createControlledStory,
  createEventsStory,
  createStory,
  createUncontrolledStory,
} from '../../src/storybook-factory.mjs';

const binding = {
  "api": {
    "defaults": {
      "current": false,
      "external": false,
      "hideBorder": false,
      "placeholder": "Search"
    },
    "events": [
      "change",
      "dismiss"
    ],
    "parts": [
      "root",
      "header",
      "search",
      "divider",
      "nav-list",
      "nav-item",
      "nav-button",
      "account-card",
      "account-menu",
      "mobile-trigger",
      "feature-card"
    ],
    "props": [
      "hideBorder",
      "href",
      "current",
      "external",
      "items",
      "badge",
      "icon",
      "placeholder",
      "value",
      "onChange",
      "name",
      "email",
      "avatarSrc",
      "status",
      "onDismiss"
    ]
  },
  "binding": "muxui:component:sidebar#web.react",
  "export": "Sidebar",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-sidebar",
  "states": [
    "desktop",
    "mobile",
    "current",
    "external",
    "expanded",
    "focused"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'Sidebar', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/Sidebar',
  id: 'muxui-react-r1-6-sidebar',
  component: MuxUI.Sidebar,
  tags: ['autodocs'],
  parameters: {
    controls: {
      include: binding.api.props,
    },
    muxuiApi: {
      props: binding.api.props,
      events: binding.api.events,
      parts: binding.api.parts,
      states: binding.states,
      controlled: controlledDefaultPairsForBinding(binding),
    },
    docs: {
      description: {
        component: 'Private development showcase for the Mux UI-owned Sidebar family.',
      },
    },
  },
  argTypes: argTypesForBinding(binding),
};
export const Default = createStory(record, 'default');
export const States = createStory(record, 'states');
export const Controlled = createControlledStory(record);
export const Uncontrolled = createUncontrolledStory(record);
export const Events = createEventsStory(record);
export const Anatomy = createAnatomyStory(record);
export const BrowserProof = createBrowserProofStory(record);
