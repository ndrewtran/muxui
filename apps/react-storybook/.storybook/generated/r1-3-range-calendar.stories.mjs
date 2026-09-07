// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:e608f246e99237aae3b77d062cc7ffde0d7d46e6ee1694a2dbc02c8501449b88
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
      "readOnly": false,
      "required": false
    },
    "events": [
      "change",
      "focusChange"
    ],
    "parts": [
      "root",
      "label",
      "grid",
      "cell"
    ],
    "props": [
      "label",
      "aria-label",
      "aria-labelledby",
      "value",
      "defaultValue",
      "focusedValue",
      "unavailableDateMatcher",
      "minValue",
      "maxValue",
      "disabled",
      "readOnly",
      "required",
      "invalid"
    ]
  },
  "binding": "muxui:component:range-calendar#web.react",
  "export": "RangeCalendar",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-range-calendar",
  "states": [
    "idle",
    "focused",
    "disabled",
    "read-only",
    "invalid",
    "selected"
  ],
  "strategy": "direct",
  "tranche": "R1.3"
};
const record = { family: 'RangeCalendar', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/RangeCalendar',
  id: 'muxui-react-r1-3-range-calendar',
  component: MuxUI.RangeCalendar,
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
        component: 'Private development showcase for the Mux UI-owned RangeCalendar family.',
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
