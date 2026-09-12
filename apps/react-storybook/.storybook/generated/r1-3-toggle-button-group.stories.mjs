// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:3c62f1bea1f6112b3b57a8723532c49fb3027ab0c3353357b37e1712dc745526
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
      "disallowEmptySelection": false,
      "orientation": "horizontal",
      "selectionMode": "single"
    },
    "events": [
      "selectionChange"
    ],
    "parts": [
      "root",
      "button"
    ],
    "props": [
      "aria-label",
      "aria-labelledby",
      "selectedIds",
      "defaultSelectedIds",
      "selectionMode",
      "disabled",
      "orientation",
      "disallowEmptySelection",
      "size"
    ]
  },
  "binding": "muxui:component:toggle-button-group#web.react",
  "export": "ToggleButtonGroup",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-toggle-button-group",
  "states": [
    "idle",
    "focused",
    "disabled",
    "selected"
  ],
  "strategy": "direct",
  "tranche": "R1.3"
};
const record = { family: 'ToggleButtonGroup', tranche: 'R1.3', binding };

export default {
  title: 'Mux UI React/ToggleButtonGroup',
  id: 'muxui-react-r1-3-toggle-button-group',
  component: MuxUI.ToggleButtonGroup,
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
        component: 'Private development showcase for the Mux UI-owned ToggleButtonGroup family.',
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
