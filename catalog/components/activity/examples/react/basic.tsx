import * as React from 'react';
import { Activity, type ActivityStatus } from '@muxui/react';

export function Example() {
  const [status, setStatus] = React.useState<ActivityStatus>('failed');
  return <Activity label="Workspace checks" items={[
    { id: 'tokens', label: 'Checked the theme tokens', status: 'completed', meta: '24 tokens', time: '5s', details: 'All 24 tokens resolved.' },
    { id: 'report', label: 'Open the selected report', status, meta: '4 pages', details: status === 'failed' ? 'The selected file could not be read.' : 'Request cancelled locally.', actions: status === 'failed' ? [{ id: 'cancel', label: 'Cancel request', onAction: () => setStatus('cancelled') }] : [] },
    { id: 'notes', label: 'Prepare the release notes', status: 'queued', meta: '6 sections' },
  ]} />;
}
