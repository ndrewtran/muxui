// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:d01d12d45b6672caba84f56a0d1e3e51130da4c26ed535d0dcb4be120c8263c5
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
      "channel": "red",
      "disabled": false,
      "orientation": "horizontal",
      "readOnly": false
    },
    "events": [
      "change"
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
      "channel",
      "colorSpace",
      "disabled",
      "readOnly",
      "orientation"
    ]
  },
  "binding": "muxui:component:color-slider#web.react",
  "export": "ColorSlider",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-color-slider",
  "states": [
    "idle",
    "focused",
    "disabled",
    "read-only"
  ],
  "strategy": "direct",
  "tranche": "R1.3"
};
const record = { family: 'ColorSlider', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/R1.3/ColorSlider',
  id: 'muxui-react-r1-3-color-slider',
  component: MuxUI.ColorSlider,
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
        component: 'Private development showcase for the Mux UI-owned ColorSlider family.',
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
