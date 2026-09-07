// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:6b3c2ea5d864796d782d079bb09297d1bc4e584dbe7fb922ee2c208e583730b2
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
  "strategy": "direct",
  "tranche": "R1.3"
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
