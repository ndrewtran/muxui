import { Avatar } from '@muxui/react';

export function BasicAvatarExample() {
  return <div>
    <Avatar.Root size="sm" aria-label="Andrew">
      <Avatar.Image src="/avatars/andrew.png" alt="Andrew" />
      <Avatar.Fallback>AB</Avatar.Fallback>
    </Avatar.Root>
    <Avatar.Root size="sm" aria-label="Workspace">
      <Avatar.Fallback>WS</Avatar.Fallback>
    </Avatar.Root>
  </div>;
}
