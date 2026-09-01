// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:6a433343b73d82418bae8cd7708e37b991afec245935177dce6ecf3be467bf3f
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
      "height": 240,
      "itemHeight": 40,
      "overscan": 2
    },
    "events": [
      "scroll"
    ],
    "parts": [
      "root",
      "viewport",
      "item"
    ],
    "props": [
      "aria-label",
      "items",
      "height",
      "itemHeight",
      "overscan",
      "disabled"
    ]
  },
  "binding": "muxui:component:virtualizer#web.react",
  "export": "Virtualizer",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-virtualizer",
  "states": [
    "idle",
    "focused",
    "disabled",
    "empty"
  ],
  "strategy": "direct"
};
const record = { family: 'Virtualizer', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/R1.3/Virtualizer',
  id: 'muxui-react-r1-3-virtualizer',
  component: MuxUI.Virtualizer,
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
        component: 'Private development showcase for the Mux UI-owned Virtualizer family.',
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
