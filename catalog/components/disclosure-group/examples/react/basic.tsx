import { Disclosure, DisclosureGroup } from '@muxui/react';

function TaskTitle({ label, path }: { label: string; path: string }) {
  return <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--muxui-component-disclosuregroup-label-gap)' }}>
    <span style={{ display: 'grid', placeItems: 'center', width: 'var(--muxui-component-disclosuregroup-icon-size)', flexShrink: 0 }}>
      <svg aria-hidden="true" style={{ width: 'var(--muxui-component-disclosuregroup-icon-size)', height: 'var(--muxui-component-disclosuregroup-icon-size)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
    {label}
  </span>;
}

export function BasicDisclosureGroupExample() {
  return <div style={{ width: '100%', maxWidth: '24rem' }}>
    <DisclosureGroup multiple={false} defaultExpandedIds={['calendar']}>
      <Disclosure id="brief" title={<TaskTitle label="Release brief" path="M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6" />}>
        Goals, owners, and the final scope for this release.
      </Disclosure>
      <Disclosure id="checklist" title={<TaskTitle label="Launch checklist" path="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z M8 12l3 3 5-6" />}>
        Review accessibility, quality checks, and launch readiness.
      </Disclosure>
      <Disclosure id="notes" title={<TaskTitle label="Campaign notes" path="M4 5h16v14H4z M8 9h8 M8 13h5" />}>
        Keep channel plans and launch messaging in one place.
      </Disclosure>
      <Disclosure id="calendar" title={<TaskTitle label="Rollout calendar" path="M5 5h14v15H5z M8 3v4 M16 3v4 M5 10h14 M9 14h2 M13 17h2" />}>
        Set the release window and coordinate the announcement across each channel.
      </Disclosure>
      <Disclosure id="build" title={<TaskTitle label="Ship build" path="m12 3 8 4v10l-8 4-8-4V7z M4 7l8 4 8-4 M12 11v10 M8 5l8 4" />}>
        Confirm the approved build and prepare the release handoff.
      </Disclosure>
      <Disclosure id="archive" title={<TaskTitle label="Archive assets" path="M3 3h18v5H3z M5 8v13h14V8 M10 12h4" />}>
        Save the final files and decisions for the next release.
      </Disclosure>
    </DisclosureGroup>
  </div>;
}
