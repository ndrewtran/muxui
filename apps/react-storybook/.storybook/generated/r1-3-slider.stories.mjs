// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:06e25b9bd343ba2038f85ecaf99e592b2a32a17f0c238cca4ba2be61765a09ca
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
      "max": 100,
      "min": 0,
      "orientation": "horizontal",
      "readOnly": false,
      "step": 1
    },
    "events": [
      "change",
      "changeEnd"
    ],
    "parts": [
      "root",
      "label",
      "track",
      "thumb"
    ],
    "props": [
      "label",
      "aria-label",
      "aria-labelledby",
      "value",
      "defaultValue",
      "min",
      "max",
      "step",
      "disabled",
      "readOnly",
      "orientation"
    ]
  },
  "binding": "muxui:component:slider#web.react",
  "export": "Slider",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-slider",
  "states": [
    "idle",
    "focused",
    "disabled",
    "read-only",
    "selected"
  ],
  "strategy": "direct"
};
const record = { family: 'Slider', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/R1.3/Slider',
  id: 'muxui-react-r1-3-slider',
  component: MuxUI.Slider,
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
        component: 'Private development showcase for the Mux UI-owned Slider family.',
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
