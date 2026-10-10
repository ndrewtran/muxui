import { Sidebar } from "@muxui/react";

const icon = (path: string) => ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const Inbox = icon("M4 13l2-8h12l2 8v6H4zM4 13h5l1 2h4l1-2h5");
const Overview = icon("M4 4h16v16H4zM4 9h16M9 9v11");
const Roadmap = icon("M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14");
const Settings = icon("M4 8h9M17 8h3M4 16h3M11 16h9M15 5v6M9 13v6");

export function BasicSidebarExample() {
  return (
    <div style={{ width: "16rem", height: "30rem" }}>
      <Sidebar.Root aria-label="Workspace">
        <Sidebar.Header>
          <strong>Field team</strong>
          <Sidebar.Search />
        </Sidebar.Header>
        <Sidebar.NavList>
          <Sidebar.NavItem href="#inbox" icon={Inbox} badge="3">Inbox</Sidebar.NavItem>
          <Sidebar.NavItem href="#overview" icon={Overview} current>Overview</Sidebar.NavItem>
          <Sidebar.NavItem icon={Roadmap} items={[{ href: "#now", label: "Now" }, { href: "#next", label: "Next" }, { href: "#later", label: "Later" }]}>Roadmap</Sidebar.NavItem>
          <Sidebar.NavItem href="#settings" icon={Settings}>Settings</Sidebar.NavItem>
        </Sidebar.NavList>
        <Sidebar.AccountCard name="Sample user" email="sample@example.com" />
      </Sidebar.Root>
    </div>
  );
}
