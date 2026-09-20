import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { ImageAvatarConsumerFixture } from './image-avatar-consumer-fixture.mjs';
import '/packages/react/generated/styles.css';

hydrateRoot(document.getElementById('root'), React.createElement(ImageAvatarConsumerFixture));

