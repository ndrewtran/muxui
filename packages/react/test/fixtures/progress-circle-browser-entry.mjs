import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { ProgressCircleConsumerFixture } from './progress-circle-consumer-fixture.mjs';
import '/packages/react/generated/styles.css';

hydrateRoot(document.getElementById('root'), React.createElement(ProgressCircleConsumerFixture));
