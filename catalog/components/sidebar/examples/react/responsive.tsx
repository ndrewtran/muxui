import { Sidebar } from '@muxui/react';

// One navigation fills the column and the drawer.
const navigation = (
  <Sidebar.NavList>
    <Sidebar.NavItem href="#inbox">Inbox</Sidebar.NavItem>
    <Sidebar.NavItem href="#overview" current>Overview</Sidebar.NavItem>
    <Sidebar.NavItem items={[{ href: '#now', label: 'Now' }, { href: '#next', label: 'Next' }]}>Roadmap</Sidebar.NavItem>
    <Sidebar.NavItem href="#settings">Settings</Sidebar.NavItem>
  </Sidebar.NavList>
);

export function ResponsiveSidebarExample() {
  return (
    <div className="sidebar-frame">
      {/* From 40rem wide the column shows; below it the header with a drawer shows. */}
      <style>{`
        .sidebar-frame {
          container-type: inline-size;
          inline-size: 100%;
        }

        .sidebar-layout {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          block-size: 20rem;
          overflow: hidden;
          border: 1px solid var(--muxui-semantic-border-default);
          border-radius: var(--muxui-semantic-shape-container-radius);
        }

        .sidebar-column {
          display: none;
        }

        .sidebar-content {
          padding: var(--muxui-semantic-layout-inset-large);
        }

        @container (min-width: 40rem) {
          .sidebar-layout {
            grid-template: minmax(0, 1fr) / 16rem minmax(0, 1fr);
          }

          .sidebar-column {
            display: flex;
          }

          .sidebar-mobile {
            display: none;
          }
        }
      `}</style>
      <Sidebar.Provider>
        <div className="sidebar-layout">
          <div className="sidebar-mobile">
            <Sidebar.MobileTrigger logo="Workspace">{navigation}</Sidebar.MobileTrigger>
          </div>
          <Sidebar.Root className="sidebar-column" aria-label="Workspace">{navigation}</Sidebar.Root>
          <section className="sidebar-content">Page content</section>
        </div>
      </Sidebar.Provider>
    </div>
  );
}
