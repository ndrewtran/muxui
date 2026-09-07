// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:16b1fe0a65ed4bf72bdb13616721265043da67e922fe58ac0017e9f8d86e483c
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
      "input",
      "label",
      "description",
      "error"
    ],
    "props": [
      "value",
      "defaultValue",
      "onChange",
      "type",
      "placeholder",
      "disabled",
      "invalid",
      "required",
      "readOnly",
      "size"
    ]
  },
  "binding": "muxui:component:input#web.react",
  "export": "Input",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-input",
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
const record = { family: 'Input', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/Input',
  id: 'muxui-react-r1-6-input',
  component: MuxUI.Input,
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
        component: 'Private development showcase for the Mux UI-owned Input family.',
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
