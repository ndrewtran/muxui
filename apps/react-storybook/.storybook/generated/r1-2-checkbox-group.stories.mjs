// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:20b7f1d63aad4430c2743ab28b975dad23a1e4facc642ea4967593f9b58a3a01
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
      "orientation": "vertical",
      "readOnly": false,
      "required": false,
      "size": "md"
    },
    "events": [
      "change"
    ],
    "parts": [
      "root",
      "label",
      "description",
      "error",
      "options"
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
      "orientation",
      "size"
    ]
  },
  "binding": "muxui:component:checkbox-group#web.react",
  "export": "CheckboxGroup",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-checkbox-group",
  "states": [
    "idle",
    "disabled",
    "read-only",
    "required",
    "invalid"
  ],
  "strategy": "direct",
  "tranche": "R1.2"
};
const record = { family: 'CheckboxGroup', tranche: 'R1.2', binding };

export default {
  title: 'Mux UI React/CheckboxGroup',
  id: 'muxui-react-r1-2-checkbox-group',
  component: MuxUI.CheckboxGroup,
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
        component: 'Private development showcase for the Mux UI-owned CheckboxGroup family.',
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
