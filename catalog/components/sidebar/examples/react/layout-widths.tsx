import { useState } from 'react';
import { Sidebar } from '@muxui/react';

const icon = (path: string) => ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Home = icon('M4 11l8-7 8 7v9H4z');
const Folder = icon('M3 7h6l2 2h10v10H3z');

export function LayoutWidthsSidebarExample() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="sidebar-shell" data-folded={collapsed || undefined}>
      {/* The track reads the sidebar's published widths, plus its 1px edge, so the page beside it lines up without
          restating the rail's formula. The sidebar takes the page's ground and a quieter edge. */}
      <style>{`
        .sidebar-shell {
          display: grid;
          grid-template-columns: calc(var(--muxui-component-sidebar-open-size) + 1px) minmax(0, 1fr);
          block-size: 20rem;
          background: var(--muxui-semantic-surface-background);
        }

        .sidebar-shell[data-folded] {
          grid-template-columns: calc(var(--muxui-component-sidebar-rail-size) + 1px) minmax(0, 1fr);
        }

        .sidebar-shell-side {
          --muxui-component-sidebar-background: var(--muxui-semantic-surface-background);
          --muxui-component-sidebar-border-color: var(--muxui-semantic-border-default);
        }

        .sidebar-shell-page {
          padding: var(--muxui-semantic-layout-inset-large);
        }
      `}</style>
      <Sidebar.Provider collapsed={collapsed} onCollapsedChange={setCollapsed}>
        <Sidebar.Root aria-label="Workspace sidebar" className="sidebar-shell-side">
          <Sidebar.NavList navLabel="Workspace">
            <Sidebar.NavItem href="#home" icon={Home} current>Home</Sidebar.NavItem>
            <Sidebar.NavItem href="#projects" icon={Folder}>Projects</Sidebar.NavItem>
          </Sidebar.NavList>
        </Sidebar.Root>
        <div className="sidebar-shell-page">
          <Sidebar.Toggle />
        </div>
      </Sidebar.Provider>
    </div>
  );
}
