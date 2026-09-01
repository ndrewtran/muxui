// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:e391a52094c95f5680784317a8fdc2831f632f83b7444d791ac0f65bab5775cd
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
      "checked": false,
      "defaultChecked": false,
      "disabled": false,
      "indeterminate": false,
      "invalid": false
    },
    "events": [
      "change"
    ],
    "parts": [
      "root",
      "input",
      "indicator",
      "label"
    ],
    "props": [
      "checked",
      "defaultChecked",
      "disabled",
      "indeterminate",
      "name",
      "required",
      "value",
      "invalid"
    ]
  },
  "binding": "muxui:component:checkbox#web.react",
  "export": "Checkbox",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-checkbox",
  "states": [
    "idle",
    "selected",
    "indeterminate",
    "disabled",
    "invalid"
  ],
  "strategy": "direct"
};
const record = { family: 'Checkbox', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/R1.1/Checkbox',
  id: 'muxui-react-r1-1-checkbox',
  component: MuxUI.Checkbox,
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
        component: 'Private development showcase for the Mux UI-owned Checkbox family.',
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
