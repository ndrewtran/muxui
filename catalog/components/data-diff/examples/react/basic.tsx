import * as React from 'react';
import { DataDiff } from '@muxui/react';

export function Example() {
  const [requested, setRequested] = React.useState<readonly string[]>([]);
  return <>
    <DataDiff label="Proposed menu cleanup" columns={[
      { id: 'flavor', label: 'Flavor' },
      { id: 'category', label: 'Category' },
      { id: 'supplier', label: 'Supplier' },
    ]} rows={[
      { id: 'rocky', label: 'Rocky Road', kind: 'removed', values: { flavor: 'Rocky Road', category: 'Classic', supplier: 'aurora-scoops' } },
      { id: 'bubblegum', label: 'Bubblegum', kind: 'removed', values: { flavor: 'Bubblegum', category: 'Retro', supplier: 'kumo-creamery' } },
      { id: 'mint', label: 'Mint Chip', kind: 'unchanged', values: { flavor: 'Mint Chip', category: 'Classic', supplier: 'maple-orbit' } },
      { id: 'pistachio', label: 'Pistachio', kind: 'added', values: { flavor: 'Pistachio', category: 'Seasonal', supplier: 'maple-orbit' } },
    ]} onApply={setRequested} />
    {requested.length > 0 && <p role="status">Requested {requested.length} selected changes.</p>}
  </>;
}
