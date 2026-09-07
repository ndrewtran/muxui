// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:59346ba30a8379a7ce081137d32946328513db23838e3735c377d8ac477c86a3
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
      "padding": "md",
      "pending": false,
      "variant": "outlined"
    },
    "events": [
      "activate"
    ],
    "parts": [
      "root",
      "button",
      "header",
      "body",
      "footer"
    ],
    "props": [
      "variant",
      "padding",
      "selected",
      "pending",
      "disabled",
      "onActivate"
    ]
  },
  "binding": "muxui:component:card#web.react",
  "export": "Card",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-card",
  "states": [
    "elevated",
    "outlined",
    "filled",
    "selected",
    "pending",
    "disabled",
    "focused"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'Card', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/Card',
  id: 'muxui-react-r1-6-card',
  component: MuxUI.Card,
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
        component: 'Private development showcase for the Mux UI-owned Card family.',
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
