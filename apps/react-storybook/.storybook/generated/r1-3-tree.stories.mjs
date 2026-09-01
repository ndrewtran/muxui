// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:3d67a4bdf540ebc3d46d4432cbca017d4b608409596e52f653b149d95bdec45b
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
  "strategy": "direct"
};
const record = { family: 'Tree', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/R1.3/Tree',
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
