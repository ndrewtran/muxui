// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:734b55287e3adc65b8b167e0a845d13fad526c976131bb9c7e2c4ec0c006cc73
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
      "defaultExpanded": false,
      "disabled": false,
      "expanded": false
    },
    "events": [
      "expandedChange"
    ],
    "parts": [
      "root",
      "trigger",
      "panel"
    ],
    "props": [
      "expanded",
      "defaultExpanded",
      "disabled",
      "id"
    ]
  },
  "binding": "muxui:component:disclosure#web.react",
  "export": "Disclosure",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-disclosure",
  "states": [
    "collapsed",
    "expanded",
    "disabled"
  ],
  "strategy": "direct",
  "tranche": "R1.1"
};
const record = { family: 'Disclosure', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/Disclosure',
  id: 'muxui-react-r1-1-disclosure',
  component: MuxUI.Disclosure,
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
        component: 'Private development showcase for the Mux UI-owned Disclosure family.',
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
