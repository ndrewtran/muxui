// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:af87828766d9383df533f2d54a39b0f928d077b512f626fe25c05aaa9b6f79dc
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
      "required": false
    },
    "events": [
      "change"
    ],
    "parts": [
      "root",
      "button",
      "thumb",
      "description",
      "error"
    ],
    "props": [
      "checked",
      "defaultChecked",
      "name",
      "value",
      "disabled",
      "invalid",
      "required",
      "readOnly",
      "onChange"
    ]
  },
  "binding": "muxui:component:switch-field#web.react",
  "export": "SwitchField",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-switch-field",
  "states": [
    "unchecked",
    "checked",
    "disabled",
    "invalid",
    "focused"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'SwitchField', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/SwitchField',
  id: 'muxui-react-r1-6-switch-field',
  component: MuxUI.SwitchField,
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
        component: 'Private development showcase for the Mux UI-owned SwitchField family.',
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
