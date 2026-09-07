// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:131da5e6389430a43575e9b01c3ff41087261adebdd08fcfc69b6edd325eb1e5
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
      "button",
      "indicator",
      "description",
      "error"
    ],
    "props": [
      "checked",
      "defaultChecked",
      "indeterminate",
      "name",
      "value",
      "size",
      "disabled",
      "invalid",
      "required",
      "readOnly",
      "onChange"
    ]
  },
  "binding": "muxui:component:checkbox-field#web.react",
  "export": "CheckboxField",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-checkbox-field",
  "states": [
    "unchecked",
    "checked",
    "indeterminate",
    "disabled",
    "invalid",
    "focused"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'CheckboxField', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/CheckboxField',
  id: 'muxui-react-r1-6-checkbox-field',
  component: MuxUI.CheckboxField,
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
        component: 'Private development showcase for the Mux UI-owned CheckboxField family.',
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
