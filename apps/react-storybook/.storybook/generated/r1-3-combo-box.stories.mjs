// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:b5b1fd3b58297688822629970c32bea4f3eff27a0f4e35b2e44278130a1f188c
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
      "change",
      "select"
    ],
    "parts": [
      "root",
      "label",
      "input",
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
      "selectedId",
      "defaultSelectedId",
      "disabled",
      "size",
      "readOnly",
      "required",
      "invalid",
      "name",
      "placeholder"
    ]
  },
  "binding": "muxui:component:combo-box#web.react",
  "export": "ComboBox",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-combo-box",
  "states": [
    "idle",
    "focused",
    "open",
    "disabled",
    "read-only",
    "invalid"
  ],
  "strategy": "direct",
  "tranche": "R1.3"
};
const record = { family: 'ComboBox', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/ComboBox',
  id: 'muxui-react-r1-3-combo-box',
  component: MuxUI.ComboBox,
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
        component: 'Private development showcase for the Mux UI-owned ComboBox family.',
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
