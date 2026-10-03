import React from 'react';
import { Avatar } from '../../src/supplemental/avatar.mjs';
import { Image } from '../../src/supplemental/image.mjs';

const h = React.createElement;
const validImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="8" height="8"%3E%3Crect width="8" height="8" fill="black"/%3E%3C/svg%3E';
const switchedImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="8" height="8"%3E%3Crect width="8" height="8" fill="white"/%3E%3C/svg%3E';

/** Consumer-shaped fixture for native media loading, recovery, and fallback semantics. */
export function ImageAvatarConsumerFixture() {
  const [imageSrc, setImageSrc] = React.useState('/missing-image.svg');
  const [avatarSrc, setAvatarSrc] = React.useState('/missing-avatar.svg');
  const [slowAvatarSrc, setSlowAvatarSrc] = React.useState('/slow-avatar.svg');
  const [imageErrors, setImageErrors] = React.useState(0);
  const [imageLoads, setImageLoads] = React.useState(0);
  const [avatarErrors, setAvatarErrors] = React.useState(0);
  const [avatarLoads, setAvatarLoads] = React.useState(0);

  React.useEffect(() => {
    window.__muxuiImageAvatarSwitch = () => {
      setImageSrc(switchedImage);
      setAvatarSrc(switchedImage);
    };
    window.__muxuiSlowAvatarSwitch = setSlowAvatarSrc;
    document.documentElement.dataset.imageAvatarReady = 'true';
    return () => {
      delete window.__muxuiImageAvatarSwitch;
      delete window.__muxuiSlowAvatarSwitch;
    };
  }, []);

  return h('main', { 'data-muxui-image-avatar-consumer': 'true' },
    h('section', { id: 'image-case' },
      h(Image, {
        src: imageSrc,
        fallbackSrc: validImage,
        alt: 'Workspace logo',
        width: 48,
        height: 32,
        radius: 'sm',
        onError: () => setImageErrors((count) => count + 1),
        onLoad: () => setImageLoads((count) => count + 1),
      }),
      // A square source in a 16:9 declared box; the server holds /slow-* until released.
      h(Image, {
        id: 'fit-image',
        src: '/slow-square.svg',
        alt: 'Square source',
        width: 320,
        height: 180,
        fit: 'cover',
      }),
      h(Image, {
        id: 'class-ratio-image',
        className: 'consumer-square',
        src: validImage,
        alt: '',
        width: 320,
        height: 180,
      }),
      h(Image, {
        id: 'cached-image',
        src: validImage,
        alt: 'Cached workspace logo',
        width: 8,
        height: 8,
      }),
      h('output', { id: 'image-errors' }, imageErrors),
      h('output', { id: 'image-loads' }, imageLoads),
    ),
    h('section', { id: 'avatar-case' },
      h(Avatar.Root, { size: 'md' },
        h(Avatar.Image, {
          src: avatarSrc,
          alt: 'Alex avatar',
          onError: () => setAvatarErrors((count) => count + 1),
          onLoad: () => setAvatarLoads((count) => count + 1),
        }),
        h(Avatar.Fallback, null, h('strong', null, 'AX')),
      ),
      h(Avatar.Root, { id: 'cached-avatar', size: 'sm' },
        h(Avatar.Image, { src: validImage, alt: 'Cached avatar' }),
        h(Avatar.Fallback, null, 'CA'),
      ),
      h(Avatar.Root, { id: 'slow-avatar', size: 'lg' },
        h(Avatar.Image, { src: slowAvatarSrc, alt: 'Sam avatar' }),
        h(Avatar.Fallback, null, 'SA'),
      ),
      h('output', { id: 'avatar-errors' }, avatarErrors),
      h('output', { id: 'avatar-loads' }, avatarLoads),
    ),
  );
}
