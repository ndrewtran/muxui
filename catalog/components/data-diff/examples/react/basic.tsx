import * as React from 'react';
import { DataDiff } from '@muxui/react';

export function Example() {
  const [requested, setRequested] = React.useState<readonly string[]>([]);
  return <>
    <DataDiff label="Proposed token cleanup" columns={[
      { id: 'token', label: 'Token' },
      { id: 'group', label: 'Group' },
      { id: 'owner', label: 'Owner' },
    ]} rows={[
      { id: 'gutter', label: 'Gutter', kind: 'removed', values: { token: 'Gutter', group: 'Legacy', owner: 'design-team' } },
      { id: 'corner', label: 'Corner', kind: 'removed', values: { token: 'Corner', group: 'Legacy', owner: 'core-team' } },
      { id: 'border', label: 'Border', kind: 'unchanged', values: { token: 'Border', group: 'Surface', owner: 'core-team' } },
      { id: 'outline', label: 'Outline', kind: 'added', values: { token: 'Outline', group: 'Focus', owner: 'platform-team' } },
    ]} onApply={setRequested} />
    {requested.length > 0 && <p role="status">Requested {requested.length} selected changes.</p>}
  </>;
}
