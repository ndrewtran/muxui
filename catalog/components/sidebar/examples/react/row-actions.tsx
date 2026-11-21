import { useState } from 'react';
import { IconButton, Sidebar } from '@muxui/react';

const icon = (path: string) => ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Folder = icon('M3 7h6l2 2h10v10H3z');
const Pin = icon('M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3z');

const projects = ['Atlas', 'Beacon', 'Cedar', 'Delta', 'Ember'];

export function RowActionsSidebarExample() {
  const [pinned, setPinned] = useState(['Atlas', 'Beacon']);
  const togglePin = (project: string) => setPinned((list) => (list.includes(project) ? list.filter((name) => name !== project) : [...list, project]));
  // Each row's Pin is its own control after the link, named for its row, so it is reachable without hover.
  const row = (project: string) => (
    <Sidebar.NavItem
      key={project}
      href={`#${project.toLowerCase()}`}
      icon={Folder}
      action={
        <IconButton size="sm" aria-label={`${pinned.includes(project) ? 'Unpin' : 'Pin'} ${project}`} onActivate={() => togglePin(project)}>
          <Pin />
        </IconButton>
      }
    >
      {project}
    </Sidebar.NavItem>
  );
  const pinnedRows = projects.filter((project) => pinned.includes(project));
  const otherRows = projects.filter((project) => !pinned.includes(project));

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--muxui-reference-dimension-space-s)', height: '24rem' }}>
      <Sidebar.Provider>
        <Sidebar.Root aria-label="Projects sidebar">
          <Sidebar.NavList>
            <Sidebar.Section label="Projects">
              {pinnedRows.map(row)}
              {/* The break is a list item hidden from assistive technology, so the list stays a list of rows. */}
              {pinnedRows.length > 0 && otherRows.length > 0 && <Sidebar.NavDivider />}
              {otherRows.map(row)}
            </Sidebar.Section>
          </Sidebar.NavList>
        </Sidebar.Root>
        <Sidebar.Toggle />
      </Sidebar.Provider>
    </div>
  );
}
