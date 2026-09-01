// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:6110994d7b5def4bdea965557c57c9bb87965334ac8f4d0a0ee6ee54352383f1
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
      "disabled": false
    },
    "events": [],
    "parts": [
      "root"
    ],
    "props": [
      "color",
      "disabled"
    ]
  },
  "binding": "muxui:component:color-swatch#web.react",
  "export": "ColorSwatch",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-color-swatch",
  "states": [
    "idle",
    "disabled"
  ],
  "strategy": "direct"
};
const record = { family: 'ColorSwatch', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/R1.3/ColorSwatch',
  id: 'muxui-react-r1-3-color-swatch',
  component: MuxUI.ColorSwatch,
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
        component: 'Private development showcase for the Mux UI-owned ColorSwatch family.',
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
