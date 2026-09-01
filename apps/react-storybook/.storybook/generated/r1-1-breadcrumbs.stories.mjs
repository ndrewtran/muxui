// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:27e52cd33c7297edf7c93225718f609b3e908fa06b8b081e82a2b25c2e8ed4b0
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
      "aria-label": "Breadcrumbs",
      "items": []
    },
    "events": [
      "navigate"
    ],
    "parts": [
      "root",
      "list",
      "item",
      "link"
    ],
    "props": [
      "items",
      "aria-label"
    ]
  },
  "binding": "muxui:component:breadcrumbs#web.react",
  "export": "Breadcrumbs",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-breadcrumbs",
  "states": [
    "idle",
    "disabled",
    "current"
  ],
  "strategy": "direct"
};
const record = { family: 'Breadcrumbs', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/R1.1/Breadcrumbs',
  id: 'muxui-react-r1-1-breadcrumbs',
  component: MuxUI.Breadcrumbs,
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
        component: 'Private development showcase for the Mux UI-owned Breadcrumbs family.',
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
