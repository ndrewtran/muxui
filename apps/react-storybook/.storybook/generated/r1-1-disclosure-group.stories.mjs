// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:82538195aa6d4faff3d9f94b2f4c2950077209410ded1911fdc86e1b4c83b913
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
      "defaultExpandedIds": [],
      "disabled": false,
      "expandedIds": [],
      "multiple": true
    },
    "events": [
      "expandedChange"
    ],
    "parts": [
      "root",
      "disclosure"
    ],
    "props": [
      "expandedIds",
      "defaultExpandedIds",
      "multiple",
      "disabled"
    ]
  },
  "binding": "muxui:component:disclosure-group#web.react",
  "export": "DisclosureGroup",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-disclosure-group",
  "states": [
    "idle",
    "expanded",
    "disabled"
  ],
  "strategy": "direct"
};
const record = { family: 'DisclosureGroup', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/R1.1/DisclosureGroup',
  id: 'muxui-react-r1-1-disclosure-group',
  component: MuxUI.DisclosureGroup,
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
        component: 'Private development showcase for the Mux UI-owned DisclosureGroup family.',
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
