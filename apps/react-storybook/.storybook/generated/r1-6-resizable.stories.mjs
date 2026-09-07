// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:0a8f308969e62be35e5fef54960754ae75dff49504deb9ca03ca08da266c9dfd
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
      "orientation": "horizontal",
      "precision": 4,
      "readOnly": false
    },
    "events": [
      "sizesChange",
      "sizesCommit"
    ],
    "parts": [
      "root",
      "panel",
      "handle"
    ],
    "props": [
      "sizes",
      "defaultSizes",
      "orientation",
      "disabled",
      "readOnly"
    ]
  },
  "binding": "muxui:component:resizable#web.react",
  "export": "Resizable",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-resizable",
  "states": [
    "idle",
    "disabled",
    "read-only",
    "invalid"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'Resizable', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/Resizable',
  id: 'muxui-react-r1-6-resizable',
  component: MuxUI.Resizable,
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
        component: 'Private development showcase for the Mux UI-owned Resizable family.',
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
