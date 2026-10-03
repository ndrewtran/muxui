// Clean-consumer smoke for the online install matrix. Run from the consumer:
// `node matrix-smoke.mjs '<package exports JSON>'`. Imports every public JS
// subpath, resolves every stylesheet subpath, and server-renders components.
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';

const exportsMap = JSON.parse(process.argv[2]);
const imported = [];
const resolved = [];
for (const subpath of Object.keys(exportsMap)) {
  const specifier = subpath === '.' ? '@muxui/react' : `@muxui/react/${subpath.slice(2)}`;
  if (subpath.endsWith('.css')) {
    await access(fileURLToPath(import.meta.resolve(specifier)));
    resolved.push(specifier);
    continue;
  }
  const module = await import(specifier);
  if (Object.keys(module).length === 0) throw new Error(`${specifier} exported nothing`);
  imported.push(specifier);
}
const { Button } = await import('@muxui/react');
const { TextEditor } = await import('@muxui/react/text-editor');
const button = renderToString(React.createElement(Button, null, 'Save'));
if (!button.includes('Save') || !button.includes('muxui-button')) throw new Error('Button SSR output');
const editor = renderToString(React.createElement(TextEditor, { 'aria-label': 'Notes', toolbar: 'advanced' }));
if (!editor.includes('muxui-text-editor')) throw new Error('TextEditor SSR output');
console.log(JSON.stringify({ imported, resolved, rendered: ['Button', 'TextEditor'] }));
