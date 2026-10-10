import { useId } from 'react';
import { Avatar, Breadcrumbs, Menu, Sidebar, Text } from '@muxui/react';

// One stroke path per icon.
const icon = (path: string) => ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Inbox = icon('M4 13l2-8h12l2 8v6H4zM4 13h5l1 2h4l1-2h5');
const Updates = icon('M6 17h12l-2-3v-4a4 4 0 0 0-8 0v4zM10 20h4');
const Saved = icon('M6 4h12v16l-6-4-6 4z');
const Overview = icon('M4 4h16v16H4zM4 9h16M9 9v11');
const Roadmap = icon('M5 21V4M5 5h12l-2 4 2 4H5');
const Reviews = icon('M4 4h16v16H4zM8 12l3 3 5-6');
const Files = icon('M3 6h6l2 2h10v11H3z');
const Reports = icon('M5 20V10M12 20V4M19 20v-7');
const Settings = icon('M4 8h9M17 8h3M4 16h3M11 16h9M15 5v6M9 13v6');
const Switch = icon('m7 15 5 5 5-5M7 9l5-5 5 5');

// One navigation fills the column and the drawer.
const navigation = (
  <>
    <Sidebar.Header>
      <Menu.Root>
        <Menu.Trigger className="workspace-switcher">
          <Avatar.Root size="sm" aria-hidden="true"><Avatar.Fallback>S</Avatar.Fallback></Avatar.Root>
          Sample workspace
          <Switch />
        </Menu.Trigger>
        <Menu.Popup>
          <Menu.List items={['Sample workspace', 'Example team']} />
        </Menu.Popup>
      </Menu.Root>
      <Sidebar.Search />
    </Sidebar.Header>
    <nav className="workspace-links" aria-label="Workspace links">
      <Sidebar.NavList>
        <Sidebar.NavItem href="#inbox" icon={Inbox} badge="3">Inbox</Sidebar.NavItem>
        <Sidebar.NavItem href="#updates" icon={Updates}>Updates</Sidebar.NavItem>
        <Sidebar.NavItem href="#saved" icon={Saved}>Saved</Sidebar.NavItem>
        <Sidebar.Section label="Projects">
          <Sidebar.NavItem href="#overview" icon={Overview} current>Overview</Sidebar.NavItem>
          <Sidebar.NavItem icon={Roadmap} items={[{ href: '#now', label: 'Now' }, { href: '#next', label: 'Next' }, { href: '#later', label: 'Later' }]}>Roadmap</Sidebar.NavItem>
          <Sidebar.NavItem href="#reviews" icon={Reviews} badge="12">Reviews</Sidebar.NavItem>
          <Sidebar.NavItem href="#files" icon={Files}>Files</Sidebar.NavItem>
          <Sidebar.NavItem icon={Reports} items={[{ href: '#weekly', label: 'Weekly' }, { href: '#quarterly', label: 'Quarterly' }]}>Reports</Sidebar.NavItem>
          <Sidebar.NavItem href="#settings" icon={Settings}>Settings</Sidebar.NavItem>
        </Sidebar.Section>
      </Sidebar.NavList>
    </nav>
    <Sidebar.AccountCard name="Sample user" email="sample@example.com" />
  </>
);

export function WorkspaceNavigationFoldableExample() {
  const titleId = useId();
  return (
    <div className="workspace-frame">
      {/* From 40rem wide the column shows; below it a drawer opens. */}
      <style>{`
        .workspace-frame {
          container-type: inline-size;
          inline-size: 100%;
        }

        .workspace {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          min-block-size: 44rem;
          overflow: hidden;
          border: 1px solid var(--muxui-semantic-border-default);
          border-radius: var(--muxui-semantic-shape-container-radius);
        }

        .workspace-sidebar, .workspace-fold {
          display: none;
        }

        .workspace-bar {
          display: flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
        }

        .workspace-main {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-content-gap);
          padding: var(--muxui-semantic-layout-inset-xlarge);
          overflow-y: auto;
        }

        .workspace-switcher {
          display: flex;
          align-items: center;
          gap: var(--muxui-semantic-layout-control-gap);
          inline-size: 100%;
          padding: var(--muxui-semantic-layout-inset-tiny);
          border: 0;
          border-radius: var(--muxui-semantic-control-radius);
          background: transparent;
          color: inherit;
        }

        .workspace-switcher:hover {
          background-color: var(--muxui-semantic-surface-hover);
        }

        /* Forced colors drop the shadow ring; the outline stays. */
        .workspace-switcher:focus-visible {
          outline: 2px solid transparent;
          box-shadow: 0 0 0 2px var(--muxui-semantic-focus-inner), 0 0 0 4px var(--muxui-semantic-focus-ring);
        }

        .workspace-switcher .muxui-avatar {
          border-radius: var(--muxui-semantic-control-radius);
          background: var(--muxui-semantic-surface-track);
        }

        .workspace-links {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-block-size: 0;
        }

        .workspace-switcher svg {
          inline-size: 1rem;
          margin-inline-start: auto;
          color: var(--muxui-semantic-content-muted);
        }

        @container (min-width: 40rem) {
          .workspace {
            grid-template: minmax(0, 1fr) / auto minmax(0, 1fr);
          }

          .workspace-sidebar, .workspace-fold {
            display: flex;
          }

          .workspace-mobile {
            display: none;
          }
        }
      `}</style>
      <Sidebar.Provider shortcut="b">
        <div className="workspace">
          <div className="workspace-mobile">
            <Sidebar.MobileTrigger logo="Sample workspace">{navigation}</Sidebar.MobileTrigger>
          </div>
          <Sidebar.Root className="workspace-sidebar" aria-label="Workspace">{navigation}</Sidebar.Root>
          <section className="workspace-main" aria-labelledby={titleId}>
            <div className="workspace-bar">
              <Sidebar.Toggle className="workspace-fold" size="sm" />
              <Breadcrumbs aria-label="Breadcrumb" items={[{ id: 'projects', label: 'Projects', href: '#projects' }, { id: 'overview', label: 'Overview' }]} />
            </div>
            <Text as="h1" id={titleId} variant="heading" size="md">Overview</Text>
            <Text as="p" color="muted">This pane holds your page content.</Text>
          </section>
        </div>
      </Sidebar.Provider>
    </div>
  );
}
