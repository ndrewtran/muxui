// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:1d9cf867605b9ac9e968c7d063df230583ddf00289f8093d2e5e16fa72fb40ce
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
      "invalid": false,
      "items": [],
      "required": false,
      "size": "md"
    },
    "events": [
      "selectionChange",
      "remove"
    ],
    "parts": [
      "root",
      "label",
      "combobox",
      "group",
      "tag",
      "tag-text",
      "tag-remove",
      "input",
      "listbox",
      "item",
      "description",
      "error"
    ],
    "props": [
      "items",
      "size",
      "selectedKeys",
      "defaultSelectedKeys",
      "getItemLabel",
      "label",
      "placeholder",
      "description",
      "errorMessage",
      "disabled",
      "invalid",
      "required",
      "onSelectionChange"
    ]
  },
  "binding": "muxui:component:tag-select#web.react",
  "export": "TagSelect",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-tag-select",
  "states": [
    "empty",
    "filtered",
    "selected",
    "disabled",
    "invalid",
    "focused"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'TagSelect', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/TagSelect',
  id: 'muxui-react-r1-6-tag-select',
  component: MuxUI.TagSelect,
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
        component: 'Private development showcase for the Mux UI-owned TagSelect family.',
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
