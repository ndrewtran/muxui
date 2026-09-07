// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:ed5b63a9e0db1483259d8bd07e9194658196d269cc35d1d92627f896f2a42e05
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
  "strategy": "direct",
  "tranche": "R1.4"
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
