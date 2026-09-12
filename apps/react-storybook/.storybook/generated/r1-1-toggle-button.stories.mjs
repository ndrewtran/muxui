// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:c49377b67da0db5ab558f7963bdd6597288a6da403e92af2e3d25c2eec2bd7e5
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
      "defaultSelected": false,
      "disabled": false,
      "selected": false,
      "size": "md"
    },
    "events": [
      "change",
      "activate"
    ],
    "parts": [
      "root",
      "label"
    ],
    "props": [
      "selected",
      "defaultSelected",
      "disabled",
      "size"
    ]
  },
  "binding": "muxui:component:toggle-button#web.react",
  "export": "ToggleButton",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-toggle-button",
  "states": [
    "idle",
    "selected",
    "disabled",
    "pressed"
  ],
  "strategy": "direct",
  "tranche": "R1.1"
};
const record = { family: 'ToggleButton', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/ToggleButton',
  id: 'muxui-react-r1-1-toggle-button',
  component: MuxUI.ToggleButton,
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
        component: 'Private development showcase for the Mux UI-owned ToggleButton family.',
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
