// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:4fef19f49b0385ed3eed81f047dadde0af081d847c681b3888ec306d97bc4ca2
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
      "defaultValue": "",
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
      "group",
      "input",
      "label",
      "description",
      "error",
      "card-icon"
    ],
    "props": [
      "value",
      "defaultValue",
      "disabled",
      "size",
      "invalid",
      "required",
      "readOnly",
      "onChange"
    ]
  },
  "binding": "muxui:component:payment-input#web.react",
  "export": "PaymentInput",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-payment-input",
  "states": [
    "empty",
    "visa",
    "mastercard",
    "amex",
    "discover",
    "unknown",
    "disabled",
    "invalid"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'PaymentInput', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/PaymentInput',
  id: 'muxui-react-r1-6-payment-input',
  component: MuxUI.PaymentInput,
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
        component: 'Private development showcase for the Mux UI-owned PaymentInput family.',
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
