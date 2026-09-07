import { Sidebar } from "@muxui/react";

export function BasicSidebarExample() {
  return <Sidebar.Root><Sidebar.Header>Mux</Sidebar.Header><Sidebar.NavList><Sidebar.NavItem href="/docs" current>Docs</Sidebar.NavItem></Sidebar.NavList></Sidebar.Root>;
}
