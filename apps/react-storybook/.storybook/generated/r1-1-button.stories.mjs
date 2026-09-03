// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:84fb7d0f7e335c82cd626a2a9a82d5973b72a3eca88f0adfb4a4af7db3558ff1
import * as MuxUI from '@muxui/react';
import {
  argTypesForBinding,
  controlledDefaultPairsForBinding,
  createAnatomyStory,
  createButtonMatrixStory,
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
      "pending": false,
      "size": "md",
      "tone": "default",
      "variant": "primary"
    },
    "events": [
      "activate"
    ],
    "parts": [
      "root",
      "label"
    ],
    "props": [
      "disabled",
      "pending",
      "variant",
      "tone",
      "size"
    ]
  },
  "binding": "muxui:component:button#web.react",
  "export": "Button",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-button",
  "states": [
    "idle",
    "pending",
    "disabled"
  ],
  "strategy": "direct"
};
const record = { family: 'Button', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/R1.1/Button',
  id: 'muxui-react-r1-1-button',
  component: MuxUI.Button,
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
        component: 'Private development showcase for the Mux UI-owned Button family.',
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
const buttonMatrix = createButtonMatrixStory(record);
export const Matrix = {
  name: 'Variant × tone × size',
  args: buttonMatrix.args,
  argTypes: buttonMatrix.argTypes,
  parameters: buttonMatrix.parameters,
  render: buttonMatrix.render,
};
