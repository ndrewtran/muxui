import { Sidebar } from '@muxui/react';

const icon = (path: string) => ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Home = icon('M4 11l8-7 8 7v9H4z');
const Folder = icon('M3 7h6l2 2h10v10H3z');
const Note = icon('M6 3h9l3 3v15H6zM9 10h6M9 14h6');
const Book = icon('M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z');

export function CollapsibleSectionsSidebarExample() {
  return (
    <div style={{ width: '16rem', height: '28rem' }}>
      <Sidebar.Root aria-label="Workspace sidebar">
        {/* navLabel adds a navigation landmark around the list, named apart from other navigation on the page. */}
        <Sidebar.NavList navLabel="Workspace">
          <Sidebar.NavItem href="#home" icon={Home}>Home</Sidebar.NavItem>
          {/* A collapsible section starts open; its heading button shows and hides its rows. */}
          <Sidebar.Section label="Projects" collapsible>
            <Sidebar.NavItem
              href="#atlas"
              icon={Folder}
              defaultExpanded
              items={[
                { href: '#atlas-brief', label: 'Brief', icon: Note, current: true },
                { href: '#atlas-notes', label: 'Notes', icon: Note },
              ]}
            >
              Atlas
            </Sidebar.NavItem>
            <Sidebar.NavItem href="#beacon" icon={Folder}>Beacon</Sidebar.NavItem>
          </Sidebar.Section>
          <Sidebar.Section label="Resources" collapsible defaultExpanded={false}>
            <Sidebar.NavItem href="#guides" icon={Book}>Guides</Sidebar.NavItem>
            <Sidebar.NavItem href="#glossary" icon={Book}>Glossary</Sidebar.NavItem>
          </Sidebar.Section>
        </Sidebar.NavList>
      </Sidebar.Root>
    </div>
  );
}
