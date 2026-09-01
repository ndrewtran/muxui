// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:0e20d07328c16a19f6ad8e15929f31bd5785f2d3be9da1f5de6e901a1cb96e95
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
      "start",
      "end",
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
      "startName",
      "endName"
    ]
  },
  "binding": "muxui:component:date-range-picker#web.react",
  "export": "DateRangePicker",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-date-range-picker",
  "states": [
    "idle",
    "open",
    "disabled",
    "read-only",
    "required",
    "invalid"
  ],
  "strategy": "direct"
};
const record = { family: 'DateRangePicker', tranche: 'R1.2', binding };

export default {
  title: 'Mux UI React/R1.2/DateRangePicker',
  id: 'muxui-react-r1-2-date-range-picker',
  component: MuxUI.DateRangePicker,
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
        component: 'Private development showcase for the Mux UI-owned DateRangePicker family.',
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
