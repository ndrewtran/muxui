import { Button, Popover, Text } from '@muxui/react';

export function PopoverColorSchemeExample() {
  return (
    // A light page with a preset theme. The Popover is a dark scope and copies the preset from its trigger's nearest
    // scope, so it opens as the dark version of the same palette.
    <div
      data-muxui-color-scheme="light"
      data-muxui-theme="monochrome-mountain-meadow"
      style={{ padding: 'var(--muxui-semantic-layout-inset-large)', backgroundColor: 'var(--muxui-semantic-surface-canvas)' }}
    >
      <Popover aria-label="Appearance" colorScheme="dark" trigger={<Button variant="neutral">Appearance</Button>}>
        <Text>This panel is dark on a light page.</Text>
        <Button slot="close">Done</Button>
      </Popover>
    </div>
  );
}
