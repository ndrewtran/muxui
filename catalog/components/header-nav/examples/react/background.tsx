import { Button, HeaderNav } from "@muxui/react";

export function BackgroundHeaderNavExample() {
  return <HeaderNav.Root variant="background"><HeaderNav.Logo href="/">Mux</HeaderNav.Logo><HeaderNav.Secondary><HeaderNav.NavButton href="/docs" current>Docs</HeaderNav.NavButton><HeaderNav.NavButton href="/components">Components</HeaderNav.NavButton></HeaderNav.Secondary><HeaderNav.Actions><Button>Sign in</Button></HeaderNav.Actions><HeaderNav.MobileTrigger><HeaderNav.NavButton href="/docs" current>Docs</HeaderNav.NavButton><HeaderNav.NavButton href="/components">Components</HeaderNav.NavButton></HeaderNav.MobileTrigger></HeaderNav.Root>;
}
