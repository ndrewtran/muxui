// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:fa51b1f2bef8db29fb23a63b1c7cef3dd73869218c2b75982af5e928ea5c4539
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
      "value": ""
    },
    "events": [
      "change",
      "select"
    ],
    "parts": [
      "root",
      "label",
      "input",
      "list"
    ],
    "props": [
      "label",
      "description",
      "errorMessage",
      "aria-label",
      "aria-labelledby",
      "value",
      "defaultValue",
      "disabled",
      "readOnly",
      "required",
      "invalid",
      "name",
      "items",
      "placeholder"
    ]
  },
  "binding": "muxui:component:autocomplete#web.react",
  "export": "Autocomplete",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-autocomplete",
  "states": [
    "idle",
    "focused",
    "disabled",
    "invalid"
  ],
  "strategy": "direct"
};
const record = { family: 'Autocomplete', tranche: 'R1.2', binding };

export default {
  title: 'Mux UI React/R1.2/Autocomplete',
  id: 'muxui-react-r1-2-autocomplete',
  component: MuxUI.Autocomplete,
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
        component: 'Private development showcase for the Mux UI-owned Autocomplete family.',
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
export const DisabledItemsInteraction = {
  name: 'Disabled items keyboard navigation',
  args: {
    label: 'Choose a city',
    items: [
      { id: 'disabled', label: 'Disabled', value: 'disabled', disabled: true },
      { id: 'enabled', label: 'Enabled', value: 'enabled' },
      { id: 'also-disabled', label: 'Also disabled', value: 'also-disabled', disabled: true },
    ],
  },
  render: (args) => createStory(record, 'default').render(args),
};