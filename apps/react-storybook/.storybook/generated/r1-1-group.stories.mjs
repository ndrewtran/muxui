// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:27de4cc5c6d0ba26fe7c40bf1cb97db30614c602c0f2f59b482c2e263dd3ba67
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
      "role": "group"
    },
    "events": [],
    "parts": [
      "root",
      "label",
      "content"
    ],
    "props": [
      "disabled",
      "invalid",
      "readOnly",
      "role",
      "aria-label"
    ]
  },
  "binding": "muxui:component:group#web.react",
  "export": "Group",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-group",
  "states": [
    "idle",
    "disabled",
    "invalid",
    "read-only"
  ],
  "strategy": "direct"
};
const record = { family: 'Group', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/R1.1/Group',
  id: 'muxui-react-r1-1-group',
  component: MuxUI.Group,
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
        component: 'Private development showcase for the Mux UI-owned Group family.',
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
