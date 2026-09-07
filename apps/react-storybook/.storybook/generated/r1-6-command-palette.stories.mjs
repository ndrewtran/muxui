// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:99e5ab64a5f9a68c8eeacad76346c9a833f1b5c7288515afc6a8db61b50b030b
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
      "closeOnSelect": true,
      "defaultOpen": false,
      "disabled": false,
      "dismissable": true,
      "size": "md"
    },
    "events": [
      "openChange",
      "activate"
    ],
    "parts": [
      "root",
      "trigger",
      "backdrop",
      "popup",
      "title",
      "description",
      "close",
      "content",
      "search-field",
      "input",
      "clear-button",
      "listbox",
      "section",
      "section-header",
      "item",
      "separator",
      "item-icon",
      "item-content",
      "item-title",
      "item-description",
      "item-meta",
      "shortcut",
      "load-more-item",
      "empty",
      "footer",
      "chips",
      "chip",
      "chip-remove"
    ],
    "props": [
      "open",
      "defaultOpen",
      "onOpenChange",
      "size",
      "closeOnSelect",
      "dismissable",
      "disabled",
      "id",
      "title",
      "description",
      "href",
      "onActivate"
    ]
  },
  "binding": "muxui:component:command-palette#web.react",
  "export": "CommandPalette",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-command-palette",
  "states": [
    "closed",
    "open",
    "filtered",
    "empty",
    "disabled",
    "focused"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'CommandPalette', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/CommandPalette',
  id: 'muxui-react-r1-6-command-palette',
  component: MuxUI.CommandPalette,
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
        component: 'Private development showcase for the Mux UI-owned CommandPalette family.',
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
