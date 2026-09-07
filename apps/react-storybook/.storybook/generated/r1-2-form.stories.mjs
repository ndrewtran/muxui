// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:9b440a3089a4dcb2898883c1b8de11c9d8ec1c7bcf10d88ff63128c504c67834
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
      "method": "get",
      "validationBehavior": "native"
    },
    "events": [
      "submit",
      "reset"
    ],
    "parts": [
      "root",
      "content"
    ],
    "props": [
      "validationBehavior",
      "validationErrors",
      "method",
      "action",
      "onSubmit",
      "onReset"
    ]
  },
  "binding": "muxui:component:form#web.react",
  "export": "Form",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-form",
  "states": [
    "idle",
    "submitting",
    "invalid"
  ],
  "strategy": "direct",
  "tranche": "R1.2"
};
const record = { family: 'Form', tranche: 'R1.2', binding };

export default {
  title: 'Mux UI React/Form',
  id: 'muxui-react-r1-2-form',
  component: MuxUI.Form,
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
        component: 'Private development showcase for the Mux UI-owned Form family.',
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
