// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:56a200535f4764919563b2ea34e216b9b994e3c773d20b233cbbd21b2eef5d51
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
import { Markdown as MarkdownSubpath } from '@muxui/react/markdown';

const binding = {
  "api": {
    "defaults": {},
    "events": [],
    "parts": [
      "root",
      "heading",
      "content",
      "link",
      "code"
    ],
    "props": [
      "source",
      "baseUrl",
      "invalidFallback"
    ]
  },
  "binding": "muxui:component:markdown#web.react",
  "export": "Markdown",
  "lifecycle": "experimental",
  "module": "./markdown",
  "runtimeProfile": "web.react",
  "selector": ".muxui-markdown",
  "states": [
    "idle",
    "invalid"
  ],
  "strategy": "direct",
  "subpath": "./markdown",
  "tranche": "R1.6"
};
const record = { family: 'Markdown', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/Markdown',
  id: 'muxui-react-r1-6-markdown',
  component: MarkdownSubpath,
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
        component: 'Private development showcase for the Mux UI-owned Markdown family.',
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
