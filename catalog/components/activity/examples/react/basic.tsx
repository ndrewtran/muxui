import * as React from 'react';
import { Activity, type ActivityStatus } from '@muxui/react';

export function Example() {
  const [status, setStatus] = React.useState<ActivityStatus>('failed');
  return <Activity label="Workspace checks" items={[
    { id: 'records', label: 'Verified vendor records', status: 'completed', meta: '12 suppliers', time: '4s', details: 'Matched all 12 contact records.' },
    { id: 'export', label: 'Read selected export', status, meta: '3 files', details: status === 'failed' ? 'The selected file could not be read.' : 'Request cancelled locally.', actions: status === 'failed' ? [{ id: 'cancel', label: 'Cancel request', onAction: () => setStatus('cancelled') }] : [] },
    { id: 'draft', label: 'Prepare reorder notes', status: 'queued', meta: '7 items' },
  ]} />;
}
