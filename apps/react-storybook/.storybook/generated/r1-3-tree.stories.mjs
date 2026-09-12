// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:a60e6a8811a544e3c97c5474f23f64349851ec021237f50483ccb076e8cfe7c7
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
      "selectionMode": "single"
    },
    "events": [
      "selectionChange",
      "expandedChange",
      "action"
    ],
    "parts": [
      "root",
      "item",
      "children"
    ],
    "props": [
      "aria-label",
      "aria-labelledby",
      "items",
      "selectedIds",
      "defaultSelectedIds",
      "expandedIds",
      "defaultExpandedIds",
      "disabled",
      "selectionMode"
    ]
  },
  "binding": "muxui:component:tree#web.react",
  "export": "Tree",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-tree",
  "states": [
    "idle",
    "focused",
    "disabled",
    "selected",
    "expanded",
    "empty"
  ],
  "strategy": "direct",
  "tranche": "R1.3"
};
const record = { family: 'Tree', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/Tree',
  id: 'muxui-react-r1-3-tree',
  component: MuxUI.Tree,
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
        component: 'Private development showcase for the Mux UI-owned Tree family.',
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
