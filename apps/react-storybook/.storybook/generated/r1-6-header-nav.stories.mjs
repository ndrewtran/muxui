// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:74067359b3f7a9ca33a48233c36865c6f4b4446e6df71569e8c9310914576f35
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
      "current": false
    },
    "events": [],
    "parts": [
      "root",
      "logo",
      "nav-button",
      "actions",
      "secondary",
      "mobile-trigger"
    ],
    "props": [
      "href",
      "current",
      "aria-label"
    ]
  },
  "binding": "muxui:component:header-nav#web.react",
  "export": "HeaderNav",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-header-nav",
  "states": [
    "desktop",
    "mobile",
    "current",
    "focused"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'HeaderNav', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/HeaderNav',
  id: 'muxui-react-r1-6-header-nav',
  component: MuxUI.HeaderNav,
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
        component: 'Private development showcase for the Mux UI-owned HeaderNav family.',
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
