import { HeaderNav } from "@muxui/react";

export function BasicHeaderNavExample() {
  return <HeaderNav.Root><HeaderNav.Logo href="/">Mux</HeaderNav.Logo><HeaderNav.Secondary><HeaderNav.NavButton href="/docs" current>Docs</HeaderNav.NavButton></HeaderNav.Secondary><HeaderNav.MobileTrigger><HeaderNav.NavButton href="/docs">Docs</HeaderNav.NavButton></HeaderNav.MobileTrigger></HeaderNav.Root>;
}
