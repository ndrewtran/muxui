// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:a5c81932e172aba2a6540db4c05b09dfa8d0ab8b8c582f716c828389da70f3d0
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
      "type": "text"
    },
    "events": [
      "change"
    ],
    "parts": [
      "root",
      "label",
      "input",
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
      "disabled",
      "readOnly",
      "required",
      "invalid",
      "name",
      "placeholder",
      "type",
      "autoComplete",
      "autoFocus",
      "inputMode",
      "maxLength",
      "minLength",
      "pattern",
      "spellCheck"
    ]
  },
  "binding": "muxui:component:text-field#web.react",
  "export": "TextField",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-text-field",
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
const record = { family: 'TextField', tranche: 'R1.2', binding };

export default {
  title: 'Mux UI React/TextField',
  id: 'muxui-react-r1-2-text-field',
  component: MuxUI.TextField,
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
        component: 'Private development showcase for the Mux UI-owned TextField family.',
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
