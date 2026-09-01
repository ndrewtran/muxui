// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:fe9589520c327b6d305b5a58746b3020e508c8d0df07bb8fe1f29dee1c70dc8a
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
      "acceptDirectory": false,
      "allowsMultiple": false,
      "disabled": false
    },
    "events": [
      "select"
    ],
    "parts": [
      "root",
      "input"
    ],
    "props": [
      "children",
      "acceptedFileTypes",
      "allowsMultiple",
      "acceptDirectory",
      "defaultCamera",
      "disabled",
      "onSelect",
      "className"
    ]
  },
  "binding": "muxui:component:file-trigger#web.react",
  "export": "FileTrigger",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-file-trigger",
  "states": [
    "idle",
    "focused",
    "disabled"
  ],
  "strategy": "direct"
};
const record = { family: 'FileTrigger', tranche: 'R1.4', binding };

export default {
  title: 'Mux UI React/R1.4/FileTrigger',
  id: 'muxui-react-r1-4-file-trigger',
  component: MuxUI.FileTrigger,
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
        component: 'Private development showcase for the Mux UI-owned FileTrigger family.',
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
