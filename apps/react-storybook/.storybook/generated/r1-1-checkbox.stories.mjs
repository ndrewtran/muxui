// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:129e9b8a6bdab888d05e81535621d7ccdd12bd6cd96ff5685701ab94be5ed851
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
      "invalid": false,
      "size": "md"
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
      "size",
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
  "strategy": "direct",
  "tranche": "R1.1"
};
const record = { family: 'Checkbox', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/Checkbox',
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
