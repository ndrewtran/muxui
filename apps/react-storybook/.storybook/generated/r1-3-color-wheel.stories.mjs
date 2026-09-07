// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:3b3d386a8d5dc2b79370a406ccde3f4abb0f9af2d539e0f3d5f3abf728e0a8a7
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
      "innerRadius": 64,
      "outerRadius": 96,
      "readOnly": false
    },
    "events": [
      "change"
    ],
    "parts": [
      "root",
      "track",
      "thumb"
    ],
    "props": [
      "aria-label",
      "aria-labelledby",
      "value",
      "defaultValue",
      "outerRadius",
      "innerRadius",
      "readOnly",
      "disabled"
    ]
  },
  "binding": "muxui:component:color-wheel#web.react",
  "export": "ColorWheel",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-color-wheel",
  "states": [
    "idle",
    "focused",
    "disabled",
    "read-only"
  ],
  "strategy": "direct",
  "tranche": "R1.3"
};
const record = { family: 'ColorWheel', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/R1.3/ColorWheel',
  id: 'muxui-react-r1-3-color-wheel',
  component: MuxUI.ColorWheel,
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
        component: 'Private development showcase for the Mux UI-owned ColorWheel family.',
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
