// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:232e621edf0e1da8559605dc23853f1caf472ec016fc48b238d32f33e99a6a7c
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
    "events": [],
    "parts": [
      "root",
      "button",
      "indicator",
      "dot",
      "description",
      "error"
    ],
    "props": [
      "size",
      "disabled",
      "invalid",
      "required",
      "readOnly",
      "value"
    ]
  },
  "binding": "muxui:component:radio-field#web.react",
  "export": "RadioField",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-radio-field",
  "states": [
    "unselected",
    "selected",
    "disabled",
    "invalid",
    "focused"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'RadioField', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/RadioField',
  id: 'muxui-react-r1-6-radio-field',
  component: MuxUI.RadioField,
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
        component: 'Private development showcase for the Mux UI-owned RadioField family.',
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
