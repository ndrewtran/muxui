// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:d3fd473813ab25e7d7473f8c7691eff8777802efda7208be334b1f60a7c640c8
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
      "readOnly": false
    },
    "events": [
      "change"
    ],
    "parts": [
      "root",
      "field",
      "area",
      "slider",
      "swatch"
    ],
    "props": [
      "value",
      "defaultValue",
      "disabled",
      "readOnly",
      "children"
    ]
  },
  "binding": "muxui:component:color-picker#web.react",
  "export": "ColorPicker",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-color-picker",
  "states": [
    "idle",
    "focused",
    "disabled",
    "read-only"
  ],
  "strategy": "direct",
  "tranche": "R1.3"
};
const record = { family: 'ColorPicker', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/R1.3/ColorPicker',
  id: 'muxui-react-r1-3-color-picker',
  component: MuxUI.ColorPicker,
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
        component: 'Private development showcase for the Mux UI-owned ColorPicker family.',
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
