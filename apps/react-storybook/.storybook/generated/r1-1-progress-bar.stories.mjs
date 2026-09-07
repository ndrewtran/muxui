// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:61430c0931537218601c9d61a09d36dd4f8fd69776c149fe5e6eca8ebf2031c9
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
      "maxValue": 100,
      "minValue": 0
    },
    "events": [],
    "parts": [
      "root",
      "label",
      "track",
      "fill"
    ],
    "props": [
      "value",
      "minValue",
      "maxValue",
      "label"
    ]
  },
  "binding": "muxui:component:progress-bar#web.react",
  "export": "ProgressBar",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-progress-bar",
  "states": [
    "idle",
    "progress",
    "indeterminate",
    "complete"
  ],
  "strategy": "direct",
  "tranche": "R1.1"
};
const record = { family: 'ProgressBar', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/ProgressBar',
  id: 'muxui-react-r1-1-progress-bar',
  component: MuxUI.ProgressBar,
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
        component: 'Private development showcase for the Mux UI-owned ProgressBar family.',
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
