import { CommandPalette } from "@muxui/react";

export function BasicCommandPaletteExample() {
  return <CommandPalette.Root><CommandPalette.Trigger>Search</CommandPalette.Trigger><CommandPalette.Backdrop><CommandPalette.Popup aria-label="Command palette"><CommandPalette.Content><CommandPalette.Input aria-label="Search commands" /><CommandPalette.ListBox><CommandPalette.Item id="docs" title="Open docs" textValue="Open docs" /></CommandPalette.ListBox></CommandPalette.Content></CommandPalette.Popup></CommandPalette.Backdrop></CommandPalette.Root>;
}
