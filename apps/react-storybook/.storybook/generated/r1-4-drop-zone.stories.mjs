// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:25a4cfc4de9158243e89916a80941ef5cb47fd676a28229ac113a5b254e05d3d
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
      "disabled": false
    },
    "events": [
      "drop",
      "activate"
    ],
    "parts": [
      "root",
      "content"
    ],
    "props": [
      "children",
      "disabled",
      "onDrop",
      "onActivate",
      "className",
      "aria-label",
      "aria-labelledby"
    ]
  },
  "binding": "muxui:component:drop-zone#web.react",
  "export": "DropZone",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-drop-zone",
  "states": [
    "idle",
    "drop-target",
    "focused",
    "disabled"
  ],
  "strategy": "direct"
};
const record = { family: 'DropZone', tranche: 'R1.4', binding };

export default {
  title: 'Mux UI React/R1.4/DropZone',
  id: 'muxui-react-r1-4-drop-zone',
  component: MuxUI.DropZone,
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
        component: 'Private development showcase for the Mux UI-owned DropZone family.',
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
