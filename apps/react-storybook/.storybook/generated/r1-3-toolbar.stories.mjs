// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:8c39b8891b6a6bab24e5268538059b0b759b1a1a6f31d1fb6ab296f90df88f13
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
      "orientation": "horizontal"
    },
    "events": [],
    "parts": [
      "root",
      "control"
    ],
    "props": [
      "aria-label",
      "aria-labelledby",
      "orientation"
    ]
  },
  "binding": "muxui:component:toolbar#web.react",
  "export": "Toolbar",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-toolbar",
  "states": [
    "idle",
    "focused"
  ],
  "strategy": "direct"
};
const record = { family: 'Toolbar', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/R1.3/Toolbar',
  id: 'muxui-react-r1-3-toolbar',
  component: MuxUI.Toolbar,
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
        component: 'Private development showcase for the Mux UI-owned Toolbar family.',
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
