import { useState } from 'react';
import { Disclosure, DisclosureGroup } from '@muxui/react';

export function ControlledDisclosureGroupExample() {
  const [expandedIds, setExpandedIds] = useState<string[]>(['brief']);
  return (
    <div style={{ width: '100%', maxWidth: '24rem' }}>
      <DisclosureGroup multiple={false} expandedIds={expandedIds} onExpandedChange={setExpandedIds}>
        <Disclosure id="brief" title="Release brief">
          Goals, owners, and the final scope for this release.
        </Disclosure>
        <Disclosure id="checklist" title="Launch checklist">
          Review quality checks and launch readiness.
        </Disclosure>
        <Disclosure id="notes" title="Campaign notes">
          Keep channel plans and launch messaging in one place.
        </Disclosure>
      </DisclosureGroup>
      <p>Expanded: {expandedIds.length > 0 ? expandedIds.join(', ') : 'none'}</p>
    </div>
  );
}
