// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:649824fbb1d0a6ea780e65c3fc6c6feb1d211dd34f92298210abfde218590cf5
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
      "showTextWhileLoading": false,
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
      "showTextWhileLoading",
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
  "strategy": "direct",
  "tranche": "R1.1"
};
const record = { family: 'Button', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/Button',
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
  name: 'Variant × size',
  args: buttonMatrix.args,
  argTypes: buttonMatrix.argTypes,
  parameters: buttonMatrix.parameters,
  render: buttonMatrix.render,
};
