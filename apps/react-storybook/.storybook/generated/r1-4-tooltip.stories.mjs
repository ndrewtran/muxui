// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:9ad626c15536a1fce2453bf064c02a81e0266249a18d5414a4871bdfd1b2198d
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
      "closeDelay": 0,
      "containerPadding": 12,
      "crossOffset": 0,
      "delay": 500,
      "disabled": false,
      "offset": 0,
      "placement": "top",
      "shouldFlip": true
    },
    "events": [
      "openChange"
    ],
    "parts": [
      "trigger",
      "tooltip"
    ],
    "props": [
      "content",
      "trigger",
      "delay",
      "closeDelay",
      "placement",
      "offset",
      "crossOffset",
      "shouldFlip",
      "containerPadding",
      "open",
      "defaultOpen",
      "disabled",
      "onOpenChange",
      "className"
    ]
  },
  "binding": "muxui:component:tooltip#web.react",
  "export": "Tooltip",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-tooltip",
  "states": [
    "closed",
    "opening",
    "open",
    "closing"
  ],
  "strategy": "direct",
  "tranche": "R1.4"
};
const record = { family: 'Tooltip', tranche: 'R1.4', binding };

export default {
  title: 'Mux UI React/R1.4/Tooltip',
  id: 'muxui-react-r1-4-tooltip',
  component: MuxUI.Tooltip,
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
        component: 'Private development showcase for the Mux UI-owned Tooltip family.',
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
