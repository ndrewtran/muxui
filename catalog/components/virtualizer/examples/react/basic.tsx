import { Virtualizer } from '@muxui/react';
export function BasicVirtualizerExample() { return <Virtualizer aria-label="Results" items={Array.from({ length: 100 }, (_, id) => ({ id: String(id), label: String(id) }))} />; }
