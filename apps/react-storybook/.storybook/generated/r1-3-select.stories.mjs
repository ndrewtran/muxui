// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:9d1c063783dcb61ee362e81b00e7c80b3aa7df7038d0aeda0c61415af832acdd
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
      "defaultOpen": false,
      "disabled": false,
      "invalid": false,
      "readOnly": false,
      "required": false
    },
    "events": [
      "change",
      "openChange"
    ],
    "parts": [
      "root",
      "label",
      "trigger",
      "list",
      "option"
    ],
    "props": [
      "label",
      "description",
      "errorMessage",
      "aria-label",
      "aria-labelledby",
      "items",
      "value",
      "defaultValue",
      "open",
      "defaultOpen",
      "disabled",
      "readOnly",
      "required",
      "invalid",
      "name",
      "placeholder"
    ]
  },
  "binding": "muxui:component:select#web.react",
  "export": "Select",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-select",
  "states": [
    "idle",
    "focused",
    "open",
    "disabled",
    "read-only",
    "invalid",
    "selected"
  ],
  "strategy": "direct",
  "tranche": "R1.3"
};
const record = { family: 'Select', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/Select',
  id: 'muxui-react-r1-3-select',
  component: MuxUI.Select,
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
        component: 'Private development showcase for the Mux UI-owned Select family.',
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
