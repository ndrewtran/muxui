// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:4753c87f85b1355bc118e3841c4855b7a51dfd15f52a58bfd559dd006ad4c3ed
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
      "defaultSelected": false,
      "disabled": false,
      "selected": false,
      "size": "md"
    },
    "events": [
      "change",
      "activate"
    ],
    "parts": [
      "root",
      "label"
    ],
    "props": [
      "selected",
      "defaultSelected",
      "disabled",
      "size"
    ]
  },
  "binding": "muxui:component:toggle-button#web.react",
  "export": "ToggleButton",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-toggle-button",
  "states": [
    "idle",
    "selected",
    "disabled",
    "pressed"
  ],
  "strategy": "direct",
  "tranche": "R1.1"
};
const record = { family: 'ToggleButton', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/R1.1/ToggleButton',
  id: 'muxui-react-r1-1-toggle-button',
  component: MuxUI.ToggleButton,
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
        component: 'Private development showcase for the Mux UI-owned ToggleButton family.',
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
