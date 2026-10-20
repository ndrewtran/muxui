import { Avatar } from '@muxui/react';

function PersonGlyph() {
  return <svg viewBox="0 0 24 24" width="60%" height="60%" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0z" /></svg>;
}

export function AvatarFallbacksExample() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-s)', alignItems: 'center' }}>
      {/* Short abbreviations written in the person's own script, with no source image. */}
      <Avatar.Root aria-label="Ana Barros"><Avatar.Fallback>AB</Avatar.Fallback></Avatar.Root>
      <Avatar.Root aria-label="Ирина Петрова"><Avatar.Fallback>ИП</Avatar.Fallback></Avatar.Root>
      <Avatar.Root aria-label="田中 太郎"><Avatar.Fallback>田</Avatar.Fallback></Avatar.Root>
      <Avatar.Root aria-label="Workspace"><Avatar.Fallback>WS</Avatar.Fallback></Avatar.Root>
      {/* A generic glyph when no useful abbreviation exists. */}
      <Avatar.Root aria-label="Guest"><Avatar.Fallback><PersonGlyph /></Avatar.Fallback></Avatar.Root>
    </div>
  );
}
