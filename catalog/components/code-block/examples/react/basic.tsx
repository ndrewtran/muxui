import { CodeBlock } from '@muxui/react';

export function Example() {
  return <CodeBlock filename="panel.ts" language="typescript" source={'export async function loadPanel() {\n  const panel = await workspace.read("research");\n  if (!panel.visible) return null;\n  return panel.title;\n}'} />;
}
