// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:5e3fc711e556d48933a8c6f596b462aeb680c667a2111fc0b69f5afb7f359b7d
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
      "attached": false,
      "disabled": false,
      "orientation": "horizontal"
    },
    "events": [],
    "parts": [
      "root"
    ],
    "props": [
      "orientation",
      "attached",
      "disabled",
      "aria-label",
      "aria-labelledby"
    ]
  },
  "binding": "muxui:component:button-group#web.react",
  "export": "ButtonGroup",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-button-group",
  "states": [
    "horizontal",
    "vertical",
    "attached",
    "disabled"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'ButtonGroup', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/ButtonGroup',
  id: 'muxui-react-r1-6-button-group',
  component: MuxUI.ButtonGroup,
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
        component: 'Private development showcase for the Mux UI-owned ButtonGroup family.',
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
