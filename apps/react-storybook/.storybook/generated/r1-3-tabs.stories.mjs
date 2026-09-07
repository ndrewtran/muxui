// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:519828452ee3fdc8dc27b55da4b536827f21900b40ad39038e966284923053f5
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
      "keyboardActivation": "automatic",
      "orientation": "horizontal"
    },
    "events": [
      "change"
    ],
    "parts": [
      "root",
      "list",
      "tab",
      "panels",
      "panel"
    ],
    "props": [
      "aria-label",
      "aria-labelledby",
      "items",
      "value",
      "defaultValue",
      "keyboardActivation",
      "disabled",
      "orientation"
    ]
  },
  "binding": "muxui:component:tabs#web.react",
  "export": "Tabs",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-tabs",
  "states": [
    "idle",
    "focused",
    "disabled",
    "selected"
  ],
  "strategy": "direct",
  "tranche": "R1.3"
};
const record = { family: 'Tabs', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/Tabs',
  id: 'muxui-react-r1-3-tabs',
  component: MuxUI.Tabs,
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
        component: 'Private development showcase for the Mux UI-owned Tabs family.',
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
