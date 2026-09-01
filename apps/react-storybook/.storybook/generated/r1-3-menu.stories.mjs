// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:045ee5405e219818c4e4f5b8bc74bc20ad97d7324267e45701b3f0f450f062e7
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
      "disabled": false,
      "shouldCloseOnSelect": true
    },
    "events": [
      "action",
      "select"
    ],
    "parts": [
      "root",
      "item"
    ],
    "props": [
      "aria-label",
      "aria-labelledby",
      "items",
      "disabled",
      "shouldCloseOnSelect"
    ]
  },
  "binding": "muxui:component:menu#web.react",
  "export": "Menu",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-menu",
  "states": [
    "idle",
    "focused",
    "disabled",
    "open"
  ],
  "strategy": "direct"
};
const record = { family: 'Menu', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/R1.3/Menu',
  id: 'muxui-react-r1-3-menu',
  component: MuxUI.Menu,
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
        component: 'Private development showcase for the Mux UI-owned Menu family.',
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
