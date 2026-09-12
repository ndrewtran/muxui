import { Virtualizer } from '@muxui/react';
export function BasicVirtualizerExample() {
  return <Virtualizer aria-label="Project documents" items={Array.from({ length: 100 }, (_, index) => ({
    id: String(index + 1),
    label: `Document ${String(index + 1).padStart(3, '0')}`,
  }))} />;
}
