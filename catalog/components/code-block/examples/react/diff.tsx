import { CodeBlock } from '@muxui/react';

export function Example() {
  return <CodeBlock mode="diff" filename="panel.ts" language="typescript"
    before={'export async function loadPanel() {\n  const panel = await workspace.read("inbox");\n  return panel.title;\n}'}
    after={'export async function loadPanel() {\n  const panel = await workspace.read("research");\n  if (!panel.visible) return null;\n  return panel.title;\n}'} />;
}
