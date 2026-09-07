// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:484e93b25c2e644620a10e3582dcd34b2790065c8ec37b635729c91df696638f
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
      "invalid": false,
      "readOnly": false,
      "required": false,
      "size": "md"
    },
    "events": [
      "change"
    ],
    "parts": [
      "root",
      "textarea",
      "label",
      "description",
      "error"
    ],
    "props": [
      "value",
      "defaultValue",
      "rows",
      "maxLength",
      "placeholder",
      "disabled",
      "invalid",
      "required",
      "readOnly",
      "size"
    ]
  },
  "binding": "muxui:component:text-area#web.react",
  "export": "TextArea",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-text-area",
  "states": [
    "empty",
    "filled",
    "disabled",
    "invalid",
    "focused"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'TextArea', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/TextArea',
  id: 'muxui-react-r1-6-text-area',
  component: MuxUI.TextArea,
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
        component: 'Private development showcase for the Mux UI-owned TextArea family.',
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
