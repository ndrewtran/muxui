import * as React from 'react';
import { DataDiff } from '@muxui/react';

export function Example() {
  const [selectedIds, setSelectedIds] = React.useState<readonly string[]>(['vanilla']);
  const [requested, setRequested] = React.useState<readonly string[]>([]);
  return <>
    <DataDiff label="Review stock updates" description="Select the changes to request" columns={[
      { id: 'flavor', label: 'Flavor' },
      { id: 'stock', label: 'Stock' },
      { id: 'available', label: 'Available' },
    ]} rows={[
      { id: 'vanilla', label: 'Vanilla', kind: 'updated', before: { flavor: 'Vanilla', stock: 0, available: false }, after: { flavor: 'Vanilla', stock: 12, available: true } },
      { id: 'chocolate', label: 'Chocolate', kind: 'updated', before: { flavor: 'Chocolate', stock: null, available: false }, after: { flavor: 'Chocolate', stock: 4, available: true } },
      { id: 'mint', label: 'Mint Chip', kind: 'unchanged', values: { flavor: 'Mint Chip', stock: 8, available: true } },
    ]} selectedIds={selectedIds} onSelectionChange={setSelectedIds} onApply={setRequested} />
    {requested.length > 0 && <p role="status">Requested: {requested.join(', ')}.</p>}
  </>;
}
