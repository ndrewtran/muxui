// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:52c47b02e115ec86bc5a2352bb8c51be2755a012ce2281d676ac42de8073eb80
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
import { TextEditor as TextEditorSubpath } from '@muxui/react/text-editor';

const binding = {
  "api": {
    "defaults": {
      "bubbleMenu": false,
      "disabled": false,
      "floating": false,
      "invalid": false,
      "readOnly": false,
      "required": false,
      "toolbar": "simple"
    },
    "events": [
      "change"
    ],
    "parts": [
      "root",
      "label",
      "toolbar",
      "content",
      "description",
      "hint",
      "error",
      "color-popup",
      "custom-color-field",
      "image-picker",
      "bubble-menu"
    ],
    "props": [
      "value",
      "defaultValue",
      "label",
      "description",
      "errorMessage",
      "disabled",
      "readOnly",
      "required",
      "invalid",
      "placeholder",
      "limit",
      "toolbar",
      "floating",
      "onGenerate",
      "onLinkRequest",
      "onImageRequest",
      "onColorRequest",
      "bubbleMenu"
    ]
  },
  "binding": "muxui:component:text-editor#web.react",
  "export": "TextEditor",
  "lifecycle": "experimental",
  "module": "./text-editor",
  "runtimeProfile": "web.react",
  "selector": ".muxui-text-editor",
  "states": [
    "idle",
    "focused",
    "disabled",
    "read-only",
    "required",
    "invalid",
    "color-open",
    "selection",
    "selection-collapsed"
  ],
  "strategy": "direct",
  "subpath": "./text-editor",
  "tranche": "R1.6"
};
const record = { family: 'TextEditor', tranche: 'R1.6', binding };

export default {
  title: 'Mux UI React/R1.6/TextEditor',
  id: 'muxui-react-r1-6-text-editor',
  component: TextEditorSubpath,
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
        component: 'Private development showcase for the Mux UI-owned TextEditor family.',
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
