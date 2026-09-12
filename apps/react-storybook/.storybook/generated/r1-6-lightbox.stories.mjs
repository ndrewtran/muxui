// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:180330b3bd9ed81a2c6607c46b0454e56a058fb6958e48df791e7b5b5a15c0b2
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
      "defaultOpen": false,
      "loop": false,
      "swipeNavigation": true
    },
    "events": [
      "selectedChange",
      "openChange"
    ],
    "parts": [
      "root",
      "trigger",
      "backdrop",
      "popup",
      "content",
      "caption",
      "previous",
      "next",
      "close"
    ],
    "props": [
      "items",
      "selectedKey",
      "defaultSelectedKey",
      "open",
      "defaultOpen",
      "loop",
      "swipeNavigation"
    ]
  },
  "binding": "muxui:component:lightbox#web.react",
  "export": "Lightbox",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-lightbox",
  "states": [
    "closed",
    "open",
    "disabled"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'Lightbox', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/Lightbox',
  id: 'muxui-react-r1-6-lightbox',
  component: MuxUI.Lightbox,
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
        component: 'Private development showcase for the Mux UI-owned Lightbox family.',
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
