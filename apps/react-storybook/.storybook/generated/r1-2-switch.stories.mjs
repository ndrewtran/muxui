// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:6aed5d8dd50c4ab44dbf7e9ca5e1d9cc40acb3f0ef10ee556b940023672bcdb9
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
      "invalid": false,
      "readOnly": false,
      "required": false,
      "selected": false
    },
    "events": [
      "change"
    ],
    "parts": [
      "root",
      "input",
      "indicator",
      "label",
      "description",
      "error"
    ],
    "props": [
      "label",
      "description",
      "errorMessage",
      "aria-label",
      "aria-labelledby",
      "selected",
      "defaultSelected",
      "disabled",
      "readOnly",
      "required",
      "invalid",
      "name",
      "value"
    ]
  },
  "binding": "muxui:component:switch#web.react",
  "export": "Switch",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-switch",
  "states": [
    "idle",
    "selected",
    "disabled",
    "read-only",
    "required",
    "invalid"
  ],
  "strategy": "direct"
};
const record = { family: 'Switch', tranche: 'R1.2', binding };

export default {
  title: 'Mux UI React/R1.2/Switch',
  id: 'muxui-react-r1-2-switch',
  component: MuxUI.Switch,
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
        component: 'Private development showcase for the Mux UI-owned Switch family.',
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
