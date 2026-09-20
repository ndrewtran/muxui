import { createRef } from 'react';
import { Avatar, Image } from '@muxui/react';

const imageRef = createRef<HTMLImageElement>();
const avatarRef = createRef<HTMLSpanElement>();
const avatarImageRef = createRef<HTMLImageElement>();

const image = <Image ref={imageRef} src="/logo.svg" alt="Mux logo" width={160} height={96} fit="contain" radius="md" loading="lazy" />;
const decorativeImage = <Image src="/pattern.svg" alt="" />;
const avatar = (
  <Avatar.Root ref={avatarRef} size="sm" aria-label="Workspace avatar">
    <Avatar.Image ref={avatarImageRef} src="/avatar.svg" alt="Workspace avatar" />
    <Avatar.Fallback><strong>WS</strong></Avatar.Fallback>
  </Avatar.Root>
);
const fallbackOnly = <Avatar.Root><Avatar.Fallback>WS</Avatar.Fallback></Avatar.Root>;
const unavailableAvatarImage = <Avatar.Image alt="Workspace avatar" />;
const decorativeAvatarImage = <Avatar.Image />;
void image;
void decorativeImage;
void avatar;
void fallbackOnly;
void unavailableAvatarImage;
void decorativeAvatarImage;

// The public Image API requires an explicit alt string, including the empty decorative value.
// @ts-expect-error Images must declare their accessible or decorative alt text.
const unnamedImage = <Image src="/logo.svg" />;
void unnamedImage;

// Mux owns the finite visual vocabulary for Image and Avatar.
// @ts-expect-error Image fit values are finite.
const invalidFit = <Image src="/logo.svg" alt="Logo" fit="stretch" />;
void invalidFit;
// @ts-expect-error Avatar sizes are finite.
const invalidAvatarSize = <Avatar.Root size="medium">WS</Avatar.Root>;
void invalidAvatarSize;
