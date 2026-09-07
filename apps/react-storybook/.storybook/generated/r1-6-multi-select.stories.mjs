// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:5dc47e4927a60e9767bc321d339b31318ccd30d5cb591c673ec854899001c692
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
      "emptyStateDescription": "Please try a different search term.",
      "emptyStateTitle": "No results found",
      "invalid": false,
      "placeholder": "Select",
      "required": false,
      "showFooter": true,
      "showSearch": true,
      "size": "md"
    },
    "events": [
      "selectionChange",
      "reset",
      "selectAll"
    ],
    "parts": [
      "root",
      "label",
      "trigger",
      "value",
      "icon",
      "popup",
      "dialog",
      "search",
      "search-input",
      "listbox",
      "item",
      "empty",
      "footer"
    ],
    "props": [
      "items",
      "size",
      "selectedKeys",
      "defaultSelectedKeys",
      "onSelectionChange",
      "label",
      "placeholder",
      "description",
      "errorMessage",
      "supportingText",
      "showSearch",
      "showFooter",
      "emptyStateTitle",
      "emptyStateDescription",
      "onReset",
      "onSelectAll",
      "selectedCountFormatter",
      "disabled",
      "invalid",
      "required"
    ]
  },
  "binding": "muxui:component:multi-select#web.react",
  "export": "MultiSelect",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-multi-select",
  "states": [
    "closed",
    "open",
    "filtered",
    "empty",
    "selected",
    "disabled",
    "invalid"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'MultiSelect', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/MultiSelect',
  id: 'muxui-react-r1-6-multi-select',
  component: MuxUI.MultiSelect,
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
        component: 'Private development showcase for the Mux UI-owned MultiSelect family.',
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
