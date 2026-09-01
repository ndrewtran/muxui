// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:8d80e8acbc1749422f62477ec670c33ec980916e7301ac99c5992c57806c7831
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
      "duration": 5000,
      "variant": "neutral"
    },
    "events": [
      "dismiss"
    ],
    "parts": [
      "region",
      "toast",
      "title",
      "message",
      "dismiss"
    ],
    "props": [
      "message",
      "title",
      "variant",
      "duration",
      "onDismiss",
      "className"
    ]
  },
  "binding": "muxui:component:toast#web.react",
  "export": "Toast",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-toast",
  "states": [
    "visible",
    "timed",
    "dismissed"
  ],
  "strategy": "direct"
};
const record = { family: 'Toast', tranche: 'R1.4', binding };

export default {
  title: 'Mux UI React/R1.4/Toast',
  id: 'muxui-react-r1-4-toast',
  component: MuxUI.Toast,
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
        component: 'Private development showcase for the Mux UI-owned Toast family.',
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
