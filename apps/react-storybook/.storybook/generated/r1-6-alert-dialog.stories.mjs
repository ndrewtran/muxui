// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:a184a9c091a61b34b7029acc5ebf08f1f14110a6d315570a14f95c5cd95a9e10
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
      "disabled": false
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
      "content",
      "title",
      "description",
      "actions",
      "close"
    ],
    "props": [
      "open",
      "defaultOpen",
      "onOpenChange",
      "disabled",
      "onActivate"
    ]
  },
  "binding": "muxui:component:alert-dialog#web.react",
  "export": "AlertDialog",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-alert-dialog",
  "states": [
    "closed",
    "open",
    "focused",
    "disabled"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'AlertDialog', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/AlertDialog',
  id: 'muxui-react-r1-6-alert-dialog',
  component: MuxUI.AlertDialog,
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
        component: 'Private development showcase for the Mux UI-owned AlertDialog family.',
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
