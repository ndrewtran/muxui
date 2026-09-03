// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:7bb942574f8c749bc52527ac22341359945ecf2d98ca4c8d4012e96de46b7c8e
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
import React from 'react';
import { SizingNumberFieldExample } from './number-field-sizing.example.mjs';

const binding = {
  "api": {
    "defaults": {
      "disabled": false,
      "invalid": false,
      "readOnly": false,
      "required": false,
      "step": 1
    },
    "events": [
      "change"
    ],
    "parts": [
      "root",
      "label",
      "input",
      "decrement",
      "increment",
      "description",
      "error"
    ],
    "props": [
      "label",
      "description",
      "errorMessage",
      "aria-label",
      "aria-labelledby",
      "value",
      "defaultValue",
      "disabled",
      "readOnly",
      "required",
      "invalid",
      "minValue",
      "maxValue",
      "step",
      "name",
      "formatOptions"
    ]
  },
  "binding": "muxui:component:number-field#web.react",
  "export": "NumberField",
  "lifecycle": "experimental",
  "module": ".",
  "runtimeProfile": "web.react",
  "selector": ".muxui-number-field",
  "states": [
    "idle",
    "disabled",
    "read-only",
    "required",
    "invalid"
  ],
  "strategy": "direct"
};
const record = { family: 'NumberField', tranche: 'R1.2', binding };

export default {
  title: 'Mux UI React/R1.2/NumberField',
  id: 'muxui-react-r1-2-number-field',
  component: MuxUI.NumberField,
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
        component: 'Private development showcase for the Mux UI-owned NumberField family.',
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
export const Sizing = {
  name: 'Sizing',
  parameters: {
    docs: {
      source: {
        code: "import { NumberField } from '@muxui/react';\n\nexport function SizingNumberFieldExample() {\n  return (\n    <div className=\"muxui-number-field-sizing-example\">\n      <style>{`\n        .muxui-number-field-sizing-example {\n          display: flex;\n          flex-direction: column;\n          gap: 1rem;\n          width: 100%;\n        }\n\n        .muxui-number-field-sizing-case {\n          width: 100%;\n        }\n\n        .muxui-number-field-sizing-fixed {\n          --muxui-component-number-field-width: 12rem;\n        }\n\n        .muxui-number-field-sizing-full {\n          --muxui-component-number-field-width: 100%;\n        }\n      `}</style>\n      <div className=\"muxui-number-field-sizing-case\">\n        <NumberField label=\"Default fit-content\" defaultValue={1} />\n      </div>\n      <div className=\"muxui-number-field-sizing-case\">\n        <NumberField label=\"Fixed 12rem\" defaultValue={1} className=\"muxui-number-field-sizing-fixed\" />\n      </div>\n      <div className=\"muxui-number-field-sizing-case\">\n        <NumberField label=\"Full container width\" defaultValue={1} className=\"muxui-number-field-sizing-full\" />\n      </div>\n    </div>\n  );\n}\n",
        language: 'tsx',
      },
    },
  },
  render: () => React.createElement(SizingNumberFieldExample),
};
