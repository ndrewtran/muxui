// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:809599a24098c07598de46aa56f522be0ba98112e5490d24a5810aa35a38b0bf
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
      "size": "md",
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
      "popover",
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
      "size",
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
  "strategy": "direct",
  "tranche": "R1.2"
};
const record = { family: 'Autocomplete', tranche: 'R1.2', binding };

export default {
  title: 'Mux UI React/Autocomplete',
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