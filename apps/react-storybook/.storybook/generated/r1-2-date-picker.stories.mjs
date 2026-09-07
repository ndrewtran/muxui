// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:d7f25aa07f414e366332a2ecf33cee70b751f9870d5609362731ab6fd23f7140
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
      "input",
      "segment",
      "trigger",
      "calendar",
      "description",
      "error"
    ],
    "props": [
      "label",
      "description",
      "errorMessage",
      "aria-label",
      "aria-labelledby",
      "value",
      "defaultValue",
      "minValue",
      "maxValue",
      "unavailableDateMatcher",
      "open",
      "defaultOpen",
      "disabled",
      "readOnly",
      "required",
      "invalid",
      "name"
    ]
  },
  "binding": "muxui:component:date-picker#web.react",
  "export": "DatePicker",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-date-picker",
  "states": [
    "idle",
    "open",
    "disabled",
    "read-only",
    "required",
    "invalid"
  ],
  "strategy": "direct",
  "tranche": "R1.2"
};
const record = { family: 'DatePicker', tranche: 'R1.2', binding };

export default {
  title: 'Mux UI React/R1.2/DatePicker',
  id: 'muxui-react-r1-2-date-picker',
  component: MuxUI.DatePicker,
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
        component: 'Private development showcase for the Mux UI-owned DatePicker family.',
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
