// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:b1cae5dd86653d42099b993ba05cd371d79c270e6ad188f4115300848f8c3c08
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
      "allowDuplicates": false,
      "disabled": false,
      "invalid": false,
      "required": false,
      "size": "md",
      "tagPlacement": "inline"
    },
    "events": [
      "change",
      "tagAdded",
      "tagRemoved"
    ],
    "parts": [
      "root",
      "label",
      "group",
      "tag-wrapper",
      "tag-group",
      "tag-list",
      "tag",
      "input",
      "description",
      "error"
    ],
    "props": [
      "tagPlacement",
      "size",
      "placeholder",
      "value",
      "defaultValue",
      "label",
      "description",
      "errorMessage",
      "allowDuplicates",
      "maxTags",
      "validate",
      "disabled",
      "invalid",
      "required",
      "onChange",
      "onTagAdded",
      "onTagRemoved"
    ]
  },
  "binding": "muxui:component:input-tags#web.react",
  "export": "InputTags",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-input-tags",
  "states": [
    "inline",
    "below",
    "focused",
    "disabled",
    "invalid",
    "tag-focused"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'InputTags', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/InputTags',
  id: 'muxui-react-r1-6-input-tags',
  component: MuxUI.InputTags,
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
        component: 'Private development showcase for the Mux UI-owned InputTags family.',
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
