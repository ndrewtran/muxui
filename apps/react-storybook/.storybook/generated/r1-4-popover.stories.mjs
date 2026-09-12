// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:e48dcad178c5f85a2ac4e041719f17e13ad0f4a4ede2771c06e31e87416a473a
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
      "containerPadding": 12,
      "crossOffset": 0,
      "defaultOpen": false,
      "dismissable": true,
      "offset": 8,
      "placement": "bottom",
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
      "open",
      "defaultOpen",
      "dismissable",
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
  "binding": "muxui:component:popover#web.react",
  "export": "Popover",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-popover",
  "states": [
    "closed",
    "open",
    "focused",
    "dismissed"
  ],
  "strategy": "direct",
  "tranche": "R1.4"
};
const record = { family: 'Popover', tranche: 'R1.4', binding };

export default {
  title: 'Mux UI React/Popover',
  id: 'muxui-react-r1-4-popover',
  component: MuxUI.Popover,
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
        component: 'Private development showcase for the Mux UI-owned Popover family.',
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
