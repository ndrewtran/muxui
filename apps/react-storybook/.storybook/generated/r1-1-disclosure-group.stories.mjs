// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:b21131a5ebf09c57cc9d50bfb99164e5b7e4ed5d6f501e6d3bb346e8d789f3fc
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
  "strategy": "direct",
  "tranche": "R1.1"
};
const record = { family: 'DisclosureGroup', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/DisclosureGroup',
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
