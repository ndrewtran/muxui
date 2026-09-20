import { Image } from '@muxui/react';

export function BasicImageExample() {
  return <Image
    src="/images/workspace.png"
    alt="Workspace overview"
    width={320}
    height={180}
    radius="md"
    fit="cover"
    fallbackSrc="/images/workspace-fallback.png"
  />;
}
