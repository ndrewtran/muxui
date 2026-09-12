// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:b47bb275dba873faad958a224136285b2dba1c920779f866eb1d0e2b45acf0a4
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
      "storageKey": "muxui-color-mode"
    },
    "events": [
      "modeChange"
    ],
    "parts": [
      "root"
    ],
    "props": [
      "mode",
      "defaultMode",
      "storageKey",
      "disabled",
      "onModeChange"
    ]
  },
  "binding": "muxui:component:color-mode-toggle#web.react",
  "export": "ColorModeToggle",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-color-mode-toggle",
  "states": [
    "light",
    "dark",
    "disabled",
    "focused"
  ],
  "strategy": "direct",
  "tranche": "R1.6"
};
const record = { family: 'ColorModeToggle', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/ColorModeToggle',
  id: 'muxui-react-r1-6-color-mode-toggle',
  component: MuxUI.ColorModeToggle,
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
        component: 'Private development showcase for the Mux UI-owned ColorModeToggle family.',
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
