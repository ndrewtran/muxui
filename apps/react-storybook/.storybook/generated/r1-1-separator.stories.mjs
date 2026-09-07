// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:e2072d824843a171bf34061499cc2eb7463ed5e31b303c7c287f24bddcc859af
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
      "orientation": "horizontal"
    },
    "events": [],
    "parts": [
      "root"
    ],
    "props": [
      "orientation"
    ]
  },
  "binding": "muxui:component:separator#web.react",
  "export": "Separator",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-separator",
  "states": [
    "horizontal",
    "vertical"
  ],
  "strategy": "direct",
  "tranche": "R1.1"
};
const record = { family: 'Separator', tranche: 'R1.1', binding };

export default {
  title: 'Mux UI React/Separator',
  id: 'muxui-react-r1-1-separator',
  component: MuxUI.Separator,
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
        component: 'Private development showcase for the Mux UI-owned Separator family.',
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
