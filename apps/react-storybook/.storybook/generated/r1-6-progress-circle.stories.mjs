// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:ed71f62901f813bef67ce667beeb0246fac6b43c0b58dd2ffb556b13f44cbefb
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
      "minValue": 0,
      "size": "md",
      "value": null
    },
    "events": [],
    "parts": [
      "root",
      "track",
      "label",
      "value"
    ],
    "props": [
      "value",
      "minValue",
      "maxValue",
      "size",
      "label"
    ]
  },
  "binding": "muxui:component:progress-circle#web.react",
  "export": "ProgressCircle",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-progress-circle",
  "states": [
    "indeterminate",
    "zero",
    "partial",
    "complete",
    "sm",
    "md",
    "lg"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'ProgressCircle', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/ProgressCircle',
  id: 'muxui-react-r1-6-progress-circle',
  component: MuxUI.ProgressCircle,
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
        component: 'Private development showcase for the Mux UI-owned ProgressCircle family.',
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
