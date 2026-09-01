// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:507036c08d923f201db15a49d7c01e63ff7e51f82a7f75d997b7127bed71587d
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
      "remove",
      "action"
    ],
    "parts": [
      "root",
      "label",
      "list",
      "tag",
      "remove"
    ],
    "props": [
      "label",
      "aria-label",
      "aria-labelledby",
      "items",
      "disabled"
    ]
  },
  "binding": "muxui:component:tag-group#web.react",
  "export": "TagGroup",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-tag-group",
  "states": [
    "idle",
    "focused",
    "disabled",
    "empty"
  ],
  "strategy": "direct"
};
const record = { family: 'TagGroup', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/R1.3/TagGroup',
  id: 'muxui-react-r1-3-tag-group',
  component: MuxUI.TagGroup,
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
        component: 'Private development showcase for the Mux UI-owned TagGroup family.',
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
