// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:fc56cba7e340b81e4eeb0d10e60f3055b637d563d998e719de855013da6b95ba
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
      "value": 0
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
      "label",
      "formatOptions"
    ]
  },
  "binding": "muxui:component:meter#web.react",
  "export": "Meter",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-meter",
  "states": [
    "idle"
  ],
  "strategy": "direct",
  "tranche": "R1.1"
};
const record = { family: 'Meter', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/R1.1/Meter',
  id: 'muxui-react-r1-1-meter',
  component: MuxUI.Meter,
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
        component: 'Private development showcase for the Mux UI-owned Meter family.',
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
