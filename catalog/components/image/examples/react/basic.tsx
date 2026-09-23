import { Image } from '@muxui/react';

export function BasicImageExample() {
  return <Image
    src="https://placehold.co/320x180/png?text=Workspace+overview"
    alt="Workspace overview"
    width={320}
    height={180}
    radius="md"
    fit="cover"
    fallbackSrc="/images/workspace-fallback.png"
  />;
}
