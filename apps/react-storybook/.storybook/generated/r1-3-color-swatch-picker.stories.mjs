// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:f2b385747e4c59edd7d059099905b2eb966258a2486a0bb3dce1adb07bab5fd7
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
      "swatch",
      "selection"
    ],
    "props": [
      "aria-label",
      "aria-labelledby",
      "items",
      "value",
      "defaultValue",
      "disabled",
      "readOnly"
    ]
  },
  "binding": "muxui:component:color-swatch-picker#web.react",
  "export": "ColorSwatchPicker",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-color-swatch-picker",
  "states": [
    "idle",
    "focused",
    "disabled",
    "selected"
  ],
  "strategy": "direct",
  "tranche": "R1.3"
};
const record = { family: 'ColorSwatchPicker', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/ColorSwatchPicker',
  id: 'muxui-react-r1-3-color-swatch-picker',
  component: MuxUI.ColorSwatchPicker,
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
        component: 'Private development showcase for the Mux UI-owned ColorSwatchPicker family.',
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
