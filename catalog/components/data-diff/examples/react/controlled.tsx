import * as React from 'react';
import { DataDiff } from '@muxui/react';

export function Example() {
  const [selectedIds, setSelectedIds] = React.useState<readonly string[]>(['spacing']);
  const [requested, setRequested] = React.useState<readonly string[]>([]);
  return <>
    <DataDiff label="Review token updates" description="Select the changes to request" columns={[
      { id: 'token', label: 'Token' },
      { id: 'uses', label: 'Uses' },
      { id: 'active', label: 'Active' },
    ]} rows={[
      { id: 'spacing', label: 'Spacing', kind: 'updated', before: { token: 'Spacing', uses: 0, active: false }, after: { token: 'Spacing', uses: 9, active: true } },
      { id: 'outline', label: 'Outline', kind: 'updated', before: { token: 'Outline', uses: null, active: false }, after: { token: 'Outline', uses: 4, active: true } },
      { id: 'border', label: 'Border', kind: 'unchanged', values: { token: 'Border', uses: 8, active: true } },
    ]} selectedIds={selectedIds} onSelectionChange={setSelectedIds} onApply={setRequested} />
    {requested.length > 0 && <p role="status">Requested: {requested.join(', ')}.</p>}
  </>;
}
