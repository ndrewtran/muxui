import { Sidebar } from '@muxui/react';

const icon = (path: string) => ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Folder = icon('M3 7h6l2 2h10v10H3z');
const Help = icon('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01');

const projects = ['Atlas', 'Beacon', 'Cedar', 'Delta', 'Ember', 'Fjord', 'Grove', 'Harbor', 'Iris', 'Juniper', 'Kestrel', 'Lumen'];

export function PinnedFooterSidebarExample() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--muxui-reference-dimension-space-s)', height: '20rem' }}>
      <Sidebar.Provider>
        <Sidebar.Root aria-label="Projects sidebar">
          <Sidebar.NavList navLabel="Projects">
            {projects.map((project) => (
              <Sidebar.NavItem key={project} href={`#${project.toLowerCase()}`} icon={Folder}>{project}</Sidebar.NavItem>
            ))}
          </Sidebar.NavList>
          {/* The foot stays in view below the scrolling list, open and folded. */}
          <Sidebar.Footer>
            <Sidebar.NavList>
              <Sidebar.NavItem href="#help" icon={Help}>Help</Sidebar.NavItem>
            </Sidebar.NavList>
          </Sidebar.Footer>
        </Sidebar.Root>
        <Sidebar.Toggle />
      </Sidebar.Provider>
    </div>
  );
}
