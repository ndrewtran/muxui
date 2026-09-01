// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:87931df5091e5f39bdf0e153204bdcec564059c85798a236800c73dc4f866ce1
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
      "closeDelay": 200,
      "containerPadding": 12,
      "crossOffset": 0,
      "defaultOpen": false,
      "delay": 600,
      "disabled": false,
      "offset": 8,
      "placement": "top",
      "shouldFlip": true
    },
    "events": [
      "openChange"
    ],
    "parts": [
      "trigger",
      "root",
      "content"
    ],
    "props": [
      "children",
      "trigger",
      "delay",
      "closeDelay",
      "open",
      "defaultOpen",
      "disabled",
      "placement",
      "offset",
      "crossOffset",
      "shouldFlip",
      "containerPadding",
      "onOpenChange",
      "className",
      "aria-label",
      "aria-labelledby"
    ]
  },
  "binding": "muxui:component:preview-trigger#web.react",
  "export": "PreviewTrigger",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-preview-trigger",
  "states": [
    "closed",
    "opening",
    "open",
    "closing"
  ],
  "strategy": "direct"
};
const record = { family: 'PreviewTrigger', tranche: 'R1.4', binding };

export default {
  title: 'Mux UI React/R1.4/PreviewTrigger',
  id: 'muxui-react-r1-4-preview-trigger',
  component: MuxUI.PreviewTrigger,
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
        component: 'Private development showcase for the Mux UI-owned PreviewTrigger family.',
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
