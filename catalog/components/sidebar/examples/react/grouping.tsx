import { Sidebar } from '@muxui/react';

const frame = { width: '14rem', height: '26rem' } as const;

export function GroupingSidebarExample() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-m)' }}>
      {/* Flat: every destination is one visible link. */}
      <div style={frame}>
        <Sidebar.Root aria-label="Flat workspace">
          <Sidebar.NavList>
            <Sidebar.NavItem href="#inbox">Inbox</Sidebar.NavItem>
            <Sidebar.NavItem href="#overview">Overview</Sidebar.NavItem>
            <Sidebar.NavItem href="#now" current>Roadmap: Now</Sidebar.NavItem>
            <Sidebar.NavItem href="#next">Roadmap: Next</Sidebar.NavItem>
            <Sidebar.NavItem href="#later">Roadmap: Later</Sidebar.NavItem>
            <Sidebar.NavItem href="#settings">Settings</Sidebar.NavItem>
          </Sidebar.NavList>
        </Sidebar.Root>
      </div>
      {/* Grouped: related secondary pages share one label, and the group holding the current page starts open. */}
      <div style={frame}>
        <Sidebar.Root aria-label="Grouped workspace">
          <Sidebar.NavList>
            <Sidebar.NavItem href="#inbox">Inbox</Sidebar.NavItem>
            <Sidebar.NavItem href="#overview">Overview</Sidebar.NavItem>
            <Sidebar.NavItem
              defaultExpanded
              items={[
                { href: '#now', label: 'Now', current: true },
                { href: '#next', label: 'Next' },
                { href: '#later', label: 'Later' },
              ]}
            >
              Roadmap
            </Sidebar.NavItem>
            <Sidebar.NavItem href="#settings">Settings</Sidebar.NavItem>
          </Sidebar.NavList>
        </Sidebar.Root>
      </div>
    </div>
  );
}
